use crate::commands::ConfigPaths;
use std::env;
use std::path::PathBuf;

fn config_dir() -> PathBuf {
    if let Ok(override_dir) = env::var("OPENCODE_CONFIG_DIR") {
        return PathBuf::from(override_dir);
    }

    #[cfg(target_os = "linux")]
    {
        PathBuf::from(
            env::var("XDG_CONFIG_HOME")
                .unwrap_or_else(|_| format!("{}/.config", env::var("HOME").unwrap())),
        )
        .join("opencode")
    }
    #[cfg(target_os = "macos")]
    {
        PathBuf::from(
            env::var("HOME")
                .unwrap_or_else(|_| "/Users/default".to_string()),
        )
        .join("Library/Application Support/ai.opencode.desktop")
    }
    #[cfg(target_os = "windows")]
    {
        PathBuf::from(env::var("APPDATA").unwrap_or_else(|_| "C:\\Users\\Default\\AppData\\Roaming".to_string()))
            .join("ai.opencode.desktop")
    }
    #[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
    {
        PathBuf::from(".")
    }
}

pub fn resolve() -> Result<ConfigPaths, String> {
    let dir = config_dir();
    Ok(ConfigPaths {
        opencode_jsonc: dir.join("opencode.jsonc").to_string_lossy().to_string(),
        matrixx_jsonc: dir.join("matrixx.jsonc").to_string_lossy().to_string(),
    })
}
