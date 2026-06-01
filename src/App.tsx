import { useState, useEffect } from 'react';
import './styles/base.css';
import './styles/nav.css';
import './styles/hosts-panel.css';
import './styles/tabs.css';
import './styles/terminal.css';
import './styles/sftp.css';
import './styles/dialog.css';
import './styles/settings.css';
import './styles/keys-panel.css';
import './styles/misc.css';
import IconNav from './components/IconNav';
import HostsPanel from './components/HostsPanel';
import TabBar from './components/TabBar';
import Terminal from './components/Terminal';
import SftpBrowser from './components/SftpBrowser';
import AddHostDialog from './components/AddHostDialog';
import EditHostDialog from './components/EditHostDialog';
import SettingsPanel from './components/SettingsPanel';
import FilesPanel from './components/FilesPanel';
import KeysPanel from './components/KeysPanel';
import { Host, NavItem, Tab, HostConfig } from './types';
import { hosts as hostsApi, ssh, StoredHost } from './api';
import { useSettings } from './hooks/useSettings';

type MainView = 'terminal' | 'sftp' | 'empty';
let tabCounter = 1;

function storedToHost(s: StoredHost): Host {
  return { id: s.id, name: s.name, config: s.config, status: 'offline' };
}

function App() {
  const { settings, update: updateSettings, reset: resetSettings } = useSettings();
  const [activeNav, setActiveNav]       = useState<NavItem>('hosts');
  const [hosts, setHosts]               = useState<Host[]>([]);
  const [selectedHost, setSelectedHost] = useState<Host | null>(null);
  const [tabs, setTabs]                 = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId]   = useState<string | null>(null);
  const [mainView, setMainView]         = useState<MainView>('empty');
  const [showAddHost, setShowAddHost]   = useState(false);
  const [editingHost, setEditingHost]   = useState<Host | null>(null);
  const [connecting, setConnecting]     = useState<string | null>(null);

  useEffect(() => {
    hostsApi.list().then((list) => setHosts(list.map(storedToHost))).catch(console.error);
  }, []);

  const isTerminal = mainView === 'terminal';
  const isSftp     = mainView === 'sftp';

  async function handleSelectHost(host: Host) {
    if (host.connId) { activateHost(host); return; }
    setConnecting(host.id);
    try {
      const connId = await ssh.connect(host.id);
      const connected: Host = { ...host, connId, status: 'online' };
      setHosts((prev) => prev.map((h) => (h.id === host.id ? connected : h)));
      activateHost(connected);
    } catch (e) {
      setHosts((prev) => prev.map((h) => (h.id === host.id ? { ...h, status: 'warning' } : h)));
      alert(`Connection failed:\n${e}`);
    } finally {
      setConnecting(null);
    }
  }

  async function handleOpenSftpForHost(host: Host) {
    let h = host;
    if (!h.connId) {
      setConnecting(h.id);
      try {
        const connId = await ssh.connect(h.id);
        h = { ...h, connId, status: 'online' };
        setHosts((prev) => prev.map((x) => (x.id === h.id ? h : x)));
      } catch (e) {
        setHosts((prev) => prev.map((x) => (x.id === h.id ? { ...x, status: 'warning' } : x)));
        alert(`Connection failed:\n${e}`);
        return;
      } finally {
        setConnecting(null);
      }
    }
    setSelectedHost(h);
    setActiveNav('hosts');
    const existing = tabs.find((t) => t.hostId === h.id && t.view === 'sftp');
    if (existing) { setActiveTabId(existing.id); setMainView('sftp'); return; }
    const id = String(tabCounter++);
    setTabs((prev) => [...prev, { id, hostId: h.id, hostName: `${h.name} — SFTP`, view: 'sftp' }]);
    setActiveTabId(id);
    setMainView('sftp');
  }

  function handleDisconnect(hostId: string) {
    setHosts((prev) => prev.map((h) =>
      h.id === hostId ? { ...h, status: 'warning', connId: undefined } : h,
    ));
  }

  function activateHost(host: Host) {
    setSelectedHost(host);
    const existing = tabs.find((t) => t.hostId === host.id && t.view === 'terminal');
    if (existing) { setActiveTabId(existing.id); setMainView('terminal'); return; }
    const id = String(tabCounter++);
    setTabs((prev) => [...prev, { id, hostId: host.id, hostName: host.name, view: 'terminal' }]);
    setActiveTabId(id);
    setMainView('terminal');
  }

  function openSftp() {
    if (!selectedHost?.connId) return;
    const existing = tabs.find((t) => t.hostId === selectedHost.id && t.view === 'sftp');
    if (existing) { setActiveTabId(existing.id); setMainView('sftp'); return; }
    const id = String(tabCounter++);
    setTabs((prev) => [...prev, { id, hostId: selectedHost.id, hostName: `${selectedHost.name} — SFTP`, view: 'sftp' }]);
    setActiveTabId(id);
    setMainView('sftp');
  }

  function closeTab(id: string) {
    const closing = tabs.find((t) => t.id === id);
    const next    = tabs.filter((t) => t.id !== id);
    setTabs(next);

    // если больше нет табов для этого хоста — дропаем соединение (если включено в настройках)
    if (closing && settings.disconnectOnTabClose) {
      const hasMoreTabs = next.some((t) => t.hostId === closing.hostId);
      if (!hasMoreTabs) {
        const host = hosts.find((h) => h.id === closing.hostId);
        if (host?.connId) {
          ssh.disconnect(host.connId).catch(() => {});
          setHosts((prev) => prev.map((h) =>
            h.id === closing.hostId ? { ...h, status: 'offline', connId: undefined } : h,
          ));
          if (selectedHost?.id === closing.hostId) setSelectedHost(null);
        }
      }
    }

    if (activeTabId === id) {
      const last = next[next.length - 1];
      setActiveTabId(last?.id ?? null);
      setMainView(last ? (last.view as MainView) : 'empty');
    }
  }

  function switchTab(id: string) {
    const tab = tabs.find((t) => t.id === id);
    if (!tab) return;
    setActiveTabId(id);
    setMainView(tab.view as MainView);
    const h = hosts.find((h) => h.id === tab.hostId);
    if (h) setSelectedHost(h);
  }

  async function handleAddHost(name: string, config: HostConfig) {
    try {
      const stored = await hostsApi.save(name, config);
      const host   = storedToHost(stored);
      setHosts((prev) => [...prev, host]);
      setShowAddHost(false);
      handleSelectHost(host);
    } catch (e) {
      alert(`Failed to save host:\n${e}`);
    }
  }

  async function handleEditHost(id: string, name: string, config: HostConfig) {
    try {
      await hostsApi.update(id, name, config);
      setHosts((prev) => prev.map((h) => h.id === id ? { ...h, name, config, connId: undefined, status: 'offline' } : h));
      setEditingHost(null);
    } catch (e) {
      alert(`Failed to update host:\n${e}`);
    }
  }

  async function handleDeleteHost(id: string) {
    try {
      await hostsApi.delete(id);
      setHosts((prev) => prev.filter((h) => h.id !== id));
      setTabs((prev) => prev.filter((t) => t.hostId !== id));
      if (selectedHost?.id === id) { setSelectedHost(null); setMainView('empty'); }
    } catch (e) {
      alert(`Failed to delete host:\n${e}`);
    }
  }

  return (
    <div className="app">
      <IconNav active={activeNav} onChange={setActiveNav} />

      {activeNav === 'hosts' && (
        <HostsPanel
          hosts={hosts}
          selectedId={selectedHost?.id ?? null}
          onSelect={handleSelectHost}
          onAdd={() => setShowAddHost(true)}
          onEdit={(h) => setEditingHost(h)}
          onDelete={handleDeleteHost}
        />
      )}
      {activeNav === 'files' && (
        <FilesPanel hosts={hosts} connecting={connecting} onOpen={handleOpenSftpForHost} />
      )}
      {activeNav === 'keys' && <KeysPanel />}

      {activeNav === 'settings' ? (
        <SettingsPanel
          settings={settings}
          onChange={updateSettings}
          onReset={resetSettings}
        />
      ) : (
        <div className="main">
          {tabs.length > 0 && (
            <TabBar
              tabs={tabs}
              activeTabId={activeTabId}
              onTabChange={switchTab}
              onTabClose={closeTab}
              onNewTab={() => selectedHost && activateHost(selectedHost)}
            />
          )}

          <div className="main__content">
            {mainView === 'empty' && (
              <div className="main__empty">
                <div className="main__empty-icon">⌨</div>
                <p className="main__empty-title">No active connection</p>
                <p className="main__empty-hint">
                  {hosts.length === 0 ? 'Click + to add your first host' : 'Select a host from the sidebar'}
                </p>
                {hosts.length === 0 && (
                  <button className="main__add-btn" onClick={() => setShowAddHost(true)}>Add Host</button>
                )}
              </div>
            )}

            {(isTerminal || isSftp) && selectedHost && (
              <div className="main__terminal-wrap">
                <div className="main__view-switcher">
                  <button
                    className={`main__view-btn${isTerminal ? ' main__view-btn--active' : ''}`}
                    onClick={() => {
                      const t = tabs.find((x) => x.hostId === selectedHost.id && x.view === 'terminal');
                      if (t) { setActiveTabId(t.id); setMainView('terminal'); } else activateHost(selectedHost);
                    }}
                  >Terminal</button>
                  <button
                    className={`main__view-btn${isSftp ? ' main__view-btn--active' : ''}`}
                    onClick={openSftp}
                    disabled={!selectedHost.connId}
                  >SFTP</button>
                </div>

                {tabs.filter((t) => t.view === 'terminal').map((tab) => {
                  const tabHost = hosts.find((h) => h.id === tab.hostId);
                  if (!tabHost) return null;
                  const active = activeTabId === tab.id && isTerminal;
                  return (
                    <div
                      key={tab.id}
                      style={active
                        ? { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }
                        : { display: 'none' }}
                    >
                      <Terminal
                        host={tabHost}
                        settings={settings}
                        onDisconnect={() => handleDisconnect(tabHost.id)}
                        isActive={active}
                      />
                    </div>
                  );
                })}

                {tabs.filter((t) => t.view === 'sftp').map((tab) => {
                  const tabHost = hosts.find((h) => h.id === tab.hostId);
                  if (!tabHost) return null;
                  const active = activeTabId === tab.id && isSftp;
                  return (
                    <div
                      key={tab.id}
                      style={active
                        ? { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }
                        : { display: 'none' }}
                    >
                      <SftpBrowser host={tabHost} onClose={() => closeTab(tab.id)} />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {connecting && (
        <div className="connecting-toast">
          <span className="connecting-toast__spinner" />
          Connecting…
        </div>
      )}

      {showAddHost && (
        <AddHostDialog
          onSave={handleAddHost}
          onClose={() => setShowAddHost(false)}
          defaultPort={settings.defaultPort}
          defaultUsername={settings.defaultUsername}
        />
      )}

      {editingHost && (
        <EditHostDialog
          host={{ id: editingHost.id, name: editingHost.name, config: editingHost.config }}
          onSave={handleEditHost}
          onClose={() => setEditingHost(null)}
        />
      )}
    </div>
  );
}

export default App;
