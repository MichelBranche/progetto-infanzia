use chrono::{Local, Timelike};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileLimits {
    pub profile_id: String,
    pub daily_limit_mins: i32,
    pub bedtime_start: Option<String>,
    pub bedtime_end: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProfileLimitsInput {
    pub daily_limit_mins: Option<i32>,
    pub bedtime_start: Option<String>,
    pub bedtime_end: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchSession {
    pub id: String,
    pub profile_id: String,
    pub media_id: String,
    pub media_title: String,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub seconds_watched: i32,
    pub completed: bool,
    pub source_kind: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CanPlayResult {
    pub allowed: bool,
    pub reason: Option<String>,
}

pub fn in_bedtime_window(start: &str, end: &str) -> bool {
    let start = start.trim();
    let end = end.trim();
    if start.is_empty() || end.is_empty() {
        return false;
    }
    let Some(start_mins) = parse_hhmm(start) else {
        return false;
    };
    let Some(end_mins) = parse_hhmm(end) else {
        return false;
    };
    let now = Local::now();
    let now_mins = (now.hour() * 60 + now.minute()) as i32;

    if start_mins < end_mins {
        now_mins >= start_mins && now_mins < end_mins
    } else {
        now_mins >= start_mins || now_mins < end_mins
    }
}

fn parse_hhmm(value: &str) -> Option<i32> {
    let mut parts = value.split(':');
    let h: i32 = parts.next()?.parse().ok()?;
    let m: i32 = parts.next().unwrap_or("0").parse().ok()?;
    if !(0..24).contains(&h) || !(0..60).contains(&m) {
        return None;
    }
    Some(h * 60 + m)
}
