//! R-5: subwarp.
use crate::helpers::*;
use starreach_core::constants::*;
use starreach_core::sector::{EMPTY, SHIP};

#[test]
fn moves_along_the_ray_and_pays_per_step() {
    let game = board(EMPTY_WITH_SHIP_AT_00);
    let applied = run(&game, subwarp(0, 5));
    let next = &applied.game;
    assert_eq!(next.sector.ship_yx, (0, 5));
    assert_eq!(next.sector.at((0, 5)), Some(SHIP));
    assert_eq!(next.sector.at((0, 0)), Some(EMPTY));
    assert_eq!(next.ship.energy, game.ship.energy - 5 * SUBWARP_ENERGY_PER_STEP);
    assert_eq!(next.stardate, game.stardate + 5.0 * SUBWARP_TIME_PER_STEP);
}

#[test]
fn stops_before_an_obstacle() {
    let game = board([
        "S..*......", "..........", "..........", "..........", "..........",
        "..........", "..........", "..........", "..........", "..........",
    ]);
    assert_eq!(run(&game, subwarp(0, 6)).game.sector.ship_yx, (0, 2));
}

#[test]
fn enemies_present_cap_the_steps() {
    let game = board([
        "S.........", "..........", "..........", "..........", "..........",
        "..........", "..........", "..........", "..........", ".........E",
    ]);
    let steps = SUBWARP_MAX_STEPS_HOSTILE as i32;
    assert_eq!(run(&game, subwarp(0, 9)).game.sector.ship_yx, (0, steps));
}

#[test]
fn zero_steps_are_refused() {
    let game = board([
        "S*........", "..........", "..........", "..........", "..........",
        "..........", "..........", "..........", "..........", "..........",
    ]);
    assert_refused(&game, subwarp(0, 5));
    assert_refused(&game, subwarp(0, 0));
}

#[test]
fn energy_below_the_cost_is_refused() {
    let mut game = board(EMPTY_WITH_SHIP_AT_00);
    game.ship.energy = 2 * SUBWARP_ENERGY_PER_STEP - 1;
    assert_refused(&game, subwarp(0, 2));
}
