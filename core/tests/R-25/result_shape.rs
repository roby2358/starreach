//! R-25: one result shape for every command, refusals change nothing, and coordinates
//! outside 0..9 are refused.
use crate::helpers::*;
use starreach_core::{apply_json, new_game_json, Command};

fn keys(value: &serde_json::Value) -> Vec<String> {
    let mut keys: Vec<String> = value.as_object().unwrap().keys().cloned().collect();
    keys.sort();
    keys
}

#[test]
fn accepted_and_refused_results_have_the_same_fields() {
    let game = board(EMPTY_WITH_SHIP_AT_00);
    let expected = vec!["error", "events", "ok", "report", "state"];
    for command in [Command::State, Command::GalaxyMap, subwarp(0, 3), Command::Dock, blast(5, 5)] {
        let result = serde_json::to_value(run(&game, command).result).unwrap();
        assert_eq!(keys(&result), expected);
        let ok = result["ok"].as_bool().unwrap();
        assert_eq!(result["error"].is_null(), ok, "error is null iff ok");
        if !ok {
            assert!(result["report"].is_null(), "report is null when refused");
        }
    }
}

#[test]
fn coordinates_outside_the_board_are_refused() {
    let game = board(EMPTY_WITH_SHIP_AT_00);
    for (y, x) in [(-1, 0), (0, 10), (10, 10)] {
        for command in [warp(y, x), subwarp(y, x), blast(y, x), torpedo(y, x)] {
            assert_refused(&game, command);
        }
    }
}

#[test]
fn a_command_that_does_not_parse_is_refused_through_json() {
    let game = new_game_json(5);
    for command in [r#"{"type":"self_destruct"}"#, r#"{"type":"subwarp","y":1}"#, "not json"] {
        let applied: serde_json::Value = serde_json::from_str(&apply_json(&game, command).unwrap()).unwrap();
        assert_eq!(applied["result"]["ok"], false);
        assert_eq!(applied["game"], serde_json::from_str::<serde_json::Value>(&game).unwrap());
    }
}

#[test]
fn a_game_survives_the_json_round_trip() {
    let game = new_game_json(u32::MAX);
    let applied: serde_json::Value =
        serde_json::from_str(&apply_json(&game, r#"{"type":"long_range_scan"}"#).unwrap()).unwrap();
    assert_eq!(applied["result"]["ok"], true);
    assert!(applied["game"]["rng"].is_string(), "the 64-bit RNG state travels as a string");
}
