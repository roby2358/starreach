//! R-20: the same seed and the same commands give the same final state.
use crate::helpers::*;
use starreach_core::{apply, new_game, Command, Game};

fn play(seed: u32) -> Game {
    let commands = [
        Command::LongRangeScan, warp(5, 5), subwarp(0, 0), blast(3, 3),
        torpedo(9, 9), warp(2, 7), subwarp(9, 9), Command::State,
    ];
    commands.iter().fold(new_game(seed), |game, c| apply(&game, c).game)
}

#[test]
fn same_seed_same_commands_same_game() {
    for seed in [0, 1, 99, u32::MAX] {
        assert_eq!(play(seed), play(seed));
        assert_eq!(play(seed).state(), play(seed).state());
    }
}
