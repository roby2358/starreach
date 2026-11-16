//! R-44: every pair the core takes, returns or says is x first: the column, then the row.
//! The boards here are lopsided, so a pair in the other order names a different cell.
use crate::helpers::*;
use serde_json::{json, Value};
use starreach_core::actions::blast_by;
use starreach_core::events::{advance_by, enemy_fire_by, Approach};
use starreach_core::{apply_json, view, Command};

/// The ship in column 1 of row 0, an enemy in column 6 of the same row, a starbase in column 2
/// of row 9.
const LOPSIDED: [&str; 10] = [
    ".S....E...", "..........", "..........", "..........", "..........",
    "..........", "..........", "..........", "..........", "..B.......",
];

fn result_json(applied: &starreach_core::Applied) -> Value {
    serde_json::to_value(&applied.result).unwrap()
}

#[test]
fn the_state_gives_each_pair_as_column_then_row() {
    let state = result_json(&run(&board(LOPSIDED), Command::State))["state"].clone();
    assert_eq!(state["ship_xy"], json!([1, 0]));
    assert_eq!(state["starbase_xy"], json!([2, 9]));
    assert_eq!(state["enemies"][0]["xy"], json!([6, 0]));
    assert_eq!(state["sector_xy"], json!([TEST_SECTOR.x, TEST_SECTOR.y]));
    assert_eq!(state["map"][0], LOPSIDED[0]);
}

#[test]
fn a_report_gives_each_pair_as_column_then_row() {
    let game = board(LOPSIDED);
    let moved = report(&run(&game, subwarp(3, 0)));
    assert_eq!(moved["ship_xy"], json!([3, 0]));
    assert_eq!(moved["path"], json!([[1, 0], [2, 0], [3, 0]]));
    let shot = report(&run(&game, torpedo(6, 0)));
    assert_eq!(shot["hit_xy"], json!([6, 0]));
    assert_eq!(shot["path"][0], json!([1, 0]));
    let warped = report(&run(&board(EMPTY_WITH_SHIP_AT_00), warp(6, 4)));
    assert_eq!(warped["sector_xy"], json!([6, 4]));
}

#[test]
fn the_view_gives_the_sector_as_column_then_row() {
    let game = run(&board(EMPTY_WITH_SHIP_AT_00), warp(6, 4)).game;
    let seen = serde_json::to_value(view(&game)).unwrap();
    assert_eq!(seen["sector_xy"], json!([6, 4]));
    assert!(!seen["galaxy"][4][6].is_null(), "the galaxy is rows of columns: [y][x]");
}

#[test]
fn a_command_names_its_x_and_y_and_a_stored_game_holds_pairs_x_first() {
    let game = serde_json::to_string(&board(LOPSIDED)).unwrap();
    let applied: Value = serde_json::from_str(&apply_json(&game, r#"{"type":"subwarp","x":3,"y":0}"#).unwrap()).unwrap();
    assert_eq!(applied["result"]["ok"], true);
    assert_eq!(applied["game"]["sector"]["ship_xy"], json!([3, 0]));
    assert_eq!(applied["game"]["sector"]["enemies_xy"], json!([[6, 0]]));
    assert_eq!(applied["game"]["sector"]["map"][0][3], "S");
}

#[test]
fn every_message_that_names_a_cell_says_the_column_first() {
    let game = board(LOPSIDED);
    let fired = enemy_fire_by(&mut game.clone(), 0, 1.0);
    assert!(fired[0].starts_with("Enemy at (6, 0) fires raxxon beam!"), "{fired:?}");
    let advanced = advance_by(&mut game.clone(), 0, Approach::HeadOn);
    assert_eq!(advanced, ["Enemy advanced from (6, 0) to (4, 0)"]);
    let mut missed = Vec::new();
    blast_by(&mut game.clone(), xy(6, 0), 1.0, &mut missed).unwrap();
    assert!(missed[0].starts_with("Blaston beam misses the enemy at (6, 0)!"), "{missed:?}");
}

#[test]
fn a_refusal_that_names_a_cell_says_the_column_first() {
    let behind_a_star = board([
        "S*........", "*.........", "..........", "..........", "..........",
        "..........", "..........", "..........", "..........", "..........",
    ]);
    assert_eq!(assert_refused(&behind_a_star, subwarp(5, 0)), "No clear path toward (5, 0)");
    let blocked_fire = board([
        ".S.*..E...", "..........", "..........", "..........", "..........",
        "..........", "..........", "..........", "..........", "..........",
    ]);
    let blocked = enemy_fire_by(&mut blocked_fire.clone(), 0, 1.0);
    assert_eq!(blocked, ["Enemy at (6, 0) fires raxxon beam but path is blocked"]);
    assert_eq!(assert_refused(&behind_a_star, subwarp(12, 3)), "Coordinates (12, 3) are outside 0..9");
    let far = board([
        ".........E", "..........", "..........", "..........", "..........",
        "..........", "..........", "..........", "..........", "S.........",
    ]);
    assert!(assert_refused(&far, blast(9, 0)).starts_with("Enemy at (9, 0) is out of blast range"));
}
