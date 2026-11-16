//! The WASM boundary: `new_game`, `apply`, `view` and `counter_table` over JSON text (ONTOLOGY
//! "Core API").

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
