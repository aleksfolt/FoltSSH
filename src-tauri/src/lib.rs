use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::Path;
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::Duration;

use base64::{engine::general_purpose::STANDARD as B64, Engine};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use ssh2::Session;
use tauri::{AppHandle, Emitter, Manager, State};
use uuid::Uuid;

// ─── Types ───────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HostConfig {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth: AuthMethod,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum AuthMethod {
    Password { password: String },
    PrivateKey { path: String, passphrase: Option<String> },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredHost {
    pub id: String,
    pub name: String,
    pub config: HostConfig,
}

#[derive(Debug, Serialize)]
pub struct ExecResult {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
}

#[derive(Debug, Serialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub is_dir: bool,
    pub modified: u64,
    pub permissions: u32,
}

enum ShellCmd {
    Write(Vec<u8>),
    Resize(u32, u32),
    Close,
}

struct ShellHandle {
    cmd_tx: mpsc::Sender<ShellCmd>,
}

// Живая SSH сессия, переиспользуется для всех SFTP/exec операций
struct ActiveConn {
    config:  HostConfig,
    session: Arc<Mutex<Session>>,
}

pub struct AppState {
    db:     Mutex<Connection>,
    shells: Mutex<HashMap<String, ShellHandle>>,
    conns:  Mutex<HashMap<String, ActiveConn>>,
}

// ─── DB ───────────────────────────────────────────────────────────────────────

fn open_db() -> Connection {
    let dir = dirs::data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("FoltSSH");
    std::fs::create_dir_all(&dir).ok();
    let conn = Connection::open(dir.join("hosts.db")).expect("Cannot open DB");
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS hosts (
            id      TEXT PRIMARY KEY,
            name    TEXT NOT NULL,
            config  TEXT NOT NULL
        );",
    )
    .expect("Cannot create table");
    conn
}

// ─── SSH helpers ──────────────────────────────────────────────────────────────

fn make_session(config: &HostConfig) -> Result<Session, String> {
    let tcp = TcpStream::connect((config.host.as_str(), config.port))
        .map_err(|e| format!("TCP connect: {e}"))?;
    tcp.set_read_timeout(Some(Duration::from_secs(15))).ok();
    tcp.set_write_timeout(Some(Duration::from_secs(15))).ok();

    let mut sess = Session::new().map_err(|e| format!("Session: {e}"))?;
    sess.set_tcp_stream(tcp);
    sess.handshake().map_err(|e| format!("Handshake: {e}"))?;

    match &config.auth {
        AuthMethod::Password { password } => {
            sess.userauth_password(&config.username, password)
                .map_err(|e| format!("Auth: {e}"))?;
        }
        AuthMethod::PrivateKey { path, passphrase } => {
            sess.userauth_pubkey_file(
                &config.username,
                None,
                Path::new(path),
                passphrase.as_deref(),
            )
            .map_err(|e| format!("Key auth: {e}"))?;
        }
    }
    if !sess.authenticated() {
        return Err("Authentication failed".into());
    }
    Ok(sess)
}

/// Получить живую сессию из стора, при необходимости переподключиться
fn get_session(conn_id: &str, state: &State<AppState>) -> Result<Arc<Mutex<Session>>, String> {
    let conns = state.conns.lock().unwrap();
    let conn  = conns.get(conn_id)
        .ok_or_else(|| format!("Connection '{conn_id}' not found — reconnect the host"))?;
    Ok(conn.session.clone())
}

fn get_config(conn_id: &str, state: &State<AppState>) -> Result<HostConfig, String> {
    let conns = state.conns.lock().unwrap();
    conns.get(conn_id)
        .map(|c| c.config.clone())
        .ok_or_else(|| format!("Connection '{conn_id}' not found"))
}

// ─── Host CRUD ────────────────────────────────────────────────────────────────

#[tauri::command]
fn hosts_list(state: State<AppState>) -> Result<Vec<StoredHost>, String> {
    let db   = state.db.lock().unwrap();
    let mut stmt = db
        .prepare("SELECT id, name, config FROM hosts ORDER BY rowid")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| Ok((r.get::<_,String>(0)?, r.get::<_,String>(1)?, r.get::<_,String>(2)?)))
        .map_err(|e| e.to_string())?;

    let mut hosts = Vec::new();
    for row in rows {
        let (id, name, cfg) = row.map_err(|e| e.to_string())?;
        let config: HostConfig = serde_json::from_str(&cfg).map_err(|e| e.to_string())?;
        hosts.push(StoredHost { id, name, config });
    }
    Ok(hosts)
}

#[tauri::command]
fn host_save(name: String, config: HostConfig, state: State<AppState>) -> Result<StoredHost, String> {
    let id  = Uuid::new_v4().to_string();
    let cfg = serde_json::to_string(&config).map_err(|e| e.to_string())?;
    state.db.lock().unwrap()
        .execute("INSERT INTO hosts (id, name, config) VALUES (?1,?2,?3)", params![id, name, cfg])
        .map_err(|e| e.to_string())?;
    Ok(StoredHost { id, name, config })
}

#[tauri::command]
fn host_update(id: String, name: String, config: HostConfig, state: State<AppState>) -> Result<(), String> {
    let cfg = serde_json::to_string(&config).map_err(|e| e.to_string())?;
    state.db.lock().unwrap()
        .execute("UPDATE hosts SET name=?1, config=?2 WHERE id=?3", params![name, cfg, id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn host_delete(id: String, state: State<AppState>) -> Result<(), String> {
    state.db.lock().unwrap()
        .execute("DELETE FROM hosts WHERE id=?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ─── SSH connect / disconnect ─────────────────────────────────────────────────

#[tauri::command]
fn ssh_connect(host_id: String, state: State<AppState>) -> Result<String, String> {
    let config: HostConfig = {
        let db = state.db.lock().unwrap();
        let cfg_json: String = db
            .query_row("SELECT config FROM hosts WHERE id=?1", params![host_id], |r| r.get(0))
            .map_err(|_| format!("Host '{host_id}' not found in DB"))?;
        serde_json::from_str(&cfg_json).map_err(|e| e.to_string())?
    };

    let sess = make_session(&config)?; // создаём и СОХРАНЯЕМ сессию
    let conn_id = Uuid::new_v4().to_string();
    state.conns.lock().unwrap().insert(conn_id.clone(), ActiveConn {
        config,
        session: Arc::new(Mutex::new(sess)),
    });
    Ok(conn_id)
}

#[tauri::command]
fn ssh_disconnect(conn_id: String, state: State<AppState>) {
    state.conns.lock().unwrap().remove(&conn_id);
}

#[tauri::command]
fn ssh_exec(conn_id: String, command: String, state: State<AppState>) -> Result<ExecResult, String> {
    let sess_arc = get_session(&conn_id, &state)?;
    let sess     = sess_arc.lock().unwrap();

    let mut ch = sess.channel_session().map_err(|e| e.to_string())?;
    ch.exec(&command).map_err(|e| e.to_string())?;

    let mut stdout = String::new();
    ch.read_to_string(&mut stdout).ok();
    let mut stderr = String::new();
    ch.stderr().read_to_string(&mut stderr).ok();
    ch.wait_close().ok();

    Ok(ExecResult { stdout, stderr, exit_code: ch.exit_status().unwrap_or(-1) })
}

// ─── Shell / PTY ──────────────────────────────────────────────────────────────

#[tauri::command]
fn shell_open(
    conn_id: String,
    cols: u32,
    rows: u32,
    state: State<AppState>,
    app: AppHandle,
) -> Result<String, String> {
    // shell использует собственную сессию чтобы не блокировать sftp/exec
    let config   = get_config(&conn_id, &state)?;
    let shell_id = Uuid::new_v4().to_string();
    let (cmd_tx, cmd_rx) = mpsc::channel::<ShellCmd>();

    let sid = shell_id.clone();
    thread::spawn(move || {
        macro_rules! bail {
            ($msg:expr) => {{ app.emit(&format!("shell:error:{sid}"), $msg.to_string()).ok(); return; }};
        }

        let tcp = match TcpStream::connect((config.host.as_str(), config.port)) {
            Ok(t) => t, Err(e) => bail!(e),
        };
        let mut sess = match Session::new() { Ok(s) => s, Err(e) => bail!(e) };
        sess.set_tcp_stream(tcp);
        if let Err(e) = sess.handshake() { bail!(e); }
        match &config.auth {
            AuthMethod::Password { password } => {
                if sess.userauth_password(&config.username, password).is_err() { bail!("Auth failed"); }
            }
            AuthMethod::PrivateKey { path, passphrase } => {
                if sess.userauth_pubkey_file(&config.username, None, Path::new(path), passphrase.as_deref()).is_err() {
                    bail!("Key auth failed");
                }
            }
        }
        if !sess.authenticated() { bail!("Authentication failed"); }

        let mut ch = match sess.channel_session() { Ok(c) => c, Err(e) => bail!(e) };
        if let Err(e) = ch.request_pty("xterm-256color", None, Some((cols, rows, 0, 0))) { bail!(e); }
        if let Err(e) = ch.shell() { bail!(e); }

        sess.set_blocking(false);
        app.emit(&format!("shell:ready:{sid}"), ()).ok();

        let mut buf = [0u8; 8192];
        'main: loop {
            loop {
                match cmd_rx.try_recv() {
                    Ok(ShellCmd::Write(data)) => {
                        let mut w = 0;
                        let mut r = 0;
                        while w < data.len() && r < 200 {
                            match ch.write(&data[w..]) {
                                Ok(n) => { w += n; r = 0; }
                                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                                    thread::sleep(Duration::from_millis(1)); r += 1;
                                }
                                Err(_) => break 'main,
                            }
                        }
                    }
                    Ok(ShellCmd::Resize(c, r)) => { ch.request_pty_size(c, r, None, None).ok(); }
                    Ok(ShellCmd::Close) | Err(mpsc::TryRecvError::Disconnected) => break 'main,
                    Err(mpsc::TryRecvError::Empty) => break,
                }
            }
            match ch.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => { app.emit(&format!("shell:data:{sid}"), B64.encode(&buf[..n])).ok(); }
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    thread::sleep(Duration::from_millis(10));
                }
                Err(_) => break,
            }
            if ch.eof() { break; }
        }
        app.emit(&format!("shell:exit:{sid}"), ()).ok();
    });

    state.shells.lock().unwrap().insert(shell_id.clone(), ShellHandle { cmd_tx });
    Ok(shell_id)
}

#[tauri::command]
fn shell_write(shell_id: String, data: Vec<u8>, state: State<AppState>) -> Result<(), String> {
    state.shells.lock().unwrap()
        .get(&shell_id).ok_or_else(|| format!("Shell '{shell_id}' not found"))?
        .cmd_tx.send(ShellCmd::Write(data)).map_err(|e| e.to_string())
}

#[tauri::command]
fn shell_resize(shell_id: String, cols: u32, rows: u32, state: State<AppState>) -> Result<(), String> {
    state.shells.lock().unwrap()
        .get(&shell_id).ok_or_else(|| format!("Shell '{shell_id}' not found"))?
        .cmd_tx.send(ShellCmd::Resize(cols, rows)).map_err(|e| e.to_string())
}

#[tauri::command]
fn shell_close(shell_id: String, state: State<AppState>) {
    if let Some(h) = state.shells.lock().unwrap().remove(&shell_id) {
        h.cmd_tx.send(ShellCmd::Close).ok();
    }
}

// ─── SFTP — все операции переиспользуют одну сессию ──────────────────────────

fn sftp_rm_recursive(sftp: &ssh2::Sftp, p: &Path) -> Result<(), String> {
    match sftp.readdir(p) {
        Ok(entries) => {
            for (child, stat) in entries {
                if stat.file_type().is_dir() {
                    sftp_rm_recursive(sftp, &child)?;
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
fn sftp_rm_all(conn_id: String, path: String, state: State<AppState>) -> Result<(), String> {
    let sess_arc = get_session(&conn_id, &state)?;
    let sess     = sess_arc.lock().unwrap();
    let sftp     = sess.sftp().map_err(|e| e.to_string())?;
    sftp_rm_recursive(&sftp, Path::new(&path))
}

#[tauri::command]
fn sftp_list(conn_id: String, path: String, state: State<AppState>) -> Result<Vec<FileEntry>, String> {
    let sess_arc = get_session(&conn_id, &state)?;
    let sess     = sess_arc.lock().unwrap();
    let sftp     = sess.sftp().map_err(|e| e.to_string())?;
    let entries  = sftp.readdir(Path::new(&path)).map_err(|e| format!("readdir: {e}"))?;

    let mut result: Vec<FileEntry> = entries.into_iter().map(|(pb, stat)| FileEntry {
        name:        pb.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(),
        path:        pb.to_string_lossy().into_owned(),
        size:        stat.size.unwrap_or(0),
        is_dir:      stat.file_type().is_dir(),
        modified:    stat.mtime.unwrap_or(0),
        permissions: stat.perm.unwrap_or(0),
    }).collect();

    result.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then(a.name.cmp(&b.name)));
    Ok(result)
}

#[tauri::command]
fn sftp_exists(conn_id: String, path: String, state: State<AppState>) -> Result<bool, String> {
    let sess_arc = get_session(&conn_id, &state)?;
    let sess     = sess_arc.lock().unwrap();
    Ok(sess.sftp().map_err(|e| e.to_string())?.stat(Path::new(&path)).is_ok())
}

#[tauri::command]
fn sftp_mkdir(conn_id: String, path: String, state: State<AppState>) -> Result<(), String> {
    let sess_arc = get_session(&conn_id, &state)?;
    let sess     = sess_arc.lock().unwrap();
    sess.sftp().map_err(|e| e.to_string())?.mkdir(Path::new(&path), 0o755).map_err(|e| e.to_string())
}

#[tauri::command]
fn sftp_rm(conn_id: String, path: String, state: State<AppState>) -> Result<(), String> {
    let sess_arc = get_session(&conn_id, &state)?;
    let sess     = sess_arc.lock().unwrap();
    sess.sftp().map_err(|e| e.to_string())?.unlink(Path::new(&path)).map_err(|e| e.to_string())
}

#[tauri::command]
fn sftp_rmdir(conn_id: String, path: String, state: State<AppState>) -> Result<(), String> {
    let sess_arc = get_session(&conn_id, &state)?;
    let sess     = sess_arc.lock().unwrap();
    sess.sftp().map_err(|e| e.to_string())?.rmdir(Path::new(&path)).map_err(|e| e.to_string())
}

#[tauri::command]
fn sftp_rename(conn_id: String, from: String, to: String, state: State<AppState>) -> Result<(), String> {
    let sess_arc = get_session(&conn_id, &state)?;
    let sess     = sess_arc.lock().unwrap();
    sess.sftp().map_err(|e| e.to_string())?.rename(Path::new(&from), Path::new(&to), None).map_err(|e| e.to_string())
}

#[tauri::command]
fn sftp_read(conn_id: String, path: String, state: State<AppState>) -> Result<String, String> {
    let sess_arc = get_session(&conn_id, &state)?;
    let sess     = sess_arc.lock().unwrap();
    let sftp     = sess.sftp().map_err(|e| e.to_string())?;
    let mut file = sftp.open(Path::new(&path)).map_err(|e| e.to_string())?;
    let mut buf  = Vec::new();
    file.read_to_end(&mut buf).map_err(|e| e.to_string())?;
    Ok(B64.encode(&buf))
}

#[tauri::command]
fn sftp_write(conn_id: String, path: String, data: String, state: State<AppState>) -> Result<(), String> {
    let bytes    = B64.decode(data).map_err(|e| e.to_string())?;
    let sess_arc = get_session(&conn_id, &state)?;
    let sess     = sess_arc.lock().unwrap();
    let sftp     = sess.sftp().map_err(|e| e.to_string())?;
    let mut file = sftp.create(Path::new(&path)).map_err(|e| e.to_string())?;
    file.write_all(&bytes).map_err(|e| e.to_string())
}

// ─── Local FS (for DnD upload) ────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct LocalEntry {
    pub name:   String,
    pub path:   String,
    pub is_dir: bool,
}

#[tauri::command]
fn fs_read_local(path: String) -> Result<String, String> {
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    Ok(B64.encode(&bytes))
}

#[tauri::command]
fn fs_list_local(path: String) -> Result<Vec<LocalEntry>, String> {
    let rd = std::fs::read_dir(&path).map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for entry in rd {
        let e = entry.map_err(|e| e.to_string())?;
        let is_dir = e.metadata().map(|m| m.is_dir()).unwrap_or(false);
        out.push(LocalEntry {
            name:   e.file_name().to_string_lossy().into_owned(),
            path:   e.path().to_string_lossy().into_owned(),
            is_dir,
        });
    }
    Ok(out)
}

// ─── Window geometry persistence ─────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone)]
struct WindowGeom {
    width:  u32,
    height: u32,
    x:      i32,
    y:      i32,
}

impl Default for WindowGeom {
    fn default() -> Self { Self { width: 1100, height: 700, x: 0, y: 0 } }
}

fn geom_path() -> std::path::PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("FoltSSH")
        .join("window.json")
}

fn load_geom() -> WindowGeom {
    std::fs::read_to_string(geom_path())
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_geom(g: &WindowGeom) {
    if let Ok(json) = serde_json::to_string(g) {
        std::fs::write(geom_path(), json).ok();
    }
}

// ─── Entry point ──────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            if let Some(win) = app.get_webview_window("main") {
                let geom = load_geom();
                win.set_size(tauri::Size::Physical(tauri::PhysicalSize {
                    width:  geom.width,
                    height: geom.height,
                })).ok();
                if geom.x != 0 || geom.y != 0 {
                    win.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
                        x: geom.x,
                        y: geom.y,
                    })).ok();
                }

                let saved = Arc::new(Mutex::new(geom));
                let saved_ev = saved.clone();
                win.on_window_event(move |e| {
                    match e {
                        tauri::WindowEvent::Resized(size) if size.width > 100 => {
                            let mut g = saved_ev.lock().unwrap();
                            g.width  = size.width;
                            g.height = size.height;
                        }
                        tauri::WindowEvent::Moved(pos) => {
                            let mut g = saved_ev.lock().unwrap();
                            g.x = pos.x;
                            g.y = pos.y;
                        }
                        tauri::WindowEvent::CloseRequested { .. }
                        | tauri::WindowEvent::Destroyed => {
                            save_geom(&saved_ev.lock().unwrap());
                        }
                        _ => {}
                    }
                });
            }
            Ok(())
        })
        .manage(AppState {
            db:     Mutex::new(open_db()),
            shells: Mutex::new(HashMap::new()),
            conns:  Mutex::new(HashMap::new()),
        })
        .invoke_handler(tauri::generate_handler![
            hosts_list, host_save, host_update, host_delete,
            ssh_connect, ssh_disconnect, ssh_exec,
            shell_open, shell_write, shell_resize, shell_close,
            sftp_list, sftp_exists, sftp_mkdir, sftp_rm, sftp_rmdir,
            sftp_rename, sftp_read, sftp_write, sftp_rm_all,
            fs_read_local, fs_list_local,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
