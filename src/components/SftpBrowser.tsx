import { useState, useEffect, useCallback, useRef } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open as dialogOpen } from '@tauri-apps/plugin-dialog';
import {
  ChevronLeft, ChevronRight, ChevronUp, RefreshCw, Square,
  FolderPlus, Trash2, Upload, Download, X, Loader, AlertCircle,
  List, LayoutGrid, AlignJustify,
} from 'lucide-react';
import { Host, FileEntry } from '../types';
import { sftp, localFs, LocalEntry } from '../api';
import ConflictDialog, { ConflictAction, ConflictResult } from './ConflictDialog';

interface Props {
  host: Host;
  onClose: () => void;
}

interface LocalUploadItem {
  localPath:  string;
  remotePath: string;
  name:       string;
}

interface Progress {
  current: number;
  total:   number;
  name:    string;
}

// ─── helpers ───────────────────────────────────────────────────────────────

function formatSize(bytes: number) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function formatDate(unix: number) {
  if (!unix) return '';
  return new Date(unix * 1000).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function nextAvailableName(name: string, n: number): string {
  const dot = name.lastIndexOf('.');
  if (dot === -1) return `${name}_${n}`;
  return `${name.slice(0, dot)}_${n}${name.slice(dot)}`;
}

// ─── component ─────────────────────────────────────────────────────────────

export default function SftpBrowser({ host, onClose }: Props) {
  const [path, setPath]         = useState('/');
  const [history, setHistory]   = useState<string[]>(['/']);
  const [histIdx, setHistIdx]   = useState(0);
  const [entries, setEntries]   = useState<FileEntry[]>([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  // Multi-select: Set of selected paths + last-clicked for Shift range
  const [selected, setSelected]           = useState<Set<string>>(new Set());
  const [lastClickedPath, setLastClickedPath] = useState<string | null>(null);

  const [pendingDelete, setPendingDelete] = useState<FileEntry[] | null>(null);

  const [viewMode, setViewMode]     = useState<'details' | 'list' | 'icons'>('details');
  const [dragActive, setDragActive] = useState(false);
  const [progress, setProgress]     = useState<Progress | null>(null);
  const [conflict, setConflict]     = useState<{
    name: string; isDir: boolean; resolve: (r: ConflictResult) => void;
  } | null>(null);
  const globalActionRef = useRef<ConflictAction | null>(null);

  const uploadRef = useRef<((paths: string[]) => Promise<void>) | null>(null);

  const loadDir = useCallback(async (p: string) => {
    if (!host.connId) return;
    setLoading(true);
    setError('');
    setSelected(new Set());
    setLastClickedPath(null);
    setPendingDelete(null);
    try {
      setEntries(await sftp.list(host.connId, p));
      setPath(p);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [host.connId]);

  useEffect(() => { loadDir('/'); }, [loadDir]);

  // ─── Tauri drag-drop window events ────────────────────────────────────

  useEffect(() => {
    let cancel: (() => void) | undefined;
    getCurrentWindow().onDragDropEvent(async (ev) => {
      const p = ev.payload as { type: string; paths?: string[] };
      if (p.type === 'enter' || p.type === 'over') {
        setDragActive(true);
      } else if (p.type === 'leave' || p.type === 'cancelled') {
        setDragActive(false);
      } else if (p.type === 'drop') {
        setDragActive(false);
        if (p.paths?.length && uploadRef.current) {
          await uploadRef.current(p.paths);
        }
      }
    }).then((fn) => { cancel = fn; });
    return () => { cancel?.(); };
  }, []);

  // ─── navigation ───────────────────────────────────────────────────────

  function navigate(p: string) {
    const next = [...history.slice(0, histIdx + 1), p];
    setHistory(next);
    setHistIdx(next.length - 1);
    loadDir(p);
  }

  // ─── row click with multi-select ──────────────────────────────────────

  function handleRowClick(e: React.MouseEvent, filePath: string) {
    if (e.shiftKey && lastClickedPath) {
      // Range select: add everything between lastClickedPath and filePath
      const paths = entries.map((en) => en.path);
      const a = paths.indexOf(lastClickedPath);
      const b = paths.indexOf(filePath);
      const [lo, hi] = a <= b ? [a, b] : [b, a];
      setSelected((prev) => {
        const next = new Set(prev);
        paths.slice(lo, hi + 1).forEach((p) => next.add(p));
        return next;
      });
    } else if (e.metaKey || e.ctrlKey) {
      // Toggle individual item
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(filePath)) next.delete(filePath); else next.add(filePath);
        return next;
      });
      setLastClickedPath(filePath);
    } else {
      // Plain click — single select
      setSelected(new Set([filePath]));
      setLastClickedPath(filePath);
    }
  }

  // ─── conflict resolution ───────────────────────────────────────────────

  function askConflict(name: string, isDir: boolean): Promise<ConflictResult> {
    return new Promise((resolve) => {
      setConflict({ name, isDir, resolve: (r) => { setConflict(null); resolve(r); } });
    });
  }

  async function resolveName(connId: string, dir: string, name: string): Promise<string | null> {
    const exists = await sftp.exists(connId, `${dir}/${name}`);
    if (!exists) return name;

    const global = globalActionRef.current;
    let action: ConflictAction;
    let applyToAll = false;

    if (global) {
      action = global;
    } else {
      const result = await askConflict(name, false);
      action = result.action;
      applyToAll = result.applyToAll;
      if (applyToAll) globalActionRef.current = action;
    }

    if (action === 'skip') return null;
    if (action === 'overwrite') return name;

    let n = 2;
    while (true) {
      const candidate = nextAvailableName(name, n);
      if (!await sftp.exists(connId, `${dir}/${candidate}`)) return candidate;
      n++;
    }
  }

  async function resolveDir(connId: string, dir: string, name: string): Promise<string | null> {
    const exists = await sftp.exists(connId, `${dir}/${name}`);
    if (!exists) return name;

    const global = globalActionRef.current;
    let action: ConflictAction;
    let applyToAll = false;

    if (global) {
      action = global;
    } else {
      const result = await askConflict(name, true);
      action = result.action;
      applyToAll = result.applyToAll;
      if (applyToAll) globalActionRef.current = action;
    }

    if (action === 'skip') return null;
    if (action === 'overwrite') return name;

    let n = 2;
    while (true) {
      const candidate = `${name}_${n}`;
      if (!await sftp.exists(connId, `${dir}/${candidate}`)) return candidate;
      n++;
    }
  }

  // ─── local FS collection ───────────────────────────────────────────────

  async function collectLocalFiles(
    localDir: string,
    remoteDir: string,
    items: LocalUploadItem[],
  ) {
    let entries: LocalEntry[];
    try { entries = await localFs.listDir(localDir); } catch { return; }
    for (const e of entries) {
      if (e.is_dir) {
        await collectLocalFiles(e.path, `${remoteDir}/${e.name}`, items);
      } else {
        items.push({ localPath: e.path, remotePath: remoteDir, name: e.name });
      }
    }
  }

  // ─── upload via Tauri paths ────────────────────────────────────────────

  async function uploadLocalPaths(localPaths: string[]) {
    const connId = host.connId;
    if (!connId) return;
    globalActionRef.current = null;

    const allItems: LocalUploadItem[] = [];

    for (const lp of localPaths) {
      const name = lp.replace(/\\/g, '/').split('/').pop() ?? lp;
      let isDir = false;
      try { await localFs.listDir(lp); isDir = true; } catch {}

      if (isDir) {
        const finalName = await resolveDir(connId, path, name);
        if (!finalName) continue;
        const remoteBase = `${path}/${finalName}`;
        try { await sftp.mkdir(connId, remoteBase); } catch {}
        await collectLocalFiles(lp, remoteBase, allItems);
      } else {
        allItems.push({ localPath: lp, remotePath: path, name });
      }
    }

    if (!allItems.length) return;

    const dirsToCreate = new Set<string>();
    for (const item of allItems) {
      let d = item.remotePath;
      while (d.length > path.length) {
        dirsToCreate.add(d);
        d = d.replace(/\/[^/]+$/, '') || '/';
      }
    }
    for (const d of [...dirsToCreate].sort((a, b) => a.length - b.length)) {
      try { await sftp.mkdir(connId, d); } catch {}
    }

    let done = 0;
    for (const item of allItems) {
      setProgress({ current: done + 1, total: allItems.length, name: item.name });
      const finalName = await resolveName(connId, item.remotePath, item.name);
      if (finalName === null) { done++; continue; }
      try {
        const b64 = await localFs.readFile(item.localPath);
        await sftp.write(connId, `${item.remotePath}/${finalName}`, b64);
      } catch (e) {
        console.error(`Upload failed: ${item.remotePath}/${finalName}`, e);
      }
      done++;
    }

    setProgress(null);
    loadDir(path);
  }

  uploadRef.current = uploadLocalPaths;

  // ─── upload via file picker ────────────────────────────────────────────

  async function handleUploadClick() {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.onchange = async () => {
      if (!input.files?.length || !host.connId) return;
      const connId = host.connId;
      globalActionRef.current = null;
      const files = Array.from(input.files);
      let done = 0;
      for (const file of files) {
        setProgress({ current: done + 1, total: files.length, name: file.name });
        const finalName = await resolveName(connId, path, file.name);
        if (finalName === null) { done++; continue; }
        const buf = await file.arrayBuffer();
        let bin = '';
        const u8 = new Uint8Array(buf);
        for (let i = 0; i < u8.length; i += 8192)
          bin += String.fromCharCode(...u8.subarray(i, i + 8192));
        try { await sftp.write(connId, `${path}/${finalName}`, btoa(bin)); }
        catch (e) { console.error(e); }
        done++;
      }
      setProgress(null);
      loadDir(path);
    };
    input.click();
  }

  // ─── download selected entries ─────────────────────────────────────────

  async function handleDownload() {
    const connId = host.connId;
    if (!connId || selected.size === 0) return;

    const destDir = await dialogOpen({ directory: true, multiple: false, title: 'Choose download folder' });
    if (!destDir || typeof destDir !== 'string') return;

    const selectedEntries = entries.filter((e) => selected.has(e.path));

    // Collect all (remotePath → localPath) pairs across files and folders
    interface DownloadItem { remotePath: string; localPath: string; }
    const items: DownloadItem[] = [];

    for (const entry of selectedEntries) {
      if (entry.is_dir) {
        try {
          const files = await sftp.listRecursive(connId, entry.path);
          for (const f of files) {
            items.push({
              remotePath: f.path,
              localPath:  [destDir, entry.name, f.relative].join('/'),
            });
          }
        } catch (e) {
          console.error('List failed:', entry.path, e);
        }
      } else {
        items.push({ remotePath: entry.path, localPath: `${destDir}/${entry.name}` });
      }
    }

    if (!items.length) return;

    let done = 0;
    for (const item of items) {
      setProgress({ current: done + 1, total: items.length, name: item.remotePath.split('/').pop() ?? '' });
      try {
        const b64 = await sftp.read(connId, item.remotePath);
        await localFs.writeFile(item.localPath, b64);
      } catch (e) {
        console.error('Download failed:', item.remotePath, e);
      }
      done++;
    }

    setProgress(null);
  }

  // ─── folder create ─────────────────────────────────────────────────────

  async function handleNewFolder() {
    if (!host.connId) return;
    const name = window.prompt('New folder name:');
    if (!name) return;
    try { await sftp.mkdir(host.connId, `${path}/${name}`); loadDir(path); }
    catch (e) { setError(String(e)); }
  }

  // ─── delete ────────────────────────────────────────────────────────────

  async function confirmDelete() {
    if (!host.connId || !pendingDelete) return;
    for (const entry of pendingDelete) {
      try { await sftp.rmAll(host.connId, entry.path); }
      catch (e) { setError(String(e)); }
    }
    setPendingDelete(null);
    setSelected(new Set());
    loadDir(path);
  }

  // ─── render ────────────────────────────────────────────────────────────

  const dirCount  = entries.filter((e) => e.is_dir).length;
  const fileCount = entries.filter((e) => !e.is_dir).length;
  const totalSize = entries.reduce((acc, e) => acc + e.size, 0);
  const hasSelection = selected.size > 0;

  return (
    <div className={`sftp${dragActive ? ' sftp--drag-over' : ''}`}>
      {dragActive && (
        <div className="sftp__drop-overlay">
          <div className="sftp__drop-hint">
            <Upload size={32} />
            <span>Drop to upload to {path}</span>
          </div>
        </div>
      )}

      {conflict && (
        <ConflictDialog
          name={conflict.name}
          isDir={conflict.isDir}
          onResolve={conflict.resolve}
        />
      )}

      {pendingDelete && (
        <div className="sftp__confirm-overlay" onClick={() => setPendingDelete(null)}>
          <div className="sftp__confirm-box" onClick={(e) => e.stopPropagation()}>
            <p className="sftp__confirm-msg">
              {pendingDelete.length === 1 ? (
                <>
                  Delete <strong>{pendingDelete[0].name}</strong>?
                  {pendingDelete[0].is_dir && (
                    <span className="sftp__confirm-sub"> (and all its contents)</span>
                  )}
                </>
              ) : (
                <>Delete <strong>{pendingDelete.length} items</strong>?</>
              )}
            </p>
            <div className="sftp__confirm-actions">
              <button className="sftp__confirm-btn sftp__confirm-btn--cancel" onClick={() => setPendingDelete(null)}>
                Cancel
              </button>
              <button className="sftp__confirm-btn sftp__confirm-btn--delete" onClick={confirmDelete}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="sftp__header">
        <span className="sftp__title">SFTP</span>
        <span className="sftp__subtitle">{host.config.username}@{host.config.host}</span>
        <button className="sftp__close" onClick={onClose}><X size={14} /></button>
      </div>

      <div className="sftp__path-bar">
        <span className="sftp__path">{path}</span>
      </div>

      <div className="sftp__toolbar">
        <button className="sftp__tb-btn" title="Back"
          onClick={() => { const p = history[histIdx - 1]; setHistIdx(histIdx - 1); loadDir(p); }}
          disabled={histIdx === 0}><ChevronLeft size={15}/></button>
        <button className="sftp__tb-btn" title="Forward"
          onClick={() => { const p = history[histIdx + 1]; setHistIdx(histIdx + 1); loadDir(p); }}
          disabled={histIdx >= history.length - 1}><ChevronRight size={15}/></button>
        <button className="sftp__tb-btn" title="Up"
          onClick={() => navigate(path.replace(/\/[^/]+$/, '') || '/')}
          disabled={path === '/'}><ChevronUp size={15}/></button>
        <button className="sftp__tb-btn" title="Refresh" onClick={() => loadDir(path)}><RefreshCw size={14}/></button>
        <button className="sftp__tb-btn" title="Deselect all" onClick={() => setSelected(new Set())}
          disabled={!hasSelection}><Square size={14}/></button>
        <div className="sftp__tb-sep"/>
        <button className="sftp__tb-btn" title="New Folder" onClick={handleNewFolder}><FolderPlus size={15}/></button>
        <button className="sftp__tb-btn" title="Upload Files" onClick={handleUploadClick}><Upload size={15}/></button>
        {hasSelection && (
          <>
            <button className="sftp__tb-btn" title={`Download ${selected.size} item${selected.size > 1 ? 's' : ''}`}
              onClick={handleDownload}>
              <Download size={15}/>
            </button>
            <button
              className="sftp__tb-btn sftp__tb-btn--danger"
              title={`Delete ${selected.size} item${selected.size > 1 ? 's' : ''}`}
              onClick={() => {
                const toDelete = entries.filter((e) => selected.has(e.path));
                if (toDelete.length) setPendingDelete(toDelete);
              }}
            >
              <Trash2 size={15}/>
            </button>
          </>
        )}

        <div className="sftp__tb-spacer" />
        <div className="sftp__tb-view-group">
          <button
            className={`sftp__tb-btn${viewMode === 'details' ? ' sftp__tb-btn--active' : ''}`}
            title="Details view"
            onClick={() => setViewMode('details')}
          ><AlignJustify size={14}/></button>
          <button
            className={`sftp__tb-btn${viewMode === 'list' ? ' sftp__tb-btn--active' : ''}`}
            title="List view"
            onClick={() => setViewMode('list')}
          ><List size={14}/></button>
          <button
            className={`sftp__tb-btn${viewMode === 'icons' ? ' sftp__tb-btn--active' : ''}`}
            title="Icons view"
            onClick={() => setViewMode('icons')}
          ><LayoutGrid size={14}/></button>
        </div>
      </div>

      {progress && (
        <div className="sftp__progress">
          <Loader size={12} className="spin"/>
          <span className="sftp__progress-name">{progress.name}</span>
          <span className="sftp__progress-count">{progress.current} / {progress.total}</span>
          <div className="sftp__progress-bar">
            <div
              className="sftp__progress-fill"
              style={{ width: `${(progress.current / progress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {viewMode === 'details' && (
        <div className="sftp__table-header">
          <span className="sftp__col sftp__col--name">Name ↑</span>
          <span className="sftp__col sftp__col--size">Size</span>
          <span className="sftp__col sftp__col--modified">Modified</span>
        </div>
      )}

      <div className="sftp__body">
        {loading && <div className="sftp__state"><Loader size={18} className="spin"/><span>Loading…</span></div>}
        {!loading && error && (
          <div className="sftp__state sftp__state--error"><AlertCircle size={18}/><span>{error}</span></div>
        )}
        {!loading && !error && viewMode === 'details' && (
          <ul className="sftp__list">
            {entries.map((f) => (
              <li
                key={f.path}
                className={`sftp__row${selected.has(f.path) ? ' sftp__row--selected' : ''}`}
                onClick={(e) => handleRowClick(e, f.path)}
                onDoubleClick={() => { if (f.is_dir) navigate(f.path); }}
              >
                <span className="sftp__col sftp__col--name">
                  <span className="sftp__icon">{f.is_dir ? '📁' : '📄'}</span>
                  {f.name}
                </span>
                <span className="sftp__col sftp__col--size">{f.is_dir ? '' : formatSize(f.size)}</span>
                <span className="sftp__col sftp__col--modified">{formatDate(f.modified)}</span>
              </li>
            ))}
          </ul>
        )}

        {!loading && !error && viewMode === 'list' && (
          <ul className="sftp__list sftp__list--compact">
            {entries.map((f) => (
              <li
                key={f.path}
                className={`sftp__row${selected.has(f.path) ? ' sftp__row--selected' : ''}`}
                onClick={(e) => handleRowClick(e, f.path)}
                onDoubleClick={() => { if (f.is_dir) navigate(f.path); }}
              >
                <span className="sftp__row-name">
                  <span className="sftp__icon">{f.is_dir ? '📁' : '📄'}</span>
                  {f.name}
                </span>
              </li>
            ))}
          </ul>
        )}

        {!loading && !error && viewMode === 'icons' && (
          <div className="sftp__grid">
            {entries.map((f) => (
              <div
                key={f.path}
                className={`sftp__grid-item${selected.has(f.path) ? ' sftp__grid-item--selected' : ''}`}
                onClick={(e) => handleRowClick(e, f.path)}
                onDoubleClick={() => { if (f.is_dir) navigate(f.path); }}
              >
                <span className="sftp__grid-icon">{f.is_dir ? '📁' : '📄'}</span>
                <span className="sftp__grid-name">{f.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="sftp__footer">
        <span>
          📁 {dirCount} folders, {fileCount} files
          {hasSelection && <span className="sftp__footer-sel"> · {selected.size} selected</span>}
        </span>
        <span>{formatSize(totalSize)}</span>
      </div>
    </div>
  );
}
