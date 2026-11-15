//! R-32: a blast's kill chance falls with range, and the roll comes from the game's rng.
use crate::helpers::*;
use starreach_core::actions::blast_kill_chance;
use starreach_core::constants::*;
use starreach_core::rng::Rng;

const ONE_AT_RANGE_6: [&str; 10] = [
    "S.....E...", "..........", "..........", "..........", "..........",
    "..........", "..........", "..........", "..........", "..........",
];

fn near(a: f64, b: f64) -> bool {
    (a - b).abs() < 1e-9
}

#[test]
fn the_chance_is_the_near_chance_up_to_the_sure_range() {
    for range in [1.0, std::f64::consts::SQRT_2, 2.0, BLAST_SURE_RANGE] {
        assert!(near(blast_kill_chance(range), BLAST_KILL_CHANCE_NEAR), "range {range}");
    }
}

#[test]
fn the_chance_is_halfway_between_at_the_middle_of_the_falloff() {
    let middle = (BLAST_SURE_RANGE + BLAST_RANGE) / 2.0;
    let halfway = (BLAST_KILL_CHANCE_NEAR + BLAST_KILL_CHANCE_FAR) / 2.0;
    assert!(near(blast_kill_chance(middle), halfway));
}

#[test]
fn the_chance_is_the_far_chance_at_blast_range() {
    assert!(near(blast_kill_chance(BLAST_RANGE), BLAST_KILL_CHANCE_FAR));
}

#[test]
fn the_chance_falls_steadily_beyond_the_sure_range() {
    let steps = 60;
    let width = BLAST_RANGE - BLAST_SURE_RANGE;
    let mut previous = blast_kill_chance(BLAST_SURE_RANGE);
    for i in 1..=steps {
        let chance = blast_kill_chance(BLAST_SURE_RANGE + width * i as f64 / steps as f64);
        assert!(chance < previous, "step {i}");
        previous = chance;
    }
}

#[test]
fn over_many_seeds_the_kill_share_is_near_the_chance() {
    let seeds = 4000;
    let mut kills = 0;
    for seed in 0..seeds {
        let mut game = board(ONE_AT_RANGE_6);
        game.rng = Rng::seeded(seed);
        kills += run(&game, blast(0, 6)).game.sector.enemies_yx.is_empty() as u32;
    }
    let share = kills as f64 / seeds as f64;
    assert!((share - blast_kill_chance(6.0)).abs() < 0.03, "share {share}");
}

#[test]
fn the_same_seed_blasts_the_same_way() {
    for seed in 0..50 {
        let mut game = board(ONE_AT_RANGE_6);
        game.rng = Rng::seeded(seed);
        assert_eq!(run(&game, blast(0, 6)), run(&game, blast(0, 6)));
    }
}
