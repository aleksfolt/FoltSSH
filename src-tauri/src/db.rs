use rusqlite::{params, Connection};
use tauri::State;
use uuid::Uuid;

use crate::types::{HostConfig, StoredHost};
use crate::AppState;

pub fn open_db() -> Connection {
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

#[tauri::command]
pub fn hosts_list(state: State<AppState>) -> Result<Vec<StoredHost>, String> {
    let db   = state.db.lock().unwrap();
    let mut stmt = db
        .prepare("SELECT id, name, config FROM hosts ORDER BY rowid")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| Ok((
            r.get::<_, String>(0)?,
            r.get::<_, String>(1)?,
            r.get::<_, String>(2)?,
        )))
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
pub fn host_save(
    name:   String,
    config: HostConfig,
    state:  State<AppState>,
) -> Result<StoredHost, String> {
    let id  = Uuid::new_v4().to_string();
    let cfg = serde_json::to_string(&config).map_err(|e| e.to_string())?;
    state.db.lock().unwrap()
        .execute(
            "INSERT INTO hosts (id, name, config) VALUES (?1, ?2, ?3)",
            params![id, name, cfg],
        )
        .map_err(|e| e.to_string())?;
    Ok(StoredHost { id, name, config })
}

#[tauri::command]
pub fn host_update(
    id:     String,
    name:   String,
    config: HostConfig,
    state:  State<AppState>,
) -> Result<(), String> {
    let cfg = serde_json::to_string(&config).map_err(|e| e.to_string())?;
    state.db.lock().unwrap()
        .execute(
            "UPDATE hosts SET name = ?1, config = ?2 WHERE id = ?3",
            params![name, cfg, id],
        )
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn host_delete(id: String, state: State<AppState>) -> Result<(), String> {
    state.db.lock().unwrap()
        .execute("DELETE FROM hosts WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}
