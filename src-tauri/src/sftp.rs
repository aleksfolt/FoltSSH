use std::io::{Read, Write};
use std::path::Path;

use base64::{engine::general_purpose::STANDARD as B64, Engine};
use tauri::State;

use crate::ssh::get_session;
use crate::types::FileEntry;
use crate::AppState;

fn rm_recursive(sftp: &ssh2::Sftp, p: &Path) -> Result<(), String> {
    match sftp.readdir(p) {
        Ok(entries) => {
            for (child, stat) in entries {
                if stat.file_type().is_dir() {
                    rm_recursive(sftp, &child)?;
                } else {
                    sftp.unlink(&child).map_err(|e| e.to_string())?;
                }
            }
            sftp.rmdir(p).map_err(|e| e.to_string())
        }
        Err(_) => sftp.unlink(p).map_err(|e| e.to_string()),
    }
}

#[tauri::command]
pub fn sftp_list(
    conn_id: String,
    path:    String,
    state:   State<AppState>,
) -> Result<Vec<FileEntry>, String> {
    let sess_arc = get_session(&conn_id, &state)?;
    let sess     = sess_arc.lock().unwrap();
    let sftp     = sess.sftp().map_err(|e| e.to_string())?;
    let entries  = sftp.readdir(Path::new(&path)).map_err(|e| format!("readdir: {e}"))?;

    let mut result: Vec<FileEntry> = entries
        .into_iter()
        .map(|(pb, stat)| FileEntry {
            name:        pb.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(),
            path:        pb.to_string_lossy().into_owned(),
            size:        stat.size.unwrap_or(0),
            is_dir:      stat.file_type().is_dir(),
            modified:    stat.mtime.unwrap_or(0),
            permissions: stat.perm.unwrap_or(0),
        })
        .collect();

    result.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then(a.name.cmp(&b.name)));
    Ok(result)
}

#[tauri::command]
pub fn sftp_exists(
    conn_id: String,
    path:    String,
    state:   State<AppState>,
) -> Result<bool, String> {
    let sess_arc = get_session(&conn_id, &state)?;
    let sess     = sess_arc.lock().unwrap();
    Ok(sess.sftp().map_err(|e| e.to_string())?.stat(Path::new(&path)).is_ok())
}

#[tauri::command]
pub fn sftp_mkdir(
    conn_id: String,
    path:    String,
    state:   State<AppState>,
) -> Result<(), String> {
    let sess_arc = get_session(&conn_id, &state)?;
    let sess     = sess_arc.lock().unwrap();
    sess.sftp()
        .map_err(|e| e.to_string())?
        .mkdir(Path::new(&path), 0o755)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn sftp_rm(
    conn_id: String,
    path:    String,
    state:   State<AppState>,
) -> Result<(), String> {
    let sess_arc = get_session(&conn_id, &state)?;
    let sess     = sess_arc.lock().unwrap();
    sess.sftp()
        .map_err(|e| e.to_string())?
        .unlink(Path::new(&path))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn sftp_rmdir(
    conn_id: String,
    path:    String,
    state:   State<AppState>,
) -> Result<(), String> {
    let sess_arc = get_session(&conn_id, &state)?;
    let sess     = sess_arc.lock().unwrap();
    sess.sftp()
        .map_err(|e| e.to_string())?
        .rmdir(Path::new(&path))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn sftp_rm_all(
    conn_id: String,
    path:    String,
    state:   State<AppState>,
) -> Result<(), String> {
    let sess_arc = get_session(&conn_id, &state)?;
    let sess     = sess_arc.lock().unwrap();
    let sftp     = sess.sftp().map_err(|e| e.to_string())?;
    rm_recursive(&sftp, Path::new(&path))
}

#[tauri::command]
pub fn sftp_rename(
    conn_id: String,
    from:    String,
    to:      String,
    state:   State<AppState>,
) -> Result<(), String> {
    let sess_arc = get_session(&conn_id, &state)?;
    let sess     = sess_arc.lock().unwrap();
    sess.sftp()
        .map_err(|e| e.to_string())?
        .rename(Path::new(&from), Path::new(&to), None)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn sftp_read(
    conn_id: String,
    path:    String,
    state:   State<AppState>,
) -> Result<String, String> {
    let sess_arc = get_session(&conn_id, &state)?;
    let sess     = sess_arc.lock().unwrap();
    let sftp     = sess.sftp().map_err(|e| e.to_string())?;
    let mut file = sftp.open(Path::new(&path)).map_err(|e| e.to_string())?;
    let mut buf  = Vec::new();
    file.read_to_end(&mut buf).map_err(|e| e.to_string())?;
    Ok(B64.encode(&buf))
}

#[tauri::command]
pub fn sftp_write(
    conn_id: String,
    path:    String,
    data:    String,
    state:   State<AppState>,
) -> Result<(), String> {
    let bytes    = B64.decode(data).map_err(|e| e.to_string())?;
    let sess_arc = get_session(&conn_id, &state)?;
    let sess     = sess_arc.lock().unwrap();
    let sftp     = sess.sftp().map_err(|e| e.to_string())?;
    let mut file = sftp.create(Path::new(&path)).map_err(|e| e.to_string())?;
    file.write_all(&bytes).map_err(|e| e.to_string())
}
