//! R-42: after an accepted action, a goal whose counter has reached its amount becomes met,
//! once, and Star Central says so in the events, after the game's own.
use crate::helpers::*;
use starreach_core::counters::counter_row;
use starreach_core::game::Game;
use starreach_core::geometry::all_cells;
use starreach_core::goals::Goal;
use starreach_core::messages::objective_message;
use starreach_core::rng::Rng;
use starreach_core::{Command, Status};

fn goal(key: &str, amount: u32) -> Goal {
    Goal { counter: counter_row(key).unwrap(), amount, met: false }
}

/// The ship with three enemies in a row to its right, far enough to shoot one at a time, and
/// the given goals in place of the seed's.
fn battle(goals: Vec<Goal>) -> Game {
    let mut game = board([
        "S.....EEE.", "..........", "..........", "..........", "..........",
        "..........", "..........", "..........", "..........", "..........",
    ]);
    game.goals = goals;
    game
}

fn central(events: &[String]) -> Vec<&String> {
    events.iter().filter(|event| event.starts_with("Star Central")).collect()
}

/// The message the core sends for the game's goal `index` being met.
fn announcement(game: &Game, index: usize) -> String {
    let goal = &game.goals[index];
    objective_message(goal.counter, goal.amount as u64, Rng::for_goal_message(game.seed, index).unit())
}

#[test]
fn reaching_the_amount_marks_the_goal_met_and_says_so_exactly_once() {
    let game = battle(vec![goal("torpedoes_fired", 2), goal("docks", 5), goal("scans", 5)]);

    let first = run(&game, torpedo(6, 0));
    let second = run(&first.game, torpedo(7, 0));
    let third = run(&second.game, torpedo(8, 0));

    assert!(!first.game.goals[0].met);
    assert!(central(&first.result.events).is_empty());
    assert!(second.game.goals[0].met);
    assert_eq!(central(&second.result.events), [&announcement(&game, 0)]);
    assert!(third.game.goals[0].met);
    assert!(central(&third.result.events).is_empty());
}

#[test]
fn the_message_names_the_goals_label_and_amount() {
    let game = battle(vec![goal("torpedoes_fired", 1), goal("docks", 5), goal("scans", 5)]);
    let message = central(&run(&game, torpedo(6, 0)).result.events)[0].clone();
    assert!(message.contains("torpedoes fired"), "{message}");
    assert!(message.contains('1'), "{message}");
}

#[test]
fn the_state_shows_the_count_rising_and_the_goal_met() {
    let game = battle(vec![goal("torpedoes_fired", 2), goal("docks", 5), goal("scans", 5)]);
    let first = run(&game, torpedo(6, 0));
    let second = run(&first.game, torpedo(7, 0));
    let shown = |applied: &starreach_core::Applied| {
        let goal = &applied.result.state.goals[0];
        (goal.count, goal.amount, goal.met)
    };
    assert_eq!(shown(&first), (1, 2, false));
    assert_eq!(shown(&second), (2, 2, true));
}

#[test]
fn one_action_can_meet_several_goals_each_announced_in_goal_order() {
    let game = battle(vec![goal("enemies_destroyed", 1), goal("docks", 5), goal("torpedoes_fired", 1)]);
    let applied = run(&game, torpedo(6, 0));
    assert_eq!(central(&applied.result.events), [&announcement(&game, 0), &announcement(&game, 2)]);
    assert_eq!(applied.game.goals.iter().map(|goal| goal.met).collect::<Vec<bool>>(), [true, false, true]);
}

#[test]
fn the_message_comes_after_the_games_own_events_even_the_end_of_the_game() {
    let mut game = board([
        "S..E......", "..........", "..........", "..........", "..........",
        "..........", "..........", "..........", "..........", "..........",
    ]);
    for xy in all_cells().filter(|&xy| xy != game.sector_xy) {
        game.galaxy.record_mut(xy).enemies = 0;
    }
    game.goals = vec![goal("enemies_destroyed", 1), goal("docks", 5), goal("scans", 5)];

    let applied = run(&game, torpedo(3, 0));

    assert_eq!(applied.game.status, Status::Won);
    let events = &applied.result.events;
    assert_eq!(events[events.len() - 2], "Every enemy in the galaxy is destroyed");
    assert_eq!(events[events.len() - 1], announcement(&game, 0));
}

#[test]
fn a_met_goal_stays_met_and_is_not_announced_again() {
    let mut game = battle(vec![goal("torpedoes_fired", 5), goal("docks", 5), goal("scans", 5)]);
    game.goals[0].met = true;
    let applied = run(&game, torpedo(6, 0));
    assert!(applied.game.goals[0].met);
    assert!(central(&applied.result.events).is_empty());
}

/// The check belongs to accepted actions: a query and a refused command leave a goal alone,
/// even one whose count is already there.
#[test]
fn a_query_and_a_refused_command_check_no_goal() {
    let mut game = battle(vec![goal("torpedoes_fired", 1), goal("docks", 5), goal("scans", 5)]);
    game.counters.torpedoes_fired = 1;

    let query = run(&game, Command::State);
    assert!(!query.game.goals[0].met);
    assert!(query.result.events.is_empty());
    assert_refused(&game, Command::Dock);

    let action = run(&game, subwarp(0, 1));
    assert!(action.game.goals[0].met);
}

/// Announcing a goal draws nothing from the game stream: the same commands leave the same game
/// whether the goal is met on the way or far out of reach.
#[test]
fn a_game_plays_the_same_whether_or_not_a_goal_is_announced() {
    let commands = [torpedo(6, 0), blast(7, 0), subwarp(0, 3), torpedo(8, 0), Command::LongRangeScan];
    let play = |amount: u32| {
        let start = battle(vec![goal("torpedoes_fired", amount), goal("docks", 5), goal("scans", 5)]);
        commands.iter().fold(start, |game, command| run(&game, command.clone()).game)
    };
    let (mut met, unmet) = (play(1), play(50));
    assert!(met.goals[0].met && !unmet.goals[0].met);
    met.goals = unmet.goals.clone();
    assert_eq!(met, unmet);
}

/// The wording depends on the seed and the goal's place among the game's goals, and on nothing
/// that happens in play.
#[test]
fn the_wording_is_fixed_by_the_seed_and_the_goals_index() {
    let rolls = |seed: u32| (0..3).map(|index| Rng::for_goal_message(seed, index).unit()).collect::<Vec<f64>>();
    assert_eq!(rolls(SEED), rolls(SEED));
    assert_ne!(rolls(SEED), rolls(SEED + 1));
    assert_ne!(rolls(SEED)[0], rolls(SEED)[1]);
    assert!(rolls(SEED).iter().all(|roll| (0.0..1.0).contains(roll)));
}
