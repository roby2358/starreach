//! R-9: blast. Range and cost are measured to the hit enemy.
use crate::helpers::*;
use starreach_core::constants::*;

#[test]
fn no_enemy_first_on_the_ray_is_refused() {
    let game = board([
        "S.*.E.....", "..........", "..........", "..........", "..........",
        "..........", "..........", "..........", "..........", "..........",
    ]);
    assert_refused(&game, blast(0, 4));
    assert_refused(&game, blast(5, 5));
}

#[test]
fn a_hit_enemy_beyond_range_is_refused() {
    let game = board([
        "S......E..", "..........", "..........", "..........", "..........",
        "..........", "..........", "..........", "..........", "..........",
    ]);
    assert_refused(&game, blast(0, 7));
}

#[test]
fn a_far_target_is_fine_when_the_hit_enemy_is_in_range() {
    let game = board([
        "S...E.....", "..........", "..........", "..........", "..........",
        "..........", "..........", "..........", "..........", "..........",
    ]);
    let applied = run(&game, blast(0, 9));
    assert!(applied.result.ok);
    assert_eq!(report(&applied)["hit_yx"], serde_json::json!([0, 4]));
}

#[test]
fn energy_below_the_cost_is_refused() {
    let mut game = board([
        "S...E.....", "..........", "..........", "..........", "..........",
        "..........", "..........", "..........", "..........", "..........",
    ]);
    game.ship.energy = (BLAST_ENERGY_BASE * 2.0) as i32 - 1;
    assert_refused(&game, blast(0, 4));
}

#[test]
fn a_hit_destroys_the_enemy_and_pays_by_range() {
    let game = board([
        "S...E.....", "..........", "..........", "..........", "..........",
        "..........", "..........", "..........", "..........", ".........E",
    ]);
    let next = run(&game, blast(0, 4)).game;
    let root = 4f64.sqrt();
    assert_eq!(next.sector.enemies_yx, vec![(9, 9)]);
    assert_eq!(next.ship.energy, game.ship.energy - (BLAST_ENERGY_BASE * root) as i32);
    assert_eq!(next.stardate, game.stardate + (BLAST_TIME_A + BLAST_TIME_B * root).trunc());
}
