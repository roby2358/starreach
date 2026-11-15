//! R-33: enemy fire damage is scaled by a factor drawn from the game's rng, within the band.
use crate::helpers::*;
use starreach_core::constants::*;
use starreach_core::events::{enemy_fire, fire_damage, fire_factor};
use starreach_core::rng::Rng;
use std::collections::BTreeSet;

const TWO_AWAY: [&str; 10] = [
    "S.E.......", "..........", "..........", "..........", "..........",
    "..........", "..........", "..........", "..........", "..........",
];

/// Damage the ship takes from one shot at distance 2, with the game's rng seeded.
fn damage_taken(seed: u32) -> i32 {
    let mut game = board(TWO_AWAY);
    game.rng = Rng::seeded(seed);
    let shields = game.ship.shields;
    enemy_fire(&mut game, 0);
    shields - game.ship.shields
}

#[test]
fn the_factor_spans_the_band() {
    assert_eq!(fire_factor(0.0), ENEMY_FIRE_VARIANCE_MIN);
    assert_eq!(fire_factor(0.5), (ENEMY_FIRE_VARIANCE_MIN + ENEMY_FIRE_VARIANCE_MAX) / 2.0);
    assert!(fire_factor(0.999_999) < ENEMY_FIRE_VARIANCE_MAX);
}

#[test]
fn damage_stays_within_the_band() {
    let low = fire_damage(2.0, ENEMY_FIRE_VARIANCE_MIN);
    let high = fire_damage(2.0, ENEMY_FIRE_VARIANCE_MAX);
    for seed in 0..1000 {
        let taken = damage_taken(seed);
        assert!(low <= taken && taken <= high, "seed {seed}: {taken} outside {low}..{high}");
    }
}

#[test]
fn damage_varies_across_seeds() {
    let seen: BTreeSet<i32> = (0..200).map(damage_taken).collect();
    assert!(seen.len() > 50, "only {} distinct damages", seen.len());
}

#[test]
fn the_same_seed_deals_the_same_damage() {
    for seed in 0..50 {
        assert_eq!(damage_taken(seed), damage_taken(seed));
    }
}
