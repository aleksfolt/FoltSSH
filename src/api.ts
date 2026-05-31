import { invoke } from '@tauri-apps/api/core';
import type { HostConfig, ExecResult, FileEntry } from './types';

export interface LocalEntry {
  name:   string;
  path:   string;
  is_dir: boolean;
}

export interface StoredHost {
  id: string;
  name: string;
  config: HostConfig;
}

export const hosts = {
  list:   ()                                         => invoke<StoredHost[]>('hosts_list'),
  save:   (name: string, config: HostConfig)        => invoke<StoredHost>('host_save', { name, config }),
  update: (id: string, name: string, config: HostConfig) => invoke<void>('host_update', { id, name, config }),
  delete: (id: string)                              => invoke<void>('host_delete', { id }),
};

export const ssh = {
  connect:    (hostId: string) => invoke<string>('ssh_connect', { hostId }),
  disconnect: (connId: string) => invoke<void>('ssh_disconnect', { connId }),
  exec:       (connId: string, command: string) =>
                invoke<ExecResult>('ssh_exec', { connId, command }),
};

export const shell = {
  open:   (connId: string, cols: number, rows: number) =>
            invoke<string>('shell_open', { connId, cols, rows }),
  write:  (shellId: string, data: number[]) =>
            invoke<void>('shell_write', { shellId, data }),
  resize: (shellId: string, cols: number, rows: number) =>
            invoke<void>('shell_resize', { shellId, cols, rows }),
  close:  (shellId: string) => invoke<void>('shell_close', { shellId }),
};

export const localFs = {
  readFile: (path: string) => invoke<string>('fs_read_local', { path }),
  listDir:  (path: string) => invoke<LocalEntry[]>('fs_list_local', { path }),
};

export const sftp = {
  list:   (connId: string, path: string)               => invoke<FileEntry[]>('sftp_list', { connId, path }),
  exists: (connId: string, path: string)               => invoke<boolean>('sftp_exists', { connId, path }),
  mkdir:  (connId: string, path: string)               => invoke<void>('sftp_mkdir', { connId, path }),
  rm:     (connId: string, path: string)               => invoke<void>('sftp_rm', { connId, path }),
  rmdir:  (connId: string, path: string)               => invoke<void>('sftp_rmdir', { connId, path }),
  rmAll:  (connId: string, path: string)               => invoke<void>('sftp_rm_all', { connId, path }),
  rename: (connId: string, from: string, to: string)   => invoke<void>('sftp_rename', { connId, from, to }),
  read:   (connId: string, path: string)               => invoke<string>('sftp_read', { connId, path }),
  write:  (connId: string, path: string, data: string) => invoke<void>('sftp_write', { connId, path, data }),
};
