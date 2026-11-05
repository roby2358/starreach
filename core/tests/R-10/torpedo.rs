//! R-10: torpedo.
use crate::helpers::*;
use starreach_core::constants::*;

const FAR_ENEMY: [&str; 10] = [
    "S........E", "..........", "..........", "..........", "..........",
    "..........", "..........", "..........", "..........", "....E.....",
];

#[test]
fn no_torpedoes_is_refused() {
    let mut game = board(FAR_ENEMY);
    game.ship.quantorpedoes = 0;
    assert_refused(&game, torpedo(0, 9));
}

#[test]
fn energy_below_the_cost_is_refused() {
    let mut game = board(FAR_ENEMY);
    game.ship.energy = TORPEDO_ENERGY - 1;
    assert_refused(&game, torpedo(0, 9));
}

#[test]
fn no_enemy_first_on_the_ray_is_refused() {
    let game = board(FAR_ENEMY);
    assert_refused(&game, torpedo(5, 0));
}

#[test]
fn a_hit_at_any_range_destroys_the_enemy_and_spends_a_torpedo() {
    let game = board(FAR_ENEMY);
    let next = run(&game, torpedo(0, 9)).game;
    assert_eq!(next.sector.enemies_yx, vec![(9, 4)]);
    assert_eq!(next.ship.quantorpedoes, game.ship.quantorpedoes - 1);
    assert_eq!(next.ship.energy, game.ship.energy - TORPEDO_ENERGY);
    assert_eq!(next.stardate, game.stardate + TORPEDO_TIME);
}
