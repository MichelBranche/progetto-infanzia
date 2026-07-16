//! Scarica il catalogo SC completo e lo salva come seed gzip per la release.
//!
//! Uso:
//!   cargo run --bin export-sc-catalog-seed --release
//!   cargo run --bin export-sc-catalog-seed --release -- path/to/out.json.gz

use std::path::PathBuf;
use std::time::Instant;
use tauri_app_lib::db::Database;
use tauri_app_lib::sc_catalog;

fn main() {
    let out = std::env::args()
        .nth(1)
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/sc_catalog_seed.json.gz")
        });

    let data_dir = std::env::var("BRANCHEFY_DATA_DIR").unwrap_or_else(|_| {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../.branchefy-data")
            .to_string_lossy()
            .into_owned()
    });
    std::fs::create_dir_all(&data_dir).expect("create data dir");
    let db_path = PathBuf::from(&data_dir).join("library.db");

    println!("export-sc-catalog-seed");
    println!("  db:  {}", db_path.display());
    println!("  out: {}", out.display());
    println!("Avvio crawl completo (può richiedere molti minuti)...");

    let started = Instant::now();
    let db = Database::open(&db_path).expect("open db");
    match sc_catalog::build_and_export_catalog_seed(&db, &out) {
        Ok((total, movies, series)) => {
            let bytes = std::fs::metadata(&out).map(|m| m.len()).unwrap_or(0);
            println!(
                "OK in {:.1}s — total={total} movies={movies} series={series} seed_bytes={bytes}",
                started.elapsed().as_secs_f64()
            );
            println!("Seed pronto per la prossima release: {}", out.display());
        }
        Err(err) => {
            eprintln!("ERRORE: {err}");
            std::process::exit(1);
        }
    }
}
