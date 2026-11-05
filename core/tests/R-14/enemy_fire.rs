//! R-14: enemy fire.
use crate::helpers::*;
use starreach_core::constants::*;
use starreach_core::events::{enemy_fire, fire_damage};

const TWO_AWAY: [&str; 10] = [
    "S.E.......", "..........", "..........", "..........", "..........",
    "..........", "..........", "..........", "..........", "..........",
];

fn expected(distance: f64) -> i32 {
    (ENEMY_FIRE_BASE * (1.0 / distance).powf(ENEMY_FIRE_FALLOFF)).round() as i32
}

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
    enemy_fire(&mut game, 0);
    assert_eq!(game.ship.shields, 0);
    assert_eq!(game.ship.hull, SHIP_MAX_HULL - (expected(2.0) - 100));
}

#[test]
fn neither_drops_below_zero() {
    let mut game = board(TWO_AWAY);
    game.ship.shields = 0;
    game.ship.hull = 10;
    enemy_fire(&mut game, 0);
    assert_eq!((game.ship.shields, game.ship.hull), (0, 0));
}

#[test]
fn damage_follows_the_formula_and_falls_with_distance() {
    for d in 1..12 {
        assert_eq!(fire_damage(d as f64), expected(d as f64));
        assert!(fire_damage(d as f64) > fire_damage(d as f64 + 1.0));
    }
}
