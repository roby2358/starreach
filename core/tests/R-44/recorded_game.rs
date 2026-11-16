//! R-44: a recorded game. Seed `SEED` played through `commands()` gives, result by result and
//! in its final Game, what `fixtures/recorded_game.json` holds, with every pair x first. The
//! commands name their `x` and `y`. A core that mirrors the board anywhere, or reads or writes
//! a pair in the other order, gives a different game.
use crate::helpers::*;
use serde_json::{json, Value};
use starreach_core::{apply, Command};

fn commands() -> Vec<Command> {
    vec![
        Command::LongRangeScan,
        Command::Subwarp { x: 7, y: 9 },
        Command::Dock,
        Command::GalaxyWarp { x: 5, y: 3 },
        Command::Torpedo { x: 3, y: 0 },
        Command::Blast { x: 5, y: 6 },
        Command::Subwarp { x: 7, y: 4 },
        Command::Blast { x: 5, y: 6 },
        Command::Blast { x: 5, y: 6 },
        Command::Subwarp { x: 10, y: 2 },
        Command::Torpedo { x: 9, y: 9 },
        Command::LongRangeScan,
        Command::GalaxyMap,
        Command::GalaxyWarp { x: 4, y: 4 },
        Command::State,
    ]
}

/// The game as JSON: each command with its Result, then the final Game.
fn played() -> Value {
    let mut game = new_game(SEED);
    let mut steps = Vec::new();
    for command in commands() {
        let applied = apply(&game, &command);
        steps.push(json!({ "command": command, "result": applied.result }));
        game = applied.game;
    }
    json!({ "steps": steps, "game": game })
}

#[test]
fn the_recorded_game_plays_out_the_same() {
    let recorded: Value = serde_json::from_str(include_str!("../fixtures/recorded_game.json")).unwrap();
    let played = played();
    for (index, (now, then)) in played["steps"].as_array().unwrap().iter().zip(recorded["steps"].as_array().unwrap()).enumerate() {
        assert_eq!(now, then, "step {index}");
    }
    assert_eq!(played, recorded);
}
