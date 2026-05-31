import { useState } from 'react';
import { Search, Plus, Pencil, Trash2 } from 'lucide-react';
import { Host, HostStatus } from '../types';

const statusColor: Record<HostStatus, string> = {
  online:  '#4caf50',
  warning: '#ffc107',
  offline: '#555566',
  blue:    '#2196f3',
  purple:  '#9c27b0',
};

interface Props {
  hosts: Host[];
  selectedId: string | null;
  onSelect:   (host: Host) => void;
  onAdd:      () => void;
  onEdit:     (host: Host) => void;
  onDelete:   (id: string) => void;
}

export default function HostsPanel({ hosts, selectedId, onSelect, onAdd, onEdit, onDelete }: Props) {
  const [query, setQuery] = useState('');

  const filtered = hosts.filter(
    (h) =>
      h.name.toLowerCase().includes(query.toLowerCase()) ||
      h.config.host.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <aside className="hosts-panel">
      <div className="hosts-panel__header">
        <span className="hosts-panel__title">Hosts</span>
        <button className="hosts-panel__add" title="Add host" onClick={onAdd}>
          <Plus size={16} />
        </button>
      </div>

      <div className="hosts-panel__search">
        <Search size={14} className="hosts-panel__search-icon" />
        <input
          type="text"
          placeholder="Search hosts..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {hosts.length === 0 ? (
        <div className="hosts-panel__empty">
          <p>No hosts yet</p>
          <button className="hosts-panel__empty-btn" onClick={onAdd}>
            <Plus size={13} /> Add your first host
          </button>
        </div>
      ) : (
        <>
          <div className="hosts-panel__section-label">HOSTS</div>
          <ul className="hosts-panel__list">
            {filtered.map((host) => (
              <li
                key={host.id}
                className={`hosts-panel__item${selectedId === host.id ? ' hosts-panel__item--active' : ''}`}
                onClick={() => onSelect(host)}
              >
                <span className="hosts-panel__dot" style={{ background: statusColor[host.status] }} />
                <div className="hosts-panel__info">
                  <span className="hosts-panel__name">{host.name}</span>
                  <span className="hosts-panel__addr">{host.config.username}@{host.config.host}</span>
                </div>
                <div className="hosts-panel__actions">
                  <button
                    className="hosts-panel__action-btn"
                    title="Edit host"
                    onClick={(e) => { e.stopPropagation(); onEdit(host); }}
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    className="hosts-panel__action-btn hosts-panel__action-btn--danger"
                    title="Remove host"
                    onClick={(e) => { e.stopPropagation(); onDelete(host.id); }}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </aside>
  );
}
