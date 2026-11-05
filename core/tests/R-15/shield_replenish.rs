//! R-15: shield replenish moves energy into shields.
use crate::helpers::*;
use starreach_core::constants::*;
use starreach_core::events::SHIELD_REPLENISH_EVENT as EVENT;

#[test]
fn recharges_by_the_smallest_of_the_three_limits() {
    let cases = [
        // (shields, energy) -> amount
        (0, SHIP_MAX_ENERGY, SHIELD_REPLENISH),
        (SHIP_MAX_SHIELDS - 100, SHIP_MAX_ENERGY, 100),
        (0, 50 * SHIELD_ENERGY_PER_POINT, 50),
    ];
    for (shields, energy, amount) in cases {
        let mut game = board(EMPTY_WITH_SHIP_AT_00);
        game.ship.shields = shields;
        game.ship.energy = energy;
        assert!((EVENT.can_occur)(&game));
        (EVENT.execute)(&mut game);
        assert_eq!(game.ship.shields, shields + amount);
        assert_eq!(game.ship.energy, energy - amount * SHIELD_ENERGY_PER_POINT);
    }
}

#[test]
fn does_not_fire_at_full_shields_or_without_energy() {
    let mut game = board(EMPTY_WITH_SHIP_AT_00);
    assert!(!(EVENT.can_occur)(&game));
    game.ship.shields = 0;
    game.ship.energy = SHIELD_ENERGY_PER_POINT - 1;
    assert!(!(EVENT.can_occur)(&game));
}
