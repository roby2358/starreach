//! R-31: on arrival each enemy fires once with probability ENEMY_AMBUSH_CHANCE.
use crate::helpers::*;
use starreach_core::constants::*;
use starreach_core::events::{ambush, fire_damage};
use starreach_core::geometry::euclid;
use starreach_core::rng::Rng;
use starreach_core::Status;

const THREE_IN_THE_OPEN: [&str; 10] = [
    "S.........", "..E.......", "..........", "..........", ".......E..",
    "..........", "..........", "..........", "..........", "....E.....",
];

fn fires(events: &[String]) -> usize {
    events.iter().filter(|e| e.contains("fires raxxon beam")).count()
}

fn hostile_arrival(seed: u32, enemies: u32) -> starreach_core::Applied {
    let mut game = board(EMPTY_WITH_SHIP_AT_00);
    game.galaxy.record_mut((4, 6)).enemies = enemies;
    game.rng = Rng::seeded(seed);
    run(&game, warp(4, 6))
}

#[test]
fn arriving_in_an_empty_sector_draws_no_fire() {
    for seed in 0..200 {
        let applied = hostile_arrival(seed, 0);
        assert_eq!(fires(&applied.result.events), 0);
        assert_eq!(applied.game.ship.shields, SHIP_MAX_SHIELDS);
    }
}

#[test]
fn each_enemy_fires_at_most_once() {
    let mut game = board(THREE_IN_THE_OPEN);
    let all = ambush(&mut game, 1.0);
    assert_eq!(fires(&all), 3);
    let mut game = board(THREE_IN_THE_OPEN);
    assert_eq!(fires(&ambush(&mut game, 0.0)), 0);
}

#[test]
fn ambush_damage_is_the_enemy_fire_damage_for_the_distance() {
    let mut game = board([
        "S.........", "..........", "..........", "...E......", "..........",
        "..........", "..........", "..........", "..........", "..........",
    ]);
    let shields = game.ship.shields;
    ambush(&mut game, 1.0);
    let distance = euclid((0, 0), (3, 3));
    let taken = shields - game.ship.shields;
    assert!(taken >= fire_damage(distance, ENEMY_FIRE_VARIANCE_MIN), "{taken}");
    assert!(taken <= fire_damage(distance, ENEMY_FIRE_VARIANCE_MAX), "{taken}");
}

#[test]
fn a_blocked_ambush_shot_does_no_damage() {
    let mut game = board([
        "S*E.......", "..........", "..........", "..........", "..........",
        "..........", "..........", "..........", "..........", "..........",
    ]);
    let events = ambush(&mut game, 1.0);
    assert!(events[0].contains("blocked"));
    assert_eq!(game.ship.shields, SHIP_MAX_SHIELDS);
}

#[test]
fn the_same_seed_ambushes_the_same_way() {
    for seed in 0..20 {
        assert_eq!(hostile_arrival(seed, 3), hostile_arrival(seed, 3));
    }
}

#[test]
fn over_many_seeds_about_the_ambush_chance_of_enemies_fire() {
    let seeds = 4000;
    let mut shots = 0;
    for seed in 0..seeds {
        let mut game = board(THREE_IN_THE_OPEN);
        game.rng = Rng::seeded(seed);
        shots += fires(&ambush(&mut game, ENEMY_AMBUSH_CHANCE));
    }
    let share = shots as f64 / (seeds * 3) as f64;
    assert!((share - ENEMY_AMBUSH_CHANCE).abs() < 0.02, "share {share}");
}

#[test]
fn a_fatal_ambush_ends_the_game() {
    let mut lost = 0;
    for seed in 0..200 {
        let mut game = board(EMPTY_WITH_SHIP_AT_00);
        game.galaxy.record_mut((4, 6)).enemies = 3;
        game.ship.hull = 1;
        game.ship.shields = 0;
        // No shields to recharge on the way, so the first hit lands on the hull.
        game.ship.max_shields = 0;
        game.rng = Rng::seeded(seed);
        let applied = run(&game, warp(4, 6));
        let was_hit = applied.result.events.iter().any(|e| e.starts_with("Ship takes"));
        assert_eq!(applied.game.status == Status::Lost, was_hit, "seed {seed}");
        assert_eq!(applied.game.ship.hull == 0, was_hit);
        lost += was_hit as u32;
    }
    assert!(lost > 0);
}
