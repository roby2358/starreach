//! The WASM boundary: `new_game` and `apply` over JSON text (ONTOLOGY "Core API").

use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn new_game(seed: u32) -> String {
    crate::new_game_json(seed)
}

/// Returns `{game, result}` as JSON text. Throws when `game` isn't a valid Game.
#[wasm_bindgen]
pub fn apply(game: &str, command: &str) -> Result<String, JsError> {
    crate::apply_json(game, command).map_err(|e| JsError::new(&e))
}
