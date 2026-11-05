//! R-23: the game ends on hull 0, on the last enemy, or when stranded with no starbase.
use crate::helpers::*;
use starreach_core::constants::*;
use starreach_core::geometry::all_cells;
use starreach_core::{Command, Game, Status};

/// The ship in sector (0, 0) with no starbase anywhere near, and nothing else visible.
fn far_from_help() -> Game {
    let mut game = board(EMPTY_WITH_SHIP_AT_00);
    game.sector_yx = (0, 0);
    set_board(&mut game, EMPTY_WITH_SHIP_AT_00);
    for yx in all_cells().filter(|&yx| yx != GALAXY_CENTER) {
        game.galaxy.record_mut(yx).starbases = 0;
    }
    game
}

#[test]
fn hull_zero_loses() {
    let mut game = board(EMPTY_WITH_SHIP_AT_00);
    game.ship.hull = 0;
    let applied = run(&game, Command::LongRangeScan);
    assert_eq!(applied.game.status, Status::Lost);
    assert!(applied.result.events.contains(&"The ship is destroyed".to_string()));
}

#[test]
fn destroying_the_last_enemy_wins() {
    let mut game = board([
        "S..E......", "..........", "..........", "..........", "..........",
        "..........", "..........", "..........", "..........", "..........",
    ]);
    for yx in all_cells().filter(|&yx| yx != game.sector_yx) {
        game.galaxy.record_mut(yx).enemies = 0;
    }
    let applied = run(&game, blast(0, 3));
    assert_eq!(applied.game.status, Status::Won);
    assert!(applied.result.events.contains(&"Every enemy in the galaxy is destroyed".to_string()));
}

#[test]
fn stranded_without_a_starbase_loses() {
    let mut game = far_from_help();
    game.ship.energy = LRS_ENERGY + 100;
    let applied = run(&game, Command::LongRangeScan);
    assert_eq!(applied.game.status, Status::Lost);
    let message = "The ship is stranded without energy to reach a starbase".to_string();
    assert!(applied.result.events.contains(&message));
}

#[test]
fn enough_energy_to_reach_a_starbase_plays_on() {
    let game = far_from_help();
    assert_eq!(run(&game, Command::LongRangeScan).game.status, Status::Playing);
}

#[test]
fn after_the_end_actions_are_refused_and_queries_answer() {
    let mut game = board(EMPTY_WITH_SHIP_AT_00);
    game.status = Status::Lost;
    assert_refused(&game, Command::LongRangeScan);
    assert_refused(&game, subwarp(0, 3));
    assert!(run(&game, Command::State).result.ok);
    assert!(run(&game, Command::GalaxyMap).result.ok);
}
