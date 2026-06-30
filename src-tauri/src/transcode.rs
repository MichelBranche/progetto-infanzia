use std::collections::HashMap;
use std::path::Path;
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

fn mp4_pipe_args() -> [&'static str; 19] {
    [
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-profile:v",
        "main",
        "-level",
        "4.0",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-movflags",
        "frag_keyframe+empty_moov+faststart",
        "-f",
        "mp4",
        "pipe:1",
    ]
}

fn start_arg(start_secs: f64) -> String {
    if start_secs > 5.0 {
        format!("{start_secs:.1}")
    } else {
        "0".to_string()
    }
}

pub fn needs_transcode(path: &str) -> bool {
    let ext = Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .unwrap_or_default();

    matches!(ext.as_str(), "mkv" | "avi" | "webm" | "wmv" | "mov" | "m2ts" | "ts")
}

pub fn ffmpeg_executable() -> &'static str {
    "ffmpeg"
}

pub async fn check_ffmpeg_available() -> bool {
    Command::new(ffmpeg_executable())
        .arg("-version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .await
        .map(|s| s.success())
        .unwrap_or(false)
}

pub async fn spawn_transcode(
    file_path: &Path,
    start_secs: f64,
) -> Result<tokio::process::Child, String> {
    let start = start_arg(start_secs);

    let mut cmd = Command::new(ffmpeg_executable());
    cmd.args([
        "-hide_banner",
        "-loglevel",
        "error",
        "-ss",
        &start,
        "-i",
        &file_path.to_string_lossy(),
    ]);
    cmd.args(mp4_pipe_args());
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());
    cmd.kill_on_drop(true);

    cmd.spawn().map_err(|e| {
        format!(
            "FFmpeg non trovato o non avviabile. Installa FFmpeg e aggiungilo al PATH: {e}"
        )
    })
}

pub async fn spawn_remote_transcode(
    remote_url: &str,
    request_headers: &HashMap<String, String>,
    start_secs: f64,
) -> Result<tokio::process::Child, String> {
    let start = start_arg(start_secs);
    let header_block = request_headers
        .iter()
        .map(|(key, value)| format!("{key}: {value}"))
        .collect::<Vec<_>>()
        .join("\r\n");

    let mut cmd = Command::new(ffmpeg_executable());
    cmd.args(["-hide_banner", "-loglevel", "error"]);
    if !header_block.is_empty() {
        cmd.args(["-headers", &format!("{header_block}\r\n")]);
    }
    cmd.args([
        "-reconnect",
        "1",
        "-reconnect_streamed",
        "1",
        "-reconnect_delay_max",
        "5",
        "-ss",
        &start,
        "-i",
        remote_url,
    ]);
    cmd.args(mp4_pipe_args());
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());
    cmd.kill_on_drop(true);

    cmd.spawn().map_err(|e| {
        format!(
            "FFmpeg non trovato o non avviabile. Installa FFmpeg e aggiungilo al PATH: {e}"
        )
    })
}

pub async fn drain_stderr(mut child: tokio::process::Child) {
    if let Some(stderr) = child.stderr.take() {
        let mut reader = BufReader::new(stderr).lines();
        while let Ok(Some(_)) = reader.next_line().await {}
    }
    let _ = child.wait().await;
}
