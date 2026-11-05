//! R-6: dock.
use crate::helpers::*;
use starreach_core::constants::*;
use starreach_core::Command;

const BASE_ADJACENT: [&str; 10] = [
    "S.........", ".B........", "..........", "..........", "..........",
    "..........", "..........", "..........", "..........", "..........",
];

#[test]
fn docking_restores_everything_and_takes_time() {
    let mut game = board(BASE_ADJACENT);
    game.ship.hull = 100;
    game.ship.shields = 0;
    game.ship.energy = 2000;
    game.ship.quantorpedoes = 0;
    let next = run(&game, Command::Dock).game;
    assert_eq!(next.ship.hull, next.ship.max_hull);
    assert_eq!(next.ship.shields, next.ship.max_shields);
    assert_eq!(next.ship.energy, next.ship.max_energy);
    assert_eq!(next.ship.quantorpedoes, next.ship.max_quantorpedoes);
    assert_eq!(next.stardate, game.stardate + DOCK_TIME);
}

#[test]
fn enemies_present_refuse() {
    let game = board([
        "S.........", ".B........", "..........", "..........", "..........",
        "..........", "..........", "..........", "..........", ".........E",
    ]);
    assert_refused(&game, Command::Dock);
}

#[test]
fn no_starbase_refuses() {
    assert_refused(&board(EMPTY_WITH_SHIP_AT_00), Command::Dock);
}

#[test]
fn a_starbase_not_adjacent_refuses() {
    let game = board([
        "S.........", "..B.......", "..........", "..........", "..........",
        "..........", "..........", "..........", "..........", "..........",
    ]);
    assert_refused(&game, Command::Dock);
}
