import { useState } from 'react';

export type ConflictAction = 'overwrite' | 'skip' | 'copy';

export interface ConflictResult {
  action: ConflictAction;
  applyToAll: boolean;
}

interface Props {
  name: string;
  isDir: boolean;
  onResolve: (result: ConflictResult) => void;
}

export default function ConflictDialog({ name, isDir, onResolve }: Props) {
  const [applyToAll, setApplyToAll] = useState(false);

  function resolve(action: ConflictAction) {
    onResolve({ action, applyToAll });
  }

  function addSuffix(n: string) {
    const dot = n.lastIndexOf('.');
    if (dot === -1) return `${n}_2`;
    return `${n.slice(0, dot)}_2${n.slice(dot)}`;
  }

  return (
    <div className="dialog-overlay">
      <div className="cd">
        <p className="cd__title">Already exists</p>
        <p className="cd__msg">
          <span className="cd__kind">{isDir ? 'Folder' : 'File'}</span>
          {' '}<strong className="cd__name">"{name}"</strong>{' '}
          already exists in this location.
        </p>

        <div className="cd__options">
          <button className="cd__opt" onClick={() => resolve('overwrite')}>
            <span className="cd__opt-label">Overwrite</span>
            <span className="cd__opt-sub">Replace existing {isDir ? 'folder' : 'file'}</span>
          </button>
          <button className="cd__opt" onClick={() => resolve('copy')}>
            <span className="cd__opt-label">Keep copy</span>
            <span className="cd__opt-sub">Save as {isDir ? `${name}_2` : addSuffix(name)}</span>
          </button>
          <button className="cd__opt cd__opt--skip" onClick={() => resolve('skip')}>
            <span className="cd__opt-label">Skip</span>
            <span className="cd__opt-sub">Don't upload this {isDir ? 'folder' : 'file'}</span>
          </button>
        </div>

        <label className="cd__all">
          <input
            type="checkbox"
            checked={applyToAll}
            onChange={(e) => setApplyToAll(e.target.checked)}
          />
          <span>Apply to all conflicts</span>
        </label>
      </div>
    </div>
  );
}
