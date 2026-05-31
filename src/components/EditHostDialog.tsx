import { useState } from 'react';
import { X } from 'lucide-react';
import { HostConfig, AuthMethod } from '../types';
import { StoredHost } from '../api';

interface Props {
  host: StoredHost;
  onSave: (id: string, name: string, config: HostConfig) => void;
  onClose: () => void;
}

export default function EditHostDialog({ host, onSave, onClose }: Props) {
  const [name, setName]         = useState(host.name);
  const [hostname, setHostname] = useState(host.config.host);
  const [port, setPort]         = useState(String(host.config.port));
  const [username, setUsername] = useState(host.config.username);
  const [authType, setAuthType] = useState<'Password' | 'PrivateKey'>(
    host.config.auth.type,
  );
  const [password, setPassword] = useState(
    host.config.auth.type === 'Password' ? host.config.auth.password : '',
  );
  const [keyPath, setKeyPath]   = useState(
    host.config.auth.type === 'PrivateKey' ? host.config.auth.path : '',
  );
  const [passphrase, setPassphrase] = useState(
    host.config.auth.type === 'PrivateKey' ? (host.config.auth.passphrase ?? '') : '',
  );
  const [error, setError] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!hostname.trim() || !username.trim()) {
      setError('Host and username are required');
      return;
    }
    const auth: AuthMethod =
      authType === 'Password'
        ? { type: 'Password', password }
        : { type: 'PrivateKey', path: keyPath, passphrase: passphrase || undefined };
    const config: HostConfig = {
      host: hostname.trim(),
      port: parseInt(port) || 22,
      username: username.trim(),
      auth,
    };
    onSave(host.id, name.trim() || `${username}@${hostname}`, config);
  }

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog__header">
          <span className="dialog__title">Edit Host</span>
          <button className="dialog__close" onClick={onClose}><X size={15} /></button>
        </div>

        <form className="dialog__form" onSubmit={handleSubmit}>
          <label className="dialog__label">Label
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="My Server" />
          </label>

          <div className="dialog__row">
            <label className="dialog__label dialog__label--grow">Hostname / IP
              <input value={hostname} onChange={(e) => setHostname(e.target.value)} placeholder="192.168.1.1" required />
            </label>
            <label className="dialog__label dialog__label--port">Port
              <input value={port} onChange={(e) => setPort(e.target.value)} placeholder="22" />
            </label>
          </div>

          <label className="dialog__label">Username
            <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="root" required />
          </label>

          <div className="dialog__tabs">
            <button type="button" className={`dialog__tab${authType === 'Password'   ? ' dialog__tab--active' : ''}`} onClick={() => setAuthType('Password')}>Password</button>
            <button type="button" className={`dialog__tab${authType === 'PrivateKey' ? ' dialog__tab--active' : ''}`} onClick={() => setAuthType('PrivateKey')}>Private Key</button>
          </div>

          {authType === 'Password' ? (
            <label className="dialog__label">Password
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="leave blank to keep current" />
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
            <button type="submit" className="dialog__btn dialog__btn--save">Save Changes</button>
          </div>
        </form>
      </div>
    </div>
  );
}
