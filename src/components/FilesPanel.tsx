import { HardDrive, Loader } from 'lucide-react';
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
  connecting: string | null;
  onOpen:     (host: Host) => void;
}

export default function FilesPanel({ hosts, connecting, onOpen }: Props) {
  return (
    <aside className="hosts-panel">
      <div className="hosts-panel__header">
        <span className="hosts-panel__title">Files</span>
      </div>

      <p className="files-panel__hint">Click a host to open SFTP browser</p>

      {hosts.length === 0 ? (
        <div className="hosts-panel__empty">
          <p>No hosts yet</p>
        </div>
      ) : (
        <>
          <div className="hosts-panel__section-label">HOSTS</div>
          <ul className="hosts-panel__list">
            {hosts.map((host) => (
              <li
                key={host.id}
                className="hosts-panel__item"
                onClick={() => onOpen(host)}
              >
                {connecting === host.id ? (
                  <Loader size={10} className="spin" style={{ flexShrink: 0 }} />
                ) : (
                  <span className="hosts-panel__dot" style={{ background: statusColor[host.status] }} />
                )}
                <div className="hosts-panel__info">
                  <span className="hosts-panel__name">{host.name}</span>
                  <span className="hosts-panel__addr">{host.config.username}@{host.config.host}</span>
                </div>
                <HardDrive size={13} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />
              </li>
            ))}
          </ul>
        </>
      )}
    </aside>
  );
}
