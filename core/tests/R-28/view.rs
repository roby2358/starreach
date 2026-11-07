//! R-28: the view carries what the player has uncovered and nothing else.

use starreach_core::geometry::all_cells;
use starreach_core::{apply, new_game, view, view_json, Command};

use crate::helpers::SEED;

#[test]
fn a_hidden_sector_is_null_and_a_visible_one_matches_its_record() {
    let game = apply(&new_game(SEED), &Command::LongRangeScan).game;
    let seen = view(&game);
    for yx in all_cells() {
        let record = game.galaxy.record(yx);
        let cell = &seen.galaxy[yx.0 as usize][yx.1 as usize];
        match cell {
            None => assert!(!record.visible, "{yx:?} is visible but null"),
            Some(sector) => {
                assert!(record.visible, "{yx:?} is hidden but shown");
                assert_eq!((sector.enemies, sector.starbases, sector.stars), (record.enemies, record.starbases, record.stars));
            }
        }
    }
}

#[test]
fn the_ship_status_and_position_come_from_the_game() {
    let game = apply(&new_game(SEED), &Command::LongRangeScan).game;
    let seen = view(&game);
    assert_eq!(seen.ship, game.ship);
    assert_eq!(seen.sector_yx, game.sector_yx);
    assert_eq!(seen.status, game.status);
    assert_eq!(seen.stardate, game.state().stardate);
}

#[test]
fn the_json_has_only_the_view_fields() {
    let text = serde_json::to_string(&new_game(SEED)).unwrap();
    let seen: serde_json::Value = serde_json::from_str(&view_json(&text).unwrap()).unwrap();
    let mut keys: Vec<&String> = seen.as_object().unwrap().keys().collect();
    keys.sort();
    assert_eq!(keys, ["galaxy", "sector_yx", "ship", "stardate", "status"]);
}

#[test]
fn a_game_that_does_not_parse_is_an_error() {
    assert!(view_json("not a game").is_err());
}
