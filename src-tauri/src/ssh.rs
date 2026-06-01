use std::io::Read;
use std::net::TcpStream;
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use rusqlite::params;
use ssh2::Session;
use tauri::State;
use uuid::Uuid;

use crate::types::{AuthMethod, ExecResult, HostConfig};
use crate::AppState;

pub struct ActiveConn {
    pub config:  HostConfig,
    pub session: Arc<Mutex<Session>>,
}

pub fn make_session(config: &HostConfig) -> Result<Session, String> {
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

pub fn get_session(
    conn_id: &str,
    state:   &State<AppState>,
) -> Result<Arc<Mutex<Session>>, String> {
    let conns = state.conns.lock().unwrap();
    conns
        .get(conn_id)
        .map(|c| c.session.clone())
        .ok_or_else(|| format!("Connection '{conn_id}' not found — reconnect the host"))
}

pub fn get_config(conn_id: &str, state: &State<AppState>) -> Result<HostConfig, String> {
    let conns = state.conns.lock().unwrap();
    conns
        .get(conn_id)
        .map(|c| c.config.clone())
        .ok_or_else(|| format!("Connection '{conn_id}' not found"))
}

#[tauri::command]
pub fn ssh_connect(host_id: String, state: State<AppState>) -> Result<String, String> {
    let config: HostConfig = {
        let db = state.db.lock().unwrap();
        let cfg_json: String = db
            .query_row(
                "SELECT config FROM hosts WHERE id = ?1",
                params![host_id],
                |r| r.get(0),
            )
            .map_err(|_| format!("Host '{host_id}' not found in DB"))?;
        serde_json::from_str(&cfg_json).map_err(|e| e.to_string())?
    };

    let sess    = make_session(&config)?;
    let conn_id = Uuid::new_v4().to_string();
    state.conns.lock().unwrap().insert(
        conn_id.clone(),
        ActiveConn { config, session: Arc::new(Mutex::new(sess)) },
    );
    Ok(conn_id)
}

#[tauri::command]
pub fn ssh_disconnect(conn_id: String, state: State<AppState>) {
    state.conns.lock().unwrap().remove(&conn_id);
}

#[tauri::command]
pub fn ssh_exec(
    conn_id: String,
    command: String,
    state:   State<AppState>,
) -> Result<ExecResult, String> {
    let sess_arc = get_session(&conn_id, &state)?;
    let sess     = sess_arc.lock().unwrap();

    let mut ch = sess.channel_session().map_err(|e| e.to_string())?;
    ch.exec(&command).map_err(|e| e.to_string())?;

    let mut stdout = String::new();
    ch.read_to_string(&mut stdout).ok();
    let mut stderr = String::new();
    ch.stderr().read_to_string(&mut stderr).ok();
    ch.wait_close().ok();

    Ok(ExecResult {
        stdout,
        stderr,
        exit_code: ch.exit_status().unwrap_or(-1),
    })
}
