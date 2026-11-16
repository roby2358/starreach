//! R-15: shield replenish moves energy into shields, at SHIELD_POINTS_PER_ENERGY points per energy.
use crate::helpers::*;
use starreach_core::constants::*;
use starreach_core::events::{recharge_shields, SHIELD_REPLENISH_EVENT as EVENT};

#[test]
fn recharges_by_the_smallest_of_the_three_limits() {
    let cases = [
        // (shields, energy) -> (points, cost)
        (0, SHIP_MAX_ENERGY, SHIELD_REPLENISH, SHIELD_REPLENISH / SHIELD_POINTS_PER_ENERGY),
        (SHIP_MAX_SHIELDS - 100, SHIP_MAX_ENERGY, 100, 100 / SHIELD_POINTS_PER_ENERGY),
        (0, 5, 5 * SHIELD_POINTS_PER_ENERGY, 5),
    ];
    for (shields, energy, points, cost) in cases {
        let mut game = board(EMPTY_WITH_SHIP_AT_00);
        game.ship.shields = shields;
        game.ship.energy = energy;
        assert!((EVENT.can_occur)(&game));
        let messages = (EVENT.execute)(&mut game);
        assert_eq!(game.ship.shields, shields + points);
        assert_eq!(game.ship.energy, energy - cost);
        assert_eq!(messages, [format!("Shields recharged by {points} using {cost} energy")]);
    }
}

#[test]
fn the_cost_rounds_up_so_a_recharge_is_never_free() {
    let cases = [
        // points missing -> cost
        (1, 1),
        (SHIELD_POINTS_PER_ENERGY, 1),
        (SHIELD_POINTS_PER_ENERGY + 1, 2),
        (2 * SHIELD_POINTS_PER_ENERGY - 1, 2),
    ];
    for (missing, cost) in cases {
        let mut game = board(EMPTY_WITH_SHIP_AT_00);
        game.ship.shields = SHIP_MAX_SHIELDS - missing;
        (EVENT.execute)(&mut game);
        assert_eq!(game.ship.shields, SHIP_MAX_SHIELDS);
        assert_eq!(game.ship.energy, SHIP_MAX_ENERGY - cost);
    }
}

#[test]
fn the_same_recharge_takes_a_limit() {
    let mut game = board(EMPTY_WITH_SHIP_AT_00);
    game.ship.shields = 0;
    recharge_shields(&mut game, SHIP_MAX_SHIELDS);
    assert_eq!(game.ship.shields, SHIP_MAX_SHIELDS);
    assert_eq!(game.ship.energy, SHIP_MAX_ENERGY - SHIP_MAX_SHIELDS / SHIELD_POINTS_PER_ENERGY);
}

#[test]
fn a_recharge_of_nothing_says_nothing() {
    let mut game = board(EMPTY_WITH_SHIP_AT_00);
    assert!(recharge_shields(&mut game, SHIP_MAX_SHIELDS).is_empty());
    game.ship.shields = 0;
    game.ship.energy = 0;
    assert!(recharge_shields(&mut game, SHIP_MAX_SHIELDS).is_empty());
    assert_eq!(game.ship.shields, 0);
}

#[test]
fn does_not_fire_at_full_shields_or_without_energy() {
    let mut game = board(EMPTY_WITH_SHIP_AT_00);
    assert!(!(EVENT.can_occur)(&game));
    game.ship.shields = 0;
    game.ship.energy = 0;
    assert!(!(EVENT.can_occur)(&game));
    game.ship.energy = 1;
    assert!((EVENT.can_occur)(&game));
}
