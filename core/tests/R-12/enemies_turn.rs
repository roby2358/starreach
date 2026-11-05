//! R-12: in an enemies' turn each enemy acts once, advancing with probability
//! ENEMY_ADVANCE_FRACTION, else firing.
use crate::helpers::*;
use starreach_core::constants::*;
use starreach_core::events::enemies_turn;
use starreach_core::rng::Rng;

fn acts(messages: &[String]) -> usize {
    messages.iter().filter(|m| !m.starts_with("Ship takes")).count()
}

#[test]
fn every_enemy_acts_exactly_once() {
    let mut game = board([
        "S.........", "..........", "..........", "..........", "....E.....",
        "..........", "..........", "..........", "E.........", ".........E",
    ]);
    for seed in 0..20 {
        game.rng = Rng::seeded(seed);
        let mut turn = game.clone();
        assert_eq!(acts(&enemies_turn(&mut turn)), 3);
    }
}

#[test]
fn a_lone_enemy_advances_at_the_set_rate() {
    let mut game = board([
        "S.........", "..........", "..........", "..........", "..........",
        "..........", "..........", "..........", "..........", ".........E",
    ]);
    let trials = 3000;
    let mut advances = 0;
    for seed in 0..trials {
        game.rng = Rng::seeded(seed);
        let mut turn = game.clone();
        advances += enemies_turn(&mut turn).iter().filter(|m| m.starts_with("Enemy advanced")).count();
    }
    let share = advances as f64 / trials as f64;
    assert!((share - ENEMY_ADVANCE_FRACTION).abs() < 0.04, "advancing share {share}");
}
