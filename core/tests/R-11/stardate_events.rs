//! R-11: stardate events run when enough time has built up, and short actions accumulate.
use crate::helpers::*;
use starreach_core::constants::*;

#[test]
fn short_actions_accumulate_until_the_interval() {
    let mut game = board(EMPTY_WITH_SHIP_AT_00);
    game.ship.shields = 0;
    let start = game.last_event_stardate;
    let mut events_seen = Vec::new();
    for x in 1..=EVENT_INTERVAL as i32 {
        let applied = run(&game, subwarp(0, x));
        events_seen.push(applied.result.events.clone());
        game = applied.game;
    }
    let last = events_seen.pop().unwrap();
    assert!(events_seen.iter().all(Vec::is_empty), "nothing runs before the interval");
    assert!(last[0].starts_with("Shields recharged"));
    assert!(game.last_event_stardate > start);
    assert_eq!(game.last_event_stardate, game.stardate);
}

#[test]
fn the_clock_does_not_move_until_events_run() {
    let game = board(EMPTY_WITH_SHIP_AT_00);
    let next = run(&game, subwarp(0, 1)).game;
    assert_eq!(next.last_event_stardate, game.last_event_stardate);
}

#[test]
fn shield_replenish_runs_before_the_enemies_turn() {
    let mut game = board([
        "S.........", "..........", "..........", "..........", "..........",
        "..........", "..........", "..........", "..........", ".........E",
    ]);
    game.ship.shields = 0;
    let events = run(&game, subwarp(0, 3)).result.events;
    assert!(events[0].starts_with("Shields recharged"));
    assert!(events[1].starts_with("Enemy"));
}

#[test]
fn only_events_that_can_occur_run() {
    let game = board(EMPTY_WITH_SHIP_AT_00);
    let applied = run(&game, subwarp(0, 3));
    assert!(applied.result.events.is_empty());
    assert_eq!(applied.game.last_event_stardate, applied.game.stardate);
}
