import { useState, useEffect } from 'react';
import { Copy, Check, KeyRound, Loader, AlertCircle } from 'lucide-react';
import { localFs, sys } from '../api';

interface KeyEntry {
  name:       string;
  privatePath: string;
  publicPath?: string;
  publicText?: string;
}

function keyType(name: string): string {
  if (name.includes('ed25519')) return 'Ed25519';
  if (name.includes('ecdsa'))   return 'ECDSA';
  if (name.includes('rsa'))     return 'RSA';
  if (name.includes('dsa'))     return 'DSA';
  return 'Key';
}

const SKIP = new Set(['known_hosts', 'config', 'authorized_keys', 'environment']);

export default function KeysPanel() {
  const [keys, setKeys]       = useState<KeyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [copied, setCopied]   = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const home = await sys.homeDir();
        if (!home) { setError('Cannot determine home directory'); setLoading(false); return; }
        const sshDir = `${home}/.ssh`;
        const entries = await localFs.listDir(sshDir);

        const pubFiles = new Set(
          entries.filter((e) => e.name.endsWith('.pub')).map((e) => e.name),
        );
        const privFiles = entries.filter(
          (e) => !e.name.endsWith('.pub') && !e.is_dir && !SKIP.has(e.name),
        );

        const keyList: KeyEntry[] = await Promise.all(
          privFiles.map(async (e) => {
            const pubName = `${e.name}.pub`;
            let publicText: string | undefined;
            if (pubFiles.has(pubName)) {
              try {
                const b64 = await localFs.readFile(`${sshDir}/${pubName}`);
                publicText = atob(b64).trim();
              } catch {}
            }
            return {
              name:        e.name,
              privatePath: e.path,
              publicPath:  pubFiles.has(pubName) ? `${sshDir}/${pubName}` : undefined,
              publicText,
            };
          }),
        );

        setKeys(keyList);
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function copyPublicKey(key: KeyEntry) {
    if (!key.publicText) return;
    await navigator.clipboard.writeText(key.publicText);
    setCopied(key.name);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <aside className="hosts-panel">
      <div className="hosts-panel__header">
        <span className="hosts-panel__title">SSH Keys</span>
      </div>

      <p className="files-panel__hint">Keys from ~/.ssh/</p>

      <div className="keys-panel__body">
        {loading && (
          <div className="hosts-panel__empty" style={{ flexDirection: 'row', gap: 8 }}>
            <Loader size={14} className="spin" /><span>Loading…</span>
          </div>
        )}

        {!loading && error && (
          <div className="hosts-panel__empty" style={{ flexDirection: 'row', gap: 8, color: '#ef5350' }}>
            <AlertCircle size={14} /><span>{error}</span>
          </div>
        )}

        {!loading && !error && keys.length === 0 && (
          <div className="hosts-panel__empty">
            <p>No keys found in ~/.ssh/</p>
          </div>
        )}

        {!loading && !error && keys.map((key) => (
          <div key={key.name} className="key-entry">
            <div className="key-entry__row">
              <KeyRound size={14} className="key-entry__icon" />
              <div className="key-entry__info">
                <span className="key-entry__name">{key.name}</span>
                <span className="key-entry__type">{keyType(key.name)}</span>
              </div>
              {key.publicText && (
                <button
                  className="key-entry__copy"
                  title="Copy public key"
                  onClick={() => copyPublicKey(key)}
                >
                  {copied === key.name
                    ? <Check size={13} style={{ color: '#4caf50' }} />
                    : <Copy size={13} />}
                </button>
              )}
            </div>
            {key.publicText && (
              <div className="key-entry__pub">{key.publicText}</div>
            )}
          </div>
        ))}
      </div>
    </aside>
  );
}
