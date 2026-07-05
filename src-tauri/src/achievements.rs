use serde::Serialize;

use crate::db::Database;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AchievementUnlock {
    pub id: String,
    pub unlocked_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileAchievementStats {
    pub friends_count: i32,
    pub completions_count: i32,
    pub list_count: i32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileAchievementsState {
    pub stats: ProfileAchievementStats,
    pub unlocked: Vec<AchievementUnlock>,
}

struct AchievementRule {
    id: &'static str,
    category: &'static str,
    threshold: i32,
}

const RULES: &[AchievementRule] = &[
    AchievementRule {
        id: "friends_1",
        category: "friends",
        threshold: 1,
    },
    AchievementRule {
        id: "friends_5",
        category: "friends",
        threshold: 5,
    },
    AchievementRule {
        id: "friends_10",
        category: "friends",
        threshold: 10,
    },
    AchievementRule {
        id: "friends_25",
        category: "friends",
        threshold: 25,
    },
    AchievementRule {
        id: "watch_1",
        category: "completions",
        threshold: 1,
    },
    AchievementRule {
        id: "watch_5",
        category: "completions",
        threshold: 5,
    },
    AchievementRule {
        id: "watch_10",
        category: "completions",
        threshold: 10,
    },
    AchievementRule {
        id: "watch_25",
        category: "completions",
        threshold: 25,
    },
    AchievementRule {
        id: "watch_50",
        category: "completions",
        threshold: 50,
    },
    AchievementRule {
        id: "list_1",
        category: "list",
        threshold: 1,
    },
    AchievementRule {
        id: "list_5",
        category: "list",
        threshold: 5,
    },
    AchievementRule {
        id: "list_10",
        category: "list",
        threshold: 10,
    },
    AchievementRule {
        id: "list_25",
        category: "list",
        threshold: 25,
    },
];

fn stat_for_category(stats: &ProfileAchievementStats, category: &str) -> i32 {
    match category {
        "friends" => stats.friends_count,
        "completions" => stats.completions_count,
        "list" => stats.list_count,
        _ => 0,
    }
}

pub fn get_state(
    db: &Database,
    profile_id: &str,
    cloud_friends_count: i32,
) -> Result<ProfileAchievementsState, String> {
    db.backfill_profile_completions(profile_id)?;
    let stats = achievement_stats(db, profile_id, cloud_friends_count)?;
    let unlocked = db
        .list_profile_achievements(profile_id)?
        .into_iter()
        .map(|(id, unlocked_at)| AchievementUnlock { id, unlocked_at })
        .collect();
    Ok(ProfileAchievementsState { stats, unlocked })
}

fn achievement_stats(
    db: &Database,
    profile_id: &str,
    cloud_friends_count: i32,
) -> Result<ProfileAchievementStats, String> {
    Ok(ProfileAchievementStats {
        friends_count: db.count_lan_friends(profile_id)? + cloud_friends_count.max(0),
        completions_count: db.count_profile_completions(profile_id)?,
        list_count: db.count_profile_list_items(profile_id)?,
    })
}

pub fn sync_profile(
    db: &Database,
    profile_id: &str,
    cloud_friends_count: i32,
) -> Result<Vec<AchievementUnlock>, String> {
    db.backfill_profile_completions(profile_id)?;
    let stats = achievement_stats(db, profile_id, cloud_friends_count)?;
    let mut newly_unlocked = Vec::new();

    for rule in RULES {
        let value = stat_for_category(&stats, rule.category);
        if value < rule.threshold {
            continue;
        }
        if let Some(unlocked_at) = db.unlock_profile_achievement(profile_id, rule.id)? {
            newly_unlocked.push(AchievementUnlock {
                id: rule.id.to_string(),
                unlocked_at,
            });
        }
    }

    Ok(newly_unlocked)
}

pub fn record_completion(
    db: &Database,
    profile_id: &str,
    completion_key: &str,
    kind: &str,
    title: &str,
    cloud_friends_count: i32,
) -> Result<Vec<AchievementUnlock>, String> {
    db.record_profile_completion(profile_id, completion_key, kind, title)?;
    sync_profile(db, profile_id, cloud_friends_count)
}
