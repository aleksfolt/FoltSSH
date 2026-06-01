use std::collections::HashMap;
use std::sync::Mutex;

mod db;
mod fs;
mod sftp;
mod shell;
mod ssh;
mod window;
pub mod types;

use db::open_db;
use shell::ShellHandle;
use ssh::ActiveConn;

pub struct AppState {
    pub db:     Mutex<rusqlite::Connection>,
    pub shells: Mutex<HashMap<String, ShellHandle>>,
    pub conns:  Mutex<HashMap<String, ActiveConn>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            window::setup_window(app)?;
            Ok(())
        })
        .manage(AppState {
            db:     Mutex::new(open_db()),
            shells: Mutex::new(HashMap::new()),
            conns:  Mutex::new(HashMap::new()),
        })
        .invoke_handler(tauri::generate_handler![
            db::hosts_list,
            db::host_save,
            db::host_update,
            db::host_delete,
            ssh::ssh_connect,
            ssh::ssh_disconnect,
            ssh::ssh_exec,
            shell::shell_open,
            shell::shell_write,
            shell::shell_resize,
            shell::shell_close,
            sftp::sftp_list,
            sftp::sftp_exists,
            sftp::sftp_mkdir,
            sftp::sftp_rm,
            sftp::sftp_rmdir,
            sftp::sftp_rename,
            sftp::sftp_read,
            sftp::sftp_write,
            sftp::sftp_rm_all,
            fs::fs_read_local,
            fs::fs_list_local,
            fs::get_home_dir,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
