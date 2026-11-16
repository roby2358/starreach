//! R-41: a new game sets `GOALS_PER_GAME` goals from its seed, each a rung of a different
//! offered counter at or below that counter's ceiling, without moving the galaxy or the play.
use std::collections::{BTreeMap, BTreeSet};

use crate::helpers::*;
use starreach_core::constants::GOALS_PER_GAME;
use starreach_core::galaxy::Galaxy;
use starreach_core::goals::{goal_amounts, Goal};
use starreach_core::rng::Rng;
use starreach_core::{apply_json, counter_table, ladder_standing, new_game_json, Command};

const SEEDS: std::ops::Range<u32> = 0..2000;

fn goals_of(seed: u32) -> Vec<Goal> {
    new_game(seed).goals
}

#[test]
fn a_new_game_has_three_unmet_goals_on_different_counters() {
    assert_eq!(GOALS_PER_GAME, 3);
    for seed in SEEDS {
        let goals = goals_of(seed);
        let counters: BTreeSet<&str> = goals.iter().map(|goal| goal.counter.key).collect();
        assert_eq!(goals.len(), GOALS_PER_GAME, "seed {seed}");
        assert_eq!(counters.len(), GOALS_PER_GAME, "seed {seed}");
        assert!(goals.iter().all(|goal| !goal.met), "seed {seed}");
    }
}

#[test]
fn the_same_seed_gives_the_same_goals_whenever_the_game_starts() {
    for seed in [0, 1, 99, u32::MAX] {
        let later = starreach_core::new_game(seed, START_UNIX_SECONDS + 86_400);
        assert_eq!(goals_of(seed), goals_of(seed));
        assert_eq!(goals_of(seed), later.goals);
    }
    let distinct: BTreeSet<String> = SEEDS.map(|seed| format!("{:?}", goals_of(seed))).collect();
    assert!(distinct.len() > 100, "seeds should differ in their goals");
}

#[test]
fn every_amount_is_a_rung_of_its_counter_at_or_below_the_ceiling() {
    for seed in SEEDS {
        for goal in goals_of(seed) {
            let standing = ladder_standing(goal.counter.key, goal.amount as u64).unwrap();
            assert_eq!(standing.reached, Some(goal.amount as u64), "seed {seed}: {goal:?} is not a rung");
            assert!(goal.amount <= goal.counter.goal_ceiling, "seed {seed}: {goal:?} is above the ceiling");
        }
    }
}

#[test]
fn no_negative_counter_and_no_counter_with_a_zero_ceiling_is_ever_a_goal() {
    for seed in SEEDS {
        for goal in goals_of(seed) {
            assert!(goal.counter.may_be_goal, "seed {seed}: {goal:?}");
            assert!(goal.counter.goal_ceiling > 0, "seed {seed}: {goal:?}");
        }
    }
}

#[test]
fn a_counter_offers_the_rungs_under_its_ceiling_and_none_when_it_may_not_be_a_goal() {
    let amounts = |key: &str| goal_amounts(counter_table().iter().find(|row| row.key == key).unwrap());
    assert_eq!(amounts("enemies_destroyed"), [10, 20, 50, 100]);
    assert_eq!(amounts("starbases_discovered"), [1, 2]);
    assert_eq!(amounts("games_won"), Vec::<u32>::new());
    assert_eq!(amounts("shield_damage"), Vec::<u32>::new());
    let offered = counter_table().iter().filter(|row| !goal_amounts(row).is_empty()).count();
    assert!(offered >= GOALS_PER_GAME, "the table must offer a counter per goal");
}

/// Every offered counter comes up about equally often, and each of its amounts comes up.
#[test]
fn over_many_seeds_every_offered_counter_and_amount_comes_up_evenly() {
    let mut chosen: BTreeMap<&str, Vec<u32>> = BTreeMap::new();
    for seed in SEEDS {
        for goal in goals_of(seed) {
            chosen.entry(goal.counter.key).or_default().push(goal.amount);
        }
    }
    let offered: Vec<_> = counter_table().iter().filter(|row| !goal_amounts(row).is_empty()).collect();
    let expected = (SEEDS.len() * GOALS_PER_GAME / offered.len()) as f64;
    for row in offered {
        let amounts = &chosen[row.key];
        let share = amounts.len() as f64 / expected;
        assert!((0.85..1.15).contains(&share), "{} came up {} times, expected about {expected}", row.key, amounts.len());
        let distinct: BTreeSet<u32> = amounts.iter().copied().collect();
        assert_eq!(distinct.into_iter().collect::<Vec<u32>>(), goal_amounts(row), "{}", row.key);
    }
}

/// The goals come from their own stream: the galaxy and the game stream are exactly what
/// generating the galaxy from the seed leaves.
#[test]
fn choosing_the_goals_moves_neither_the_galaxy_nor_the_game_stream() {
    for seed in [0, 1, 99, u32::MAX] {
        let mut rng = Rng::seeded(seed);
        let galaxy = Galaxy::generate(&mut rng);
        let game = new_game(seed);
        assert_eq!(game.galaxy, galaxy);
        assert_eq!(game.rng, rng);
    }
}

#[test]
fn the_state_reports_each_goal_with_its_label_count_and_amount() {
    let game = new_game(SEED);
    let state = run(&game, Command::State).result.state;
    assert_eq!(state.goals.len(), GOALS_PER_GAME);
    for (shown, goal) in state.goals.iter().zip(&game.goals) {
        assert_eq!(shown.counter, goal.counter.key);
        assert_eq!(shown.label, goal.counter.label);
        assert_eq!((shown.count, shown.amount, shown.met), (0, goal.amount, false));
    }
}

#[test]
fn the_goals_survive_the_json_boundary_under_their_counter_keys() {
    let game = new_game(SEED);
    let stored: serde_json::Value = serde_json::from_str(&new_game_json(SEED, START_UNIX_SECONDS)).unwrap();
    let keys: Vec<&str> = stored["goals"].as_array().unwrap().iter().map(|goal| goal["counter"].as_str().unwrap()).collect();
    assert_eq!(keys, game.goals.iter().map(|goal| goal.counter.key).collect::<Vec<&str>>());
    assert_eq!(serde_json::from_value::<starreach_core::Game>(stored).unwrap(), game);
}

#[test]
fn a_stored_game_without_goals_or_with_an_unknown_counter_is_not_a_game() {
    let state = r#"{"type":"state"}"#;
    let mut without: serde_json::Value = serde_json::from_str(&new_game_json(SEED, START_UNIX_SECONDS)).unwrap();
    let mut unknown = without.clone();
    without.as_object_mut().unwrap().remove("goals");
    unknown["goals"][0]["counter"] = "no_such_counter".into();
    assert!(apply_json(&without.to_string(), state).is_err());
    assert!(apply_json(&unknown.to_string(), state).is_err());
}
