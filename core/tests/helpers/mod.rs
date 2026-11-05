//! Shared setup for the rule tests: hand-built boards and command shorthands.
#![allow(dead_code)]

use starreach_core::game::Game;
use starreach_core::geometry::{all_cells, Yx};
use starreach_core::sector::{ENEMY, SHIP, STAR, STARBASE};
use starreach_core::{apply, new_game, Applied, Command};

pub const SEED: u32 = 7;

/// The sector hand-built boards stand in: next to Star Central, so its starbase stays in
/// reach and the ship is never stranded by accident.
pub const TEST_SECTOR: Yx = (4, 3);

/// A fresh game with the ship in `TEST_SECTOR`, whose board is replaced by `rows`
/// (`.` `S` `B` `E` `*`). The galaxy record follows the board, and the event clock starts now.
pub fn board(rows: [&str; 10]) -> Game {
    let mut game = new_game(SEED);
    game.sector_yx = TEST_SECTOR;
    game.galaxy.record_mut(TEST_SECTOR).visible = true;
    set_board(&mut game, rows);
    game
}

pub fn set_board(game: &mut Game, rows: [&str; 10]) {
    game.sector.map = rows.iter().map(|r| r.chars().collect()).collect();
    game.sector.enemies_yx = cells_of(game, ENEMY);
    let sector = &mut game.sector;
    sector.starbase_yx = None;
    sector.stars = 0;
    for yx in all_cells() {
        match sector.map[yx.0 as usize][yx.1 as usize] {
            SHIP => sector.ship_yx = yx,
            STARBASE => sector.starbase_yx = Some(yx),
            STAR => sector.stars += 1,
            _ => {}
        }
    }
    let record = game.galaxy.record_mut(game.sector_yx);
    record.enemies = game.sector.enemies_yx.len() as u32;
    record.starbases = game.sector.starbase_yx.is_some() as u32;
    record.stars = game.sector.stars;
    game.last_event_stardate = game.stardate;
}

pub fn cells_of(game: &Game, occupant: char) -> Vec<Yx> {
    all_cells().filter(|&yx| game.sector.at(yx) == Some(occupant)).collect()
}

pub fn run(game: &Game, command: Command) -> Applied {
    apply(game, &command)
}

pub fn subwarp(y: i32, x: i32) -> Command {
    Command::Subwarp { y, x }
}

pub fn warp(y: i32, x: i32) -> Command {
    Command::GalaxyWarp { y, x }
}

pub fn blast(y: i32, x: i32) -> Command {
    Command::Blast { y, x }
}

pub fn torpedo(y: i32, x: i32) -> Command {
    Command::Torpedo { y, x }
}

/// A board with nothing but the ship.
pub const EMPTY_WITH_SHIP_AT_00: [&str; 10] = [
    "S.........", "..........", "..........", "..........", "..........",
    "..........", "..........", "..........", "..........", "..........",
];

/// The result's report as JSON, for reading its fields.
pub fn report(applied: &Applied) -> serde_json::Value {
    serde_json::to_value(&applied.result).unwrap()["report"].clone()
}

/// Asserts the command was refused and left the game as it was.
pub fn assert_refused(game: &Game, command: Command) -> String {
    let applied = run(game, command);
    assert!(!applied.result.ok, "expected a refusal");
    assert_eq!(&applied.game, game, "a refusal must leave the game unchanged");
    applied.result.error.unwrap()
}
