//! R-17: the stardate and duration display, and the clock a game starts at.
use crate::helpers::*;
use starreach_core::constants::*;
use starreach_core::game::{format_duration, format_stardate, start_startick};
use starreach_core::Command;

/// Stardate 1020773 exactly, in starticks.
const WHOLE: i64 = 1_020_773 * STARTICKS_PER_STARDATE;

#[test]
fn a_whole_stardate_shows_zero_decimals() {
    assert_eq!(format_stardate(WHOLE), "102.0773.00.0");
}

#[test]
fn the_remainder_gives_the_decimals() {
    assert_eq!(format_stardate(WHOLE + 146), "102.0773.36.5");
    assert_eq!(format_stardate(WHOLE + 200), "102.0773.50.0");
}

#[test]
fn the_third_decimal_is_truncated_not_rounded() {
    assert_eq!(format_stardate(WHOLE + 1), "102.0773.00.2");
    assert_eq!(format_stardate(WHOLE + 3), "102.0773.00.7");
    assert_eq!(format_stardate(WHOLE + 399), "102.0773.99.7");
}

#[test]
fn the_last_startick_of_a_stardate_rolls_into_the_next() {
    assert_eq!(format_stardate(WHOLE + STARTICKS_PER_STARDATE - 1), "102.0773.99.7");
    assert_eq!(format_stardate(WHOLE + STARTICKS_PER_STARDATE), "102.0774.00.0");
}

#[test]
fn the_whole_part_is_padded_to_seven_digits() {
    assert_eq!(format_stardate(0), "000.0000.00.0");
    assert_eq!(format_stardate(12_345 * STARTICKS_PER_STARDATE), "001.2345.00.0");
    assert_eq!(format_stardate(9_999_999 * STARTICKS_PER_STARDATE), "999.9999.00.0");
}

#[test]
fn every_startick_changes_the_display() {
    let shown: Vec<String> = (0..=STARTICKS_PER_STARDATE).map(|tick| format_stardate(WHOLE + tick)).collect();
    assert!(shown.windows(2).all(|pair| pair[0] < pair[1]), "each startick must show a later stardate");
}

#[test]
fn a_duration_leaves_the_whole_part_unpadded() {
    assert_eq!(format_duration(0), "0.00.0");
    assert_eq!(format_duration(1), "0.00.2");
    assert_eq!(format_duration(3), "0.00.7");
    assert_eq!(format_duration(5), "0.01.2");
    assert_eq!(format_duration(416), "1.04.0");
    assert_eq!(format_duration(12 * STARTICKS_PER_STARDATE + 399), "12.99.7");
}

#[test]
fn a_game_starts_at_the_real_date_moved_on_by_the_epoch_offset() {
    let day = 20_773;
    assert_eq!(start_startick(day * SECONDS_PER_STARDATE), (STARDATE_EPOCH_OFFSET + day) * STARTICKS_PER_STARDATE);
    assert_eq!(format_stardate(start_startick(day * SECONDS_PER_STARDATE)), "102.0773.00.0");
    assert_eq!(format_stardate(start_startick(0)), "100.0000.00.0");
}

#[test]
fn the_start_keeps_the_time_of_day_to_the_startick() {
    let seconds_per_startick = SECONDS_PER_STARDATE / STARTICKS_PER_STARDATE;
    let midnight = start_startick(20_773 * SECONDS_PER_STARDATE);
    assert_eq!(start_startick(20_773 * SECONDS_PER_STARDATE + seconds_per_startick - 1), midnight);
    assert_eq!(start_startick(20_773 * SECONDS_PER_STARDATE + seconds_per_startick), midnight + 1);
    assert_eq!(start_startick(20_773 * SECONDS_PER_STARDATE + SECONDS_PER_STARDATE / 2), midnight + 200);
}

#[test]
fn a_new_game_shows_its_start_time_as_the_stardate() {
    let game = new_game(SEED);
    assert_eq!(game.startick, start_startick(START_UNIX_SECONDS));
    assert_eq!(game.last_event_startick, game.startick);
    assert_eq!(game.state().stardate, "102.0773.00.0");
}

const BASE_AND_ENEMY: [&str; 10] = [
    "S...E.....", "..........", "..........", "..........", "..........",
    "..........", "..........", "..........", "..........", "..........",
];
const BASE_ADJACENT: [&str; 10] = [
    "SB........", "..........", "..........", "..........", "..........",
    "..........", "..........", "..........", "..........", "..........",
];

/// Every action, on a board where it is legal.
fn actions() -> Vec<([&'static str; 10], Command)> {
    vec![
        (EMPTY_WITH_SHIP_AT_00, warp(4, 6)),
        (EMPTY_WITH_SHIP_AT_00, subwarp(0, 4)),
        (BASE_ADJACENT, Command::Dock),
        (EMPTY_WITH_SHIP_AT_00, Command::LongRangeScan),
        (BASE_AND_ENEMY, blast(0, 4)),
        (BASE_AND_ENEMY, torpedo(0, 4)),
    ]
}

#[test]
fn every_action_reports_the_starticks_it_took_as_a_duration() {
    for (rows, command) in actions() {
        let game = board(rows);
        let applied = run(&game, command.clone());
        assert!(applied.result.ok, "{command:?}");
        let took = applied.game.startick - game.startick;
        assert!(took >= 1, "{command:?} must take at least a startick");
        assert_eq!(report(&applied)["time"], format_duration(took), "{command:?}");
    }
}

#[test]
fn the_clock_travels_as_whole_numbers() {
    let game = run(&new_game(SEED), Command::LongRangeScan).game;
    let json = serde_json::to_value(&game).unwrap();
    assert!(json["startick"].is_i64());
    assert!(json["last_event_startick"].is_i64());
}
