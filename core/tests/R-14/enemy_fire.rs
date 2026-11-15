//! R-14: enemy fire, at a given damage factor (the factor's band is R-33).
use crate::helpers::*;
use starreach_core::constants::*;
use starreach_core::events::{enemy_fire, enemy_fire_by, fire_base_damage, fire_damage};

const TWO_AWAY: [&str; 10] = [
    "S.E.......", "..........", "..........", "..........", "..........",
    "..........", "..........", "..........", "..........", "..........",
];


#[test]
fn a_blocked_ray_deals_no_damage() {
    let mut game = board([
        "S*E.......", "..........", "..........", "..........", "..........",
        "..........", "..........", "..........", "..........", "..........",
    ]);
    let before = game.ship.clone();
    enemy_fire(&mut game, 0);
    assert_eq!(game.ship, before);
}

#[test]
fn shields_absorb_first_and_the_rest_goes_to_hull() {
    let mut game = board(TWO_AWAY);
    game.ship.shields = 100;
    enemy_fire_by(&mut game, 0, 1.0);
    assert_eq!(game.ship.shields, 0);
    assert_eq!(game.ship.hull, SHIP_MAX_HULL - (fire_damage(2.0, 1.0) - 100));
}

#[test]
fn neither_drops_below_zero() {
    let mut game = board(TWO_AWAY);
    game.ship.shields = 0;
    game.ship.hull = 10;
    enemy_fire(&mut game, 0);
    assert_eq!((game.ship.shields, game.ship.hull), (0, 0));
}

// The damage profile before the factor: base at 1 cell, near at the near range, far at the far
// range and beyond, exponential between near and far.
#[test]
fn damage_is_base_at_one_cell_near_at_the_near_range_and_far_beyond_the_far_range() {
    assert_eq!(fire_base_damage(1.0), ENEMY_FIRE_BASE);
    assert!((fire_base_damage(ENEMY_FIRE_NEAR_RANGE) - ENEMY_FIRE_NEAR).abs() < 1e-9);
    assert!((fire_base_damage(ENEMY_FIRE_FAR_RANGE) - ENEMY_FIRE_FAR).abs() < 1e-9);
    assert_eq!(fire_base_damage(12.73), ENEMY_FIRE_FAR);
}

#[test]
fn between_near_and_far_damage_falls_by_the_same_ratio_per_cell() {
    let middle = (ENEMY_FIRE_NEAR_RANGE + ENEMY_FIRE_FAR_RANGE) / 2.0;
    let geometric_mean = (ENEMY_FIRE_NEAR * ENEMY_FIRE_FAR).sqrt();
    assert!((fire_base_damage(middle) - geometric_mean).abs() < 1e-6);
    let ratio = fire_base_damage(ENEMY_FIRE_NEAR_RANGE + 1.0) / ENEMY_FIRE_NEAR;
    let mut r = ENEMY_FIRE_NEAR_RANGE + 1.0;
    while r < ENEMY_FIRE_FAR_RANGE {
        assert!((fire_base_damage(r + 1.0) / fire_base_damage(r) - ratio).abs() < 1e-9, "{r}");
        r += 1.0;
    }
}

#[test]
fn damage_strictly_falls_out_to_the_far_range_at_every_factor() {
    for factor in [ENEMY_FIRE_VARIANCE_MIN, 1.0, ENEMY_FIRE_VARIANCE_MAX] {
        let mut previous = fire_damage(1.0, factor);
        for step in 1..=80 {
            let d = 1.0 + (ENEMY_FIRE_FAR_RANGE - 1.0) * step as f64 / 80.0;
            let damage = fire_damage(d, factor);
            assert!(damage < previous, "{d} at {factor}");
            previous = damage;
        }
        assert_eq!(fire_damage(ENEMY_FIRE_FAR_RANGE, factor), (ENEMY_FIRE_FAR * factor).round() as i32);
    }
}
