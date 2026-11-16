//! A game's goals (ONTOLOGY "Goal", "Goal check", D-47).
//!
//! A new game sets `GOALS_PER_GAME` goals from its seed, each an amount of a different counter
//! to reach within this game. After every accepted action a goal whose counter has reached its
//! amount becomes met, once, and Star Central says so in the command's events (D-48).

use serde::{Deserialize, Deserializer, Serialize, Serializer};

use crate::constants::GOALS_PER_GAME;
use crate::counters::{counter_row, CounterRow, Counters, COUNTER_TABLE};
use crate::game::Game;
use crate::ladder::rungs_up_to;
use crate::messages::objective_message;
use crate::rng::Rng;

/// One objective of a game: reach `amount` on `counter` in this game. It travels with the
/// counter's key; a key that names no counter doesn't parse.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Goal {
    #[serde(serialize_with = "row_as_key", deserialize_with = "row_from_key")]
    pub counter: &'static CounterRow,
    pub amount: u32,
    pub met: bool,
}

/// A goal as a Result shows it: the counter's key and label, this game's count on it so far,
/// the amount to reach, and whether it has been met.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct GoalState {
    pub counter: String,
    pub label: String,
    pub count: u32,
    pub amount: u32,
    pub met: bool,
}

fn row_as_key<S: Serializer>(row: &&'static CounterRow, serializer: S) -> Result<S::Ok, S::Error> {
    serializer.serialize_str(row.key)
}

fn row_from_key<'de, D: Deserializer<'de>>(deserializer: D) -> Result<&'static CounterRow, D::Error> {
    let key = String::deserialize(deserializer)?;
    counter_row(&key).ok_or_else(|| serde::de::Error::custom(format!("no counter \"{key}\"")))
}

impl Goal {
    fn count(&self, counters: &Counters) -> u32 {
        counters.value(self.counter.key).expect("a counter table key names a counter")
    }

    pub fn state(&self, counters: &Counters) -> GoalState {
        GoalState {
            counter: self.counter.key.to_string(),
            label: self.counter.label.to_string(),
            count: self.count(counters),
            amount: self.amount,
            met: self.met,
        }
    }
}

/// The amounts a goal on this counter may ask: the rungs of its ladder at or below its
/// `goal_ceiling`. Empty for a counter that may not be a goal or whose ceiling is below its
/// first rung.
pub fn goal_amounts(row: &CounterRow) -> Vec<u32> {
    if !row.may_be_goal {
        return Vec::new();
    }
    rungs_up_to(row.scale, row.goal_ceiling as u64).into_iter().map(|rung| rung as u32).collect()
}

/// The game's goals, from its seed alone: `GOALS_PER_GAME` different counters, each equally
/// likely among those with an amount to offer, and for each a random one of its amounts. The
/// draws come from the goals stream, so they move neither the galaxy nor the play (D-47).
pub fn choose(seed: u32) -> Vec<Goal> {
    let mut rng = Rng::for_goals(seed);
    let mut offered: Vec<(&'static CounterRow, Vec<u32>)> =
        COUNTER_TABLE.iter().map(|row| (row, goal_amounts(row))).filter(|(_, amounts)| !amounts.is_empty()).collect();
    (0..GOALS_PER_GAME)
        .map(|_| {
            let (counter, amounts) = offered.swap_remove(rng.index(offered.len()));
            Goal { counter, amount: amounts[rng.index(amounts.len())], met: false }
        })
        .collect()
}

/// Goal check: runs after every accepted action. Each goal not yet met whose counter has
/// reached its amount becomes met and adds Star Central's message to the events. The wording
/// is picked from the goal's own side stream of the seed, never from the game stream (D-48).
pub fn check(game: &mut Game, events: &mut Vec<String>) {
    let (seed, counters) = (game.seed, game.counters);
    for (index, goal) in game.goals.iter_mut().enumerate() {
        if goal.met || goal.count(&counters) < goal.amount {
            continue;
        }
        goal.met = true;
        let roll = Rng::for_goal_message(seed, index).unit();
        events.push(objective_message(goal.counter, goal.amount as u64, roll));
    }
}
