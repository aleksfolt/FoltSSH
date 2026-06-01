import { useState } from 'react';
import { X } from 'lucide-react';
import { HostConfig, AuthMethod } from '../types';

interface Props {
  onSave:           (name: string, config: HostConfig) => void;
  onClose:          () => void;
  defaultPort?:     string;
  defaultUsername?: string;
}

export default function AddHostDialog({ onSave, onClose, defaultPort = '22', defaultUsername = '' }: Props) {
  const [name, setName]         = useState('');
  const [host, setHost]         = useState('');
  const [port, setPort]         = useState(defaultPort);
  const [username, setUsername] = useState(defaultUsername);
  const [group, setGroup]       = useState('');
  const [authType, setAuthType] = useState<'Password' | 'PrivateKey'>('Password');
  const [password, setPassword] = useState('');
  const [keyPath, setKeyPath]   = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [error, setError]       = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!host.trim() || !username.trim()) {
      setError('Host and username are required');
      return;
    }

    const auth: AuthMethod =
      authType === 'Password'
        ? { type: 'Password', password }
        : { type: 'PrivateKey', path: keyPath, passphrase: passphrase || undefined };

    const config: HostConfig = {
      host:     host.trim(),
      port:     parseInt(port) || 22,
      username: username.trim(),
      auth,
      group:    group.trim() || undefined,
    };

    const displayName = name.trim() || `${username}@${host}`;
    onSave(displayName, config);
  }

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog__header">
          <span className="dialog__title">New Host</span>
          <button className="dialog__close" onClick={onClose}><X size={15} /></button>
        </div>

        <form className="dialog__form" onSubmit={handleSubmit}>
          <div className="dialog__row">
            <label className="dialog__label dialog__label--grow">Label (optional)
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="My Server" />
            </label>
            <label className="dialog__label" style={{ minWidth: 110 }}>Group
              <input value={group} onChange={(e) => setGroup(e.target.value)} placeholder="Production" />
            </label>
          </div>

          <div className="dialog__row">
            <label className="dialog__label dialog__label--grow">Hostname / IP
              <input value={host} onChange={(e) => setHost(e.target.value)} placeholder="192.168.1.1" required />
            </label>
            <label className="dialog__label dialog__label--port">Port
              <input value={port} onChange={(e) => setPort(e.target.value)} placeholder="22" />
            </label>
          </div>

          <label className="dialog__label">Username
            <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="root" required />
          </label>

          <div className="dialog__tabs">
            <button
              type="button"
              className={`dialog__tab${authType === 'Password' ? ' dialog__tab--active' : ''}`}
              onClick={() => setAuthType('Password')}
            >Password</button>
            <button
              type="button"
              className={`dialog__tab${authType === 'PrivateKey' ? ' dialog__tab--active' : ''}`}
              onClick={() => setAuthType('PrivateKey')}
            >Private Key</button>
          </div>

          {authType === 'Password' ? (
            <label className="dialog__label">Password
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
            </label>
          ) : (
            <>
              <label className="dialog__label">Key path
                <input value={keyPath} onChange={(e) => setKeyPath(e.target.value)} placeholder="~/.ssh/id_rsa" />
              </label>
              <label className="dialog__label">Passphrase (optional)
                <input type="password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} placeholder="••••••••" />
              </label>
            </>
          )}

          {error && <p className="dialog__error">{error}</p>}

          <div className="dialog__actions">
            <button type="button" className="dialog__btn dialog__btn--cancel" onClick={onClose}>Cancel</button>
            <button type="submit" className="dialog__btn dialog__btn--save">Save Host</button>
          </div>
        </form>
      </div>
    </div>
  );
}
