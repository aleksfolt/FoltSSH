use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::Manager;

#[derive(Serialize, Deserialize, Clone)]
pub struct WindowGeom {
    pub width:  u32,
    pub height: u32,
    pub x:      i32,
    pub y:      i32,
}

impl Default for WindowGeom {
    fn default() -> Self {
        Self { width: 1100, height: 700, x: 0, y: 0 }
    }
}

fn geom_path() -> std::path::PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("FoltSSH")
        .join("window.json")
}

pub fn load_geom() -> WindowGeom {
    std::fs::read_to_string(geom_path())
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub fn save_geom(g: &WindowGeom) {
    if let Ok(json) = serde_json::to_string(g) {
        std::fs::write(geom_path(), json).ok();
    }
}

pub fn setup_window(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    if let Some(win) = app.get_webview_window("main") {
        let geom = load_geom();
        win.set_size(tauri::Size::Physical(tauri::PhysicalSize {
            width:  geom.width,
            height: geom.height,
        }))?;
        if geom.x != 0 || geom.y != 0 {
            win.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
                x: geom.x,
                y: geom.y,
            }))?;
        }

        let saved = Arc::new(Mutex::new(geom));
        let saved_ev = saved.clone();
        win.on_window_event(move |e| match e {
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
            tauri::WindowEvent::CloseRequested { .. } | tauri::WindowEvent::Destroyed => {
                save_geom(&saved_ev.lock().unwrap());
            }
            _ => {}
        });
    }
    Ok(())
}
