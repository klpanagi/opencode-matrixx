use std::fs;
use std::io;
use std::path::Path;

pub fn read_file(path: &str) -> io::Result<String> {
    fs::read_to_string(Path::new(path))
}

/// Rotate backups: .bak.1 → .bak.2, .bak.0 → .bak.1, file → .bak.0
/// Keeps at most 3 backup generations.
fn rotate_backups(path: &Path) {
    let bak2 = path.with_extension("bak.2");
    let bak1 = path.with_extension("bak.1");
    let bak0 = path.with_extension("bak.0");

    if bak2.exists() {
        let _ = fs::remove_file(&bak2);
    }
    if bak1.exists() {
        let _ = fs::rename(&bak1, &bak2);
    }
    if bak0.exists() {
        let _ = fs::rename(&bak0, &bak1);
    }
    if path.exists() {
        let _ = fs::rename(path, &bak0);
    }
}

pub fn write_file(path: &str, content: &str) -> io::Result<()> {
    let p = Path::new(path);
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent)?;
    }
    rotate_backups(p);
    fs::write(p, content)
}
