use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HostConfig {
    pub host:     String,
    pub port:     u16,
    pub username: String,
    pub auth:     AuthMethod,
    pub group:    Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum AuthMethod {
    Password   { password: String },
    PrivateKey { path: String, passphrase: Option<String> },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredHost {
    pub id:     String,
    pub name:   String,
    pub config: HostConfig,
}

#[derive(Debug, Serialize)]
pub struct ExecResult {
    pub stdout:    String,
    pub stderr:    String,
    pub exit_code: i32,
}

#[derive(Debug, Serialize)]
pub struct FileEntry {
    pub name:        String,
    pub path:        String,
    pub size:        u64,
    pub is_dir:      bool,
    pub modified:    u64,
    pub permissions: u32,
}

#[derive(Debug, Serialize)]
pub struct LocalEntry {
    pub name:   String,
    pub path:   String,
    pub is_dir: bool,
}

#[derive(Debug, Serialize)]
pub struct RemoteFileFlat {
    pub path:     String, // full remote path
    pub relative: String, // relative to the download root
}
