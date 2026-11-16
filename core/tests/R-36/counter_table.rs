//! R-36: the counter table is the one list of counters, in the core API and over JSON.
use starreach_core::{counter_table, counter_table_json, Counters};

const POSITIVE: [&str; 9] = [
    "enemies_destroyed", "sectors_cleared", "sectors_warped", "docks", "starbases_discovered",
    "blasts_hit", "torpedoes_fired", "scans", "games_won",
];
const NEGATIVE: [&str; 5] = ["shield_damage", "hull_damage", "blasts_missed", "games_lost", "times_stranded"];

fn keys_where(may_be_goal: bool) -> Vec<&'static str> {
    counter_table().iter().filter(|row| row.may_be_goal == may_be_goal).map(|row| row.key).collect()
}

#[test]
fn the_table_has_a_row_for_every_counter_field_and_no_other() {
    let counters = serde_json::to_value(Counters::default()).unwrap();
    let mut fields: Vec<&str> = counters.as_object().unwrap().keys().map(String::as_str).collect();
    let mut keys: Vec<&str> = counter_table().iter().map(|row| row.key).collect();
    fields.sort();
    keys.sort();
    assert_eq!(keys, fields);
}

#[test]
fn positive_counters_may_be_goals_and_negative_ones_may_not() {
    assert_eq!(keys_where(true), POSITIVE);
    assert_eq!(keys_where(false), NEGATIVE);
}

#[test]
fn every_row_has_a_label() {
    assert!(counter_table().iter().all(|row| !row.label.is_empty()));
}

#[test]
fn the_json_table_is_the_same_rows() {
    let rows: serde_json::Value = serde_json::from_str(&counter_table_json()).unwrap();
    assert_eq!(rows, serde_json::to_value(counter_table()).unwrap());
    assert_eq!(rows[0], serde_json::json!({"key": "enemies_destroyed", "label": "enemies destroyed", "may_be_goal": true}));
}
