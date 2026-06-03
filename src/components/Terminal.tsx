import { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SearchAddon } from '@xterm/addon-search';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { Lock, AlertCircle, Loader, Search, X, ChevronUp, ChevronDown, RefreshCw } from 'lucide-react';
import { Host, AppSettings, DEFAULT_SETTINGS } from '../types';
import { buildTheme } from '../terminalThemes';
import { shell } from '../api';
import '@xterm/xterm/css/xterm.css';

interface Props {
  host:          Host;
  settings?:     AppSettings;
  onDisconnect?: () => void;
  isActive?:     boolean;
}

type State = 'connecting' | 'ready' | 'error' | 'closed';

export default function Terminal({ host, settings, onDisconnect, isActive }: Props) {
  const s = settings ?? DEFAULT_SETTINGS;

  const containerRef    = useRef<HTMLDivElement>(null);
  const xtermRef        = useRef<XTerm | null>(null);
  const fitRef          = useRef<FitAddon | null>(null);
  const searchRef       = useRef<SearchAddon | null>(null);
  const shellIdRef      = useRef<string | null>(null);
  const unlistenRef     = useRef<UnlistenFn[]>([]);
  const statusRef       = useRef<State>('connecting');
  const settingsRef     = useRef(s);
  const reconnectTimer  = useRef<ReturnType<typeof setInterval> | null>(null);
  const onDisconnectRef = useRef(onDisconnect);
  const searchInputRef  = useRef<HTMLInputElement>(null);

  settingsRef.current     = s;
  onDisconnectRef.current = onDisconnect;

  const [status, setStatus]     = useState<State>('connecting');
  const [errorMsg, setErrorMsg] = useState('');
  const [searchOpen, setSearchOpen]   = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  function updateStatus(st: State) {
    statusRef.current = st;
    setStatus(st);
  }

  // ── Shell open + event wiring ─────────────────────────────
  async function openShell(connId: string): Promise<UnlistenFn[]> {
    const term = xtermRef.current!;
    updateStatus('connecting');

    const sid = await shell.open(connId, term.cols, term.rows);
    shellIdRef.current = sid;

    const ul: UnlistenFn[] = [];

    ul.push(await listen<void>(`shell:ready:${sid}`, () => updateStatus('ready')));

    ul.push(await listen<string>(`shell:data:${sid}`, (ev) => {
      const bytes = Uint8Array.from(atob(ev.payload), (c) => c.charCodeAt(0));
      term.write(bytes);
    }));

    ul.push(await listen<void>(`shell:exit:${sid}`, () => {
      updateStatus('closed');
      term.writeln('\r\n\x1b[33m[Connection closed]\x1b[0m');
      ul.forEach((u) => u());
      unlistenRef.current = [];

      const cfg = settingsRef.current;
      if (cfg.autoReconnect) {
        let remaining = cfg.reconnectDelay;
        term.write(`\r\x1b[33m[Reconnecting in ${remaining}s…]\x1b[0m\x1b[K`);
        reconnectTimer.current = setInterval(async () => {
          remaining--;
          if (remaining > 0) {
            term.write(`\r\x1b[33m[Reconnecting in ${remaining}s…]\x1b[0m\x1b[K`);
          } else {
            clearInterval(reconnectTimer.current!);
            reconnectTimer.current = null;
            term.write('\r\x1b[33m[Reconnecting…]\x1b[0m\x1b[K');
            try {
              unlistenRef.current = await openShell(connId);
            } catch {
              term.writeln('\r\n\x1b[31m[Reconnect failed]\x1b[0m');
              // keep showing "closed" so user can retry manually
            }
          }
        }, 1000);
      }
      // else: stay in "closed" state, user can click Reconnect
    }));

    ul.push(await listen<string>(`shell:error:${sid}`, (ev) => {
      updateStatus('error');
      setErrorMsg(ev.payload);
      ul.forEach((u) => u());
      unlistenRef.current = [];
      // stay in "error" state, user can click Reconnect
    }));

    return ul;
  }

  // ── Mount: create XTerm + open first shell ────────────────
  useEffect(() => {
    if (!containerRef.current || !host.connId) return;

    const cfg = settingsRef.current;
    const term = new XTerm({
      theme:            buildTheme(cfg.terminalTheme, cfg.terminalOpacity),
      fontFamily:       `'${cfg.fontFamily}', 'JetBrains Mono', Menlo, monospace`,
      fontSize:         cfg.fontSize,
      lineHeight:       1.4,
      cursorBlink:      cfg.cursorBlink,
      cursorStyle:      cfg.cursorStyle,
      allowProposedApi: true,
      scrollback:       cfg.scrollback,
    });

    const fit    = new FitAddon();
    const search = new SearchAddon();
    term.loadAddon(fit);
    term.loadAddon(search);
    term.loadAddon(new WebLinksAddon());
    term.open(containerRef.current);
    fit.fit();
    xtermRef.current  = term;
    fitRef.current    = fit;
    searchRef.current = search;

    const connId = host.connId!;

    openShell(connId)
      .then((ul) => { unlistenRef.current = ul; })
      .catch((e) => { updateStatus('error'); setErrorMsg(String(e)); });

    term.onSelectionChange(() => {
      if (settingsRef.current.copyOnSelect && term.hasSelection()) {
        navigator.clipboard.writeText(term.getSelection()).catch(() => {});
      }
    });

    term.onData((data) => {
      if (!shellIdRef.current || statusRef.current === 'closed' || statusRef.current === 'error') return;
      shell.write(shellIdRef.current, Array.from(new TextEncoder().encode(data))).catch(console.error);
    });

    const ro = new ResizeObserver(() => {
      if (!fitRef.current || !shellIdRef.current) return;
      fitRef.current.fit();
      shell.resize(shellIdRef.current, term.cols, term.rows).catch(console.error);
    });
    ro.observe(containerRef.current);

    // Ctrl+F — open search
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setSearchOpen(true);
        setTimeout(() => searchInputRef.current?.focus(), 50);
      }
      if (e.key === 'Escape') {
        setSearchOpen(false);
        setSearchQuery('');
      }
    };
    window.addEventListener('keydown', onKey);

    return () => {
      window.removeEventListener('keydown', onKey);
      if (reconnectTimer.current) { clearInterval(reconnectTimer.current); reconnectTimer.current = null; }
      ro.disconnect();
      unlistenRef.current.forEach((u) => u());
      if (shellIdRef.current) shell.close(shellIdRef.current).catch(() => {});
      term.dispose();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host.connId]);

  // ── Re-fit when tab becomes visible after display:none ───────
  useEffect(() => {
    if (isActive) setTimeout(() => fitRef.current?.fit(), 0);
  }, [isActive]);

  // ── Live-update XTerm options without restart ─────────────
  useEffect(() => {
    const term = xtermRef.current;
    if (!term) return;
    term.options.fontSize    = s.fontSize;
    term.options.fontFamily  = `'${s.fontFamily}', 'JetBrains Mono', Menlo, monospace`;
    term.options.cursorBlink = s.cursorBlink;
    term.options.cursorStyle = s.cursorStyle;
    term.options.scrollback  = s.scrollback;
    term.options.theme       = buildTheme(s.terminalTheme, s.terminalOpacity);
    fitRef.current?.fit();
  }, [s.fontSize, s.fontFamily, s.cursorBlink, s.cursorStyle,
      s.copyOnSelect, s.terminalTheme, s.terminalOpacity, s.scrollback]);

  function handleSearchChange(q: string) {
    setSearchQuery(q);
    if (q) searchRef.current?.findNext(q, { incremental: true, caseSensitive: false });
  }

  function closeSearch() {
    setSearchOpen(false);
    setSearchQuery('');
    xtermRef.current?.focus();
  }

  async function handleReconnect() {
    if (!host.connId) return;
    if (status !== 'closed' && status !== 'error') return;
    // Re-start the shell on the existing xterm
    try {
      const ul = await openShell(host.connId);
      unlistenRef.current = ul;
      setErrorMsg('');
    } catch (e) {
      setErrorMsg(String(e));
    }
  }

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="terminal">
      <div className="terminal__conn-bar">
        <span className="terminal__conn-text">
          ssh {host.config.username}@{host.config.host}:{host.config.port}
        </span>
        <span className={`terminal__conn-badge terminal__conn-badge--${status}`}>
          {status === 'connecting' && <><Loader size={10} className="spin" /> connecting</>}
          {status === 'ready'      && <><Lock   size={10} /> connected</>}
          {status === 'closed'     && 'closed'}
          {status === 'error'      && <><AlertCircle size={10} /> error</>}
        </span>
        {(status === 'closed' || status === 'error') && (
          <button className="terminal__reconnect-btn" onClick={handleReconnect} title="Reconnect">
            <RefreshCw size={12} /> Reconnect
          </button>
        )}
      </div>

      {status === 'error' && (
        <div className="terminal__error-banner">
          <AlertCircle size={14} />
          {errorMsg}
        </div>
      )}

      <div className="terminal__body-wrap">
        {searchOpen && (
          <div className="term-search">
            <Search size={13} className="term-search__icon" />
            <input
              ref={searchInputRef}
              className="term-search__input"
              placeholder="Find…"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter')  searchRef.current?.findNext(searchQuery, { caseSensitive: false });
                if (e.key === 'Escape') closeSearch();
              }}
            />
            <button
              className="term-search__nav"
              title="Previous (Shift+Enter)"
              onClick={() => searchRef.current?.findPrevious(searchQuery, { caseSensitive: false })}
            >
              <ChevronUp size={13} />
            </button>
            <button
              className="term-search__nav"
              title="Next (Enter)"
              onClick={() => searchRef.current?.findNext(searchQuery, { caseSensitive: false })}
            >
              <ChevronDown size={13} />
            </button>
            <button className="term-search__close" onClick={closeSearch}>
              <X size={13} />
            </button>
          </div>
        )}
        <div ref={containerRef} className="terminal__body" />
      </div>
    </div>
  );
}
