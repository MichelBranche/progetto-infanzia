use crate::db::Database;
use crate::scanner::scan_library;
use notify::{Config, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

pub fn start_media_watcher(media_root: PathBuf, db: Arc<Database>) {
    std::thread::spawn(move || {
        let (tx, rx) = std::sync::mpsc::channel();
        let mut watcher = match RecommendedWatcher::new(
            move |_| {
                let _ = tx.send(());
            },
            Config::default(),
        ) {
            Ok(w) => w,
            Err(_) => return,
        };

        if watcher
            .watch(&media_root, RecursiveMode::Recursive)
            .is_err()
        {
            return;
        }

        loop {
            if rx.recv().is_err() {
                break;
            }
            std::thread::sleep(Duration::from_secs(3));
            while rx.try_recv().is_ok() {}
            let _ = scan_library(&db, &media_root);
        }
    });
}
