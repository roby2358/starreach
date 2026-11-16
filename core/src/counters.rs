//! What has happened in a game (ONTOLOGY Counters, the counter table, D-42).
//!
//! Each rule adds to its counter at the one place the thing happens. `COUNTER_TABLE` is the
//! single source for the counters' keys, labels and whether each may be a goal.

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

/// One row of the counter table. `key` is the counter's field name in `Counters`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
pub struct CounterRow {
    pub key: &'static str,
    /// Reads after a number: "12 enemies destroyed".
    pub label: &'static str,
    /// Positive counters may be a game's goal; negative ones never are.
    pub may_be_goal: bool,
}

pub const COUNTER_TABLE: [CounterRow; 14] = [
    CounterRow { key: "enemies_destroyed", label: "enemies destroyed", may_be_goal: true },
    CounterRow { key: "sectors_cleared", label: "sectors cleared", may_be_goal: true },
    CounterRow { key: "sectors_warped", label: "sectors warped to", may_be_goal: true },
    CounterRow { key: "docks", label: "docks at a starbase", may_be_goal: true },
    CounterRow { key: "starbases_discovered", label: "starbases discovered", may_be_goal: true },
    CounterRow { key: "blasts_hit", label: "blasts that hit", may_be_goal: true },
    CounterRow { key: "torpedoes_fired", label: "torpedoes fired", may_be_goal: true },
    CounterRow { key: "scans", label: "long range scans", may_be_goal: true },
    CounterRow { key: "games_won", label: "games won", may_be_goal: true },
    CounterRow { key: "shield_damage", label: "shield damage taken", may_be_goal: false },
    CounterRow { key: "hull_damage", label: "hull damage taken", may_be_goal: false },
    CounterRow { key: "blasts_missed", label: "blasts that missed", may_be_goal: false },
    CounterRow { key: "games_lost", label: "games lost", may_be_goal: false },
    CounterRow { key: "times_stranded", label: "times stranded", may_be_goal: false },
];
