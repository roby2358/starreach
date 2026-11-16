//! R-28: the view carries what the player has uncovered and the game's goals, and nothing else.

use starreach_core::constants::GOALS_PER_GAME;
use starreach_core::counters::counter_row;
use starreach_core::geometry::all_cells;
use starreach_core::goals::{Goal, GoalState};
use starreach_core::{apply, view, view_json, Command};

use crate::helpers::{new_game, SEED};

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
    assert_eq!(seen.board, game.state().map);
}

#[test]
fn the_goals_and_their_progress_come_from_the_game() {
    let mut game = new_game(SEED);
    assert_eq!(view(&game).goals.len(), GOALS_PER_GAME);
    assert_eq!(view(&game).goals, game.state().goals);

    game.goals[0] = Goal { counter: counter_row("scans").unwrap(), amount: 5, met: false };
    game.counters.scans = 3;
    let shown = |met| GoalState { counter: "scans".to_string(), label: "long range scans".to_string(), count: 3, amount: 5, met };
    assert_eq!(view(&game).goals[0], shown(false));

    game.goals[0].met = true;
    assert_eq!(view(&game).goals[0], shown(true));
    assert_eq!(view(&game).goals, game.state().goals);
}

#[test]
fn the_json_has_only_the_view_fields() {
    let text = serde_json::to_string(&new_game(SEED)).unwrap();
    let seen: serde_json::Value = serde_json::from_str(&view_json(&text).unwrap()).unwrap();
    let mut keys: Vec<&String> = seen.as_object().unwrap().keys().collect();
    keys.sort();
    assert_eq!(keys, ["board", "galaxy", "goals", "sector_yx", "ship", "stardate", "status"]);
}

#[test]
fn a_game_that_does_not_parse_is_an_error() {
    assert!(view_json("not a game").is_err());
}
