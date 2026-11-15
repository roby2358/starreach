//! R-9: blast. Range and cost are measured to the hit enemy; a hit or a miss pays the same.
use crate::helpers::*;
use starreach_core::actions::blast_by;
use starreach_core::constants::*;
use starreach_core::game::Game;

const KILL: f64 = 0.0;
const MISS: f64 = 0.999;

/// A board with an enemy at range 4 on row 0 and another in the far corner.
fn four_away() -> Game {
    board([
        "S...E.....", "..........", "..........", "..........", "..........",
        "..........", "..........", "..........", "..........", ".........E",
    ])
}

fn blast_rolled(game: &Game, roll: f64) -> (Game, Vec<String>) {
    let mut next = game.clone();
    let mut events = Vec::new();
    blast_by(&mut next, (0, 4), roll, &mut events).unwrap();
    (next, events)
}

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
        "S.........", "..........", "..........", "..........", "..........",
        "..........", "..........", "..........", "..........", ".........E",
    ]);
    assert_refused(&game, blast(9, 9));
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
fn a_kill_removes_the_enemy_and_pays_by_range() {
    let game = four_away();
    let (next, _) = blast_rolled(&game, KILL);
    let root = 4f64.sqrt();
    assert_eq!(next.sector.enemies_yx, vec![(9, 9)]);
    assert_eq!(next.ship.energy, game.ship.energy - (BLAST_ENERGY_BASE * root) as i32);
    assert_eq!(next.stardate, game.stardate + (BLAST_TIME_A + BLAST_TIME_B * root).trunc());
}

#[test]
fn a_miss_leaves_the_enemy_and_still_pays_energy_and_time() {
    let game = four_away();
    let (next, events) = blast_rolled(&game, MISS);
    let root = 4f64.sqrt();
    assert_eq!(next.sector.enemies_yx, game.sector.enemies_yx);
    assert_eq!(next.galaxy.record(TEST_SECTOR).enemies, 2);
    assert_eq!(next.ship.energy, game.ship.energy - (BLAST_ENERGY_BASE * root) as i32);
    assert_eq!(next.stardate, game.stardate + (BLAST_TIME_A + BLAST_TIME_B * root).trunc());
    assert!(events[0].starts_with("Blaston beam misses the enemy at (0, 4)"), "{events:?}");
}

#[test]
fn the_report_says_whether_the_enemy_was_destroyed() {
    let game = four_away();
    for (roll, destroyed) in [(KILL, true), (MISS, false)] {
        let mut next = game.clone();
        let shot = blast_by(&mut next, (0, 4), roll, &mut Vec::new()).unwrap();
        let shot = serde_json::to_value(&shot).unwrap();
        assert_eq!(shot["destroyed"], serde_json::json!(destroyed));
    }
}
