import { useState } from 'react';
import { Search, Plus, Pencil, Trash2, ChevronDown, ChevronRight, FolderOpen } from 'lucide-react';
import { Host, HostStatus } from '../types';

const statusColor: Record<HostStatus, string> = {
  online:  '#4caf50',
  warning: '#ffc107',
  offline: '#555566',
  blue:    '#2196f3',
  purple:  '#9c27b0',
};

interface Props {
  hosts:      Host[];
  selectedId: string | null;
  onSelect:   (host: Host) => void;
  onAdd:      () => void;
  onEdit:     (host: Host) => void;
  onDelete:   (id: string) => void;
}

export default function HostsPanel({ hosts, selectedId, onSelect, onAdd, onEdit, onDelete }: Props) {
  const [query, setQuery]                   = useState('');
  const [collapsed, setCollapsed]           = useState<Set<string>>(new Set());

  const filtered = hosts.filter(
    (h) =>
      h.name.toLowerCase().includes(query.toLowerCase()) ||
      h.config.host.toLowerCase().includes(query.toLowerCase()),
  );

  // Group hosts: ungrouped → null key, grouped → group name
  const groupMap = new Map<string | null, Host[]>();
  groupMap.set(null, []);
  for (const h of filtered) {
    const g = h.config.group?.trim() || null;
    if (!groupMap.has(g)) groupMap.set(g, []);
    groupMap.get(g)!.push(h);
  }

  const ungrouped = groupMap.get(null) ?? [];
  const groups = [...groupMap.entries()].filter(([k]) => k !== null) as [string, Host[]][];
  groups.sort(([a], [b]) => a.localeCompare(b));

  function toggleGroup(name: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  }

  function renderHost(host: Host) {
    return (
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
    );
  }

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
        <div className="hosts-panel__scroll">
          {/* Ungrouped hosts */}
          {ungrouped.length > 0 && (
            <>
              <div className="hosts-panel__section-label">HOSTS</div>
              <ul className="hosts-panel__list">{ungrouped.map(renderHost)}</ul>
            </>
          )}

          {/* Named groups */}
          {groups.map(([name, groupHosts]) => (
            <div key={name} className="hosts-panel__group">
              <button
                className="hosts-panel__group-header"
                onClick={() => toggleGroup(name)}
              >
                <FolderOpen size={12} className="hosts-panel__group-icon" />
                <span className="hosts-panel__group-name">{name}</span>
                <span className="hosts-panel__group-count">{groupHosts.length}</span>
                {collapsed.has(name)
                  ? <ChevronRight size={12} className="hosts-panel__group-chevron" />
                  : <ChevronDown  size={12} className="hosts-panel__group-chevron" />}
              </button>
              {!collapsed.has(name) && (
                <ul className="hosts-panel__list hosts-panel__list--nested">
                  {groupHosts.map(renderHost)}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}
