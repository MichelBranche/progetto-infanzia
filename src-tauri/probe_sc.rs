use tauri_app_lib::sc_catalog;

fn main() {
    let rows = sc_catalog::fetch_sliders(
        "https://streamingcommunityz.tech",
        "https://cdn.streamingcommunityz.tech",
        "it",
    ).expect("fetch");
    for row in &rows {
        if row.key.contains("latest") || row.title.to_lowercase().contains("ultim") {
            println!("=== {} ({}) ===", row.title, row.key);
            for item in row.items.iter().take(30) {
                if item.r#type == "series" {
                    println!(
                        "  id={} name={} resume={:?} slug={:?}",
                        item.id, item.name, item.resume_video_id, item.slug
                    );
                }
            }
        }
    }
    // search michael
    for row in &rows {
        for item in &row.items {
            if item.name.to_lowercase().contains("michael") {
                println!(
                    "MJ: row={} id={} name={} resume={:?}",
                    row.key, item.id, item.name, item.resume_video_id
                );
            }
        }
    }
}
