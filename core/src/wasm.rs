//! The WASM boundary: `new_game`, `apply`, `view`, `counter_table`, `rungs_crossed` and
//! `ladder_standing` over JSON text, and `commendation` as plain text (ONTOLOGY "Core API").
//! A lifetime total crosses as a JavaScript number, a whole number below 2^53.

use wasm_bindgen::prelude::*;

/// `start_unix_seconds` is the real time the game starts at, read by the caller. It crosses as a
/// JavaScript number and its fraction is dropped.
#[wasm_bindgen]
pub fn new_game(seed: u32, start_unix_seconds: f64) -> String {
    crate::new_game_json(seed, start_unix_seconds as i64)
}

/// Returns `{game, result}` as JSON text, or undefined when `game` isn't a Game this core reads.
#[wasm_bindgen]
pub fn apply(game: &str, command: &str) -> Option<String> {
    crate::apply_json(game, command).ok()
}

/// Returns the GameView as JSON text, or undefined when `game` isn't a Game this core reads.
#[wasm_bindgen]
pub fn view(game: &str) -> Option<String> {
    crate::view_json(game).ok()
}

/// Returns the counter table as JSON text: an array of
/// `{key, label, may_be_goal, scale, goal_ceiling}`.
#[wasm_bindgen]
pub fn counter_table() -> String {
    crate::counter_table_json()
}

/// Returns the rungs a lifetime total reached in going from `before` to `after` as a JSON array
/// of numbers, or undefined when `key` names no counter.
#[wasm_bindgen]
pub fn rungs_crossed(key: &str, before: f64, after: f64) -> Option<String> {
    crate::rungs_crossed_json(key, before as u64, after as u64)
}

/// Returns `{reached, next}` as JSON text, or undefined when `key` names no counter.
#[wasm_bindgen]
pub fn ladder_standing(key: &str, total: f64) -> Option<String> {
    crate::ladder_standing_json(key, total as u64)
}

/// Returns Star Central's message for the counter's lifetime total reaching `amount`, or
/// undefined when `key` names no counter. `roll` is in [0, 1) and picks the wording.
#[wasm_bindgen]
pub fn commendation(key: &str, amount: f64, roll: f64) -> Option<String> {
    crate::commendation(key, amount as u64, roll)
}
