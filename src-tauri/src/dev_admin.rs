use crate::db::Database;
use crate::models::FriendRecord;
use crate::parental::WatchSession;
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DevTopTitle {
    pub title: String,
    pub total_seconds: f64,
    pub play_count: i32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DevLocalProfileInsight {
    pub id: String,
    pub name: String,
    pub role: String,
    pub recent_sessions: Vec<WatchSession>,
    pub top_titles: Vec<DevTopTitle>,
    pub friends: Vec<FriendRecord>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DevLocalDashboard {
    pub profiles: Vec<DevLocalProfileInsight>,
}

pub fn local_dashboard(db: &Database) -> Result<DevLocalDashboard, String> {
    let profiles = db.get_profiles()?;
    let mut insights = Vec::with_capacity(profiles.len());

    for profile in profiles {
        let recent_sessions = db.get_watch_history(&profile.id, 50)?;
        let top_titles = db.dev_top_watched_titles(&profile.id, 10)?;
        let friends = db.list_friends(&profile.id)?;
        insights.push(DevLocalProfileInsight {
            id: profile.id,
            name: profile.name,
            role: profile.role,
            recent_sessions,
            top_titles,
            friends,
        });
    }

    Ok(DevLocalDashboard { profiles: insights })
}
