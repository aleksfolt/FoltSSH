export type HostStatus = 'online' | 'warning' | 'offline' | 'blue' | 'purple';
export type NavItem = 'hosts' | 'files' | 'keys' | 'settings';
export type MainView = 'terminal' | 'sftp' | 'empty';

export interface HostConfig {
  host: string;
  port: number;
  username: string;
  auth: AuthMethod;
}

export type AuthMethod =
  | { type: 'Password'; password: string }
  | { type: 'PrivateKey'; path: string; passphrase?: string };

export interface Host {
  id: string;
  name: string;
  config: HostConfig;
  status: HostStatus;
  connId?: string; // set after successful ssh_connect
}

export interface Group {
  id: string;
  name: string;
  count: number;
}

export interface Tab {
  id: string;
  hostId: string;
  hostName: string;
  view: 'terminal' | 'sftp';
  shellId?: string;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  exit_code: number;
}

export interface FileEntry {
  name: string;
  path: string;
  size: number;
  is_dir: boolean;
  modified: number;
  permissions: number;
}
