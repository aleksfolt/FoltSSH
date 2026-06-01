use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::Path;
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

use base64::{engine::general_purpose::STANDARD as B64, Engine};
use ssh2::Session;
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

use crate::ssh::get_config;
use crate::types::AuthMethod;
use crate::AppState;

pub enum ShellCmd {
    Write(Vec<u8>),
    Resize(u32, u32),
    Close,
}

pub struct ShellHandle {
    pub cmd_tx: mpsc::Sender<ShellCmd>,
}

#[tauri::command]
pub fn shell_open(
    conn_id: String,
    cols:    u32,
    rows:    u32,
    state:   State<AppState>,
    app:     AppHandle,
) -> Result<String, String> {
    let config   = get_config(&conn_id, &state)?;
    let shell_id = Uuid::new_v4().to_string();
    let (cmd_tx, cmd_rx) = mpsc::channel::<ShellCmd>();

    let sid = shell_id.clone();
    thread::spawn(move || {
        macro_rules! bail {
            ($msg:expr) => {{
                app.emit(&format!("shell:error:{sid}"), $msg.to_string()).ok();
                return;
            }};
        }

        let tcp = match TcpStream::connect((config.host.as_str(), config.port)) {
            Ok(t)  => t,
            Err(e) => bail!(e),
        };
        let mut sess = match Session::new() {
            Ok(s)  => s,
            Err(e) => bail!(e),
        };
        sess.set_tcp_stream(tcp);
        if let Err(e) = sess.handshake() { bail!(e); }

        match &config.auth {
            AuthMethod::Password { password } => {
                if sess.userauth_password(&config.username, password).is_err() {
                    bail!("Auth failed");
                }
            }
            AuthMethod::PrivateKey { path, passphrase } => {
                if sess
                    .userauth_pubkey_file(
                        &config.username,
                        None,
                        Path::new(path),
                        passphrase.as_deref(),
                    )
                    .is_err()
                {
                    bail!("Key auth failed");
                }
            }
        }
        if !sess.authenticated() { bail!("Authentication failed"); }

        let mut ch = match sess.channel_session() {
            Ok(c)  => c,
            Err(e) => bail!(e),
        };
        if let Err(e) = ch.request_pty("xterm-256color", None, Some((cols, rows, 0, 0))) {
            bail!(e);
        }
        if let Err(e) = ch.shell() { bail!(e); }

        sess.set_blocking(false);
        app.emit(&format!("shell:ready:{sid}"), ()).ok();

        let mut buf = [0u8; 8192];
        'main: loop {
            loop {
                match cmd_rx.try_recv() {
                    Ok(ShellCmd::Write(data)) => {
                        let mut written = 0;
                        let mut retries = 0;
                        while written < data.len() && retries < 200 {
                            match ch.write(&data[written..]) {
                                Ok(n) => { written += n; retries = 0; }
                                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                                    thread::sleep(Duration::from_millis(1));
                                    retries += 1;
                                }
                                Err(_) => break 'main,
                            }
                        }
                    }
                    Ok(ShellCmd::Resize(c, r)) => {
                        ch.request_pty_size(c, r, None, None).ok();
                    }
                    Ok(ShellCmd::Close) | Err(mpsc::TryRecvError::Disconnected) => break 'main,
                    Err(mpsc::TryRecvError::Empty) => break,
                }
            }

            match ch.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    app.emit(&format!("shell:data:{sid}"), B64.encode(&buf[..n])).ok();
                }
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    thread::sleep(Duration::from_millis(10));
                }
                Err(_) => break,
            }
            if ch.eof() { break; }
        }
        app.emit(&format!("shell:exit:{sid}"), ()).ok();
    });

    state
        .shells
        .lock()
        .unwrap()
        .insert(shell_id.clone(), ShellHandle { cmd_tx });
    Ok(shell_id)
}

#[tauri::command]
pub fn shell_write(
    shell_id: String,
    data:     Vec<u8>,
    state:    State<AppState>,
) -> Result<(), String> {
    state
        .shells
        .lock()
        .unwrap()
        .get(&shell_id)
        .ok_or_else(|| format!("Shell '{shell_id}' not found"))?
        .cmd_tx
        .send(ShellCmd::Write(data))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn shell_resize(
    shell_id: String,
    cols:     u32,
    rows:     u32,
    state:    State<AppState>,
) -> Result<(), String> {
    state
        .shells
        .lock()
        .unwrap()
        .get(&shell_id)
        .ok_or_else(|| format!("Shell '{shell_id}' not found"))?
        .cmd_tx
        .send(ShellCmd::Resize(cols, rows))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn shell_close(shell_id: String, state: State<AppState>) {
    if let Some(h) = state.shells.lock().unwrap().remove(&shell_id) {
        h.cmd_tx.send(ShellCmd::Close).ok();
    }
}
