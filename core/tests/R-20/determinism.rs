//! R-20: the same seed and the same commands give the same final state.
use crate::helpers::*;
use starreach_core::{apply, Command, Game};

fn play(seed: u32) -> Game {
    let commands = [
        Command::LongRangeScan, warp(5, 5), subwarp(0, 0), blast(3, 3),
        torpedo(9, 9), warp(7, 2), subwarp(9, 9), Command::State,
    ];
    commands.iter().fold(new_game(seed), |game, c| apply(&game, c).game)
}

#[test]
fn the_start_time_sets_the_clock_and_nothing_else() {
    let early = starreach_core::new_game(SEED, START_UNIX_SECONDS);
    let mut late = starreach_core::new_game(SEED, START_UNIX_SECONDS + 86_400);
    assert_eq!(late.startick, early.startick + starreach_core::constants::STARTICKS_PER_STARDATE);
    late.startick = early.startick;
    late.last_event_startick = early.last_event_startick;
    assert_eq!(late, early);
}

#[test]
fn same_seed_same_commands_same_game() {
    for seed in [0, 1, 99, u32::MAX] {
        assert_eq!(play(seed), play(seed));
        assert_eq!(play(seed).state(), play(seed).state());
    }
}
