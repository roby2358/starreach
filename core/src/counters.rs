//! What has happened in a game (ONTOLOGY Counters, the counter table, D-42).
//!
//! Each rule adds to its counter at the one place the thing happens. `COUNTER_TABLE` is the
//! single source for the counters' keys, labels, whether each may be a goal, the unit of its
//! ladder and the most a goal may ask of it.

use serde::{Deserialize, Serialize};

/// One game's counts. Every field starts at 0 and only rises.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Counters {
    pub enemies_destroyed: u32,
    pub sectors_cleared: u32,
    pub sectors_warped: u32,
    pub docks: u32,
    pub starbases_discovered: u32,
    pub blasts_hit: u32,
    pub torpedoes_fired: u32,
    pub scans: u32,
    pub games_won: u32,
    pub shield_damage: u32,
    pub hull_damage: u32,
    pub blasts_missed: u32,
    pub games_lost: u32,
    pub times_stranded: u32,
}

impl Counters {
    /// The count under a counter table key. None for a key that names no counter.
    pub fn value(&self, key: &str) -> Option<u32> {
        let value = match key {
            "enemies_destroyed" => self.enemies_destroyed,
            "sectors_cleared" => self.sectors_cleared,
            "sectors_warped" => self.sectors_warped,
            "docks" => self.docks,
            "starbases_discovered" => self.starbases_discovered,
            "blasts_hit" => self.blasts_hit,
            "torpedoes_fired" => self.torpedoes_fired,
            "scans" => self.scans,
            "games_won" => self.games_won,
            "shield_damage" => self.shield_damage,
            "hull_damage" => self.hull_damage,
            "blasts_missed" => self.blasts_missed,
            "games_lost" => self.games_lost,
            "times_stranded" => self.times_stranded,
            _ => return None,
        };
        Some(value)
    }
}

/// One row of the counter table. `key` is the counter's field name in `Counters`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
pub struct CounterRow {
    pub key: &'static str,
    /// Reads after a number: "12 enemies destroyed".
    pub label: &'static str,
    /// Positive counters may be a game's goal; negative ones never are.
    pub may_be_goal: bool,
    /// The unit of the counter's ladder of lifetime totals: 1, 10, 100 or 1000 (D-43).
    pub scale: u32,
    /// The most a game's goal may ask of this counter. 0 means it is not offered as a goal, as
    /// for every counter that may not be one (D-43).
    pub goal_ceiling: u32,
}

/// `scale` and `goal_ceiling` are set by the D-43 rule from `just cc-model-games`, which prints
/// what the rule gives beside these.
pub const COUNTER_TABLE: [CounterRow; 14] = [
    CounterRow { key: "enemies_destroyed", label: "enemies destroyed", may_be_goal: true, scale: 10, goal_ceiling: 127 },
    CounterRow { key: "sectors_cleared", label: "sectors cleared", may_be_goal: true, scale: 1, goal_ceiling: 41 },
    CounterRow { key: "sectors_warped", label: "sectors warped to", may_be_goal: true, scale: 1, goal_ceiling: 56 },
    CounterRow { key: "docks", label: "docks at a starbase", may_be_goal: true, scale: 1, goal_ceiling: 18 },
    CounterRow { key: "starbases_discovered", label: "starbases discovered", may_be_goal: true, scale: 1, goal_ceiling: 3 },
    CounterRow { key: "blasts_hit", label: "blasts that hit", may_be_goal: true, scale: 1, goal_ceiling: 57 },
    CounterRow { key: "torpedoes_fired", label: "torpedoes fired", may_be_goal: true, scale: 1, goal_ceiling: 67 },
    CounterRow { key: "scans", label: "long range scans", may_be_goal: true, scale: 1, goal_ceiling: 33 },
    CounterRow { key: "games_won", label: "games won", may_be_goal: true, scale: 1, goal_ceiling: 0 },
    CounterRow { key: "shield_damage", label: "shield damage taken", may_be_goal: false, scale: 1000, goal_ceiling: 0 },
    CounterRow { key: "hull_damage", label: "hull damage taken", may_be_goal: false, scale: 100, goal_ceiling: 0 },
    CounterRow { key: "blasts_missed", label: "blasts that missed", may_be_goal: false, scale: 1, goal_ceiling: 0 },
    CounterRow { key: "games_lost", label: "games lost", may_be_goal: false, scale: 1, goal_ceiling: 0 },
    CounterRow { key: "times_stranded", label: "times stranded", may_be_goal: false, scale: 1, goal_ceiling: 0 },
];

/// The table's row for a key. None for a key that names no counter.
pub fn counter_row(key: &str) -> Option<&'static CounterRow> {
    COUNTER_TABLE.iter().find(|row| row.key == key)
}
