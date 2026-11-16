//! Starreach core: the game rules as a pure function (ONTOLOGY "Core API", D-21).
//!
//! `new_game(seed, start_unix_seconds)` builds a Game: the caller reads the clock, the core
//! never does, and the game's goals come from the seed. `apply(game, command)` returns the next
//! Game and a Result. `view(game)` returns what a read-only display may see. `counter_table()`
//! lists the counters a game keeps; `rungs_crossed`, `ladder_standing` and `commendation` are
//! the ladder of a counter's lifetime total and Star Central's message for a rung. The core
//! keeps nothing between calls. The `*_json` functions are the same calls over JSON text, for
//! the WASM boundary.

pub mod actions;
pub mod constants;
pub mod counters;
pub mod events;
pub mod galaxy;
pub mod game;
pub mod geometry;
pub mod goals;
pub mod ladder;
pub mod messages;
pub mod rng;
pub mod sector;
pub mod view;
#[cfg(target_arch = "wasm32")]
mod wasm;

use serde::{Deserialize, Serialize};

use actions::{Refusal, Report};
use counters::counter_row;
pub use counters::{CounterRow, Counters, COUNTER_TABLE};
pub use game::{Game, GameState, Status};
use geometry::{format_xy, in_bounds, Xy};
pub use ladder::Standing;
pub use view::{view, GameView};

/// A request to the core: `{type, …args}`.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Command {
    State,
    GalaxyMap,
    GalaxyWarp { x: i32, y: i32 },
    Subwarp { x: i32, y: i32 },
    Dock,
    LongRangeScan,
    Blast { x: i32, y: i32 },
    Torpedo { x: i32, y: i32 },
}

/// The one result shape (D-29). Every field is always present.
#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct Outcome {
    pub ok: bool,
    pub error: Option<String>,
    pub events: Vec<String>,
    pub report: Option<Report>,
    pub state: GameState,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct Applied {
    pub game: Game,
    pub result: Outcome,
}

pub fn new_game(seed: u32, start_unix_seconds: i64) -> Game {
    Game::new(seed, start_unix_seconds)
}

/// The counter table: every counter's key, label, whether it may be a goal (D-42), its ladder's
/// scale and its goal ceiling (D-43).
pub fn counter_table() -> &'static [CounterRow] {
    &COUNTER_TABLE
}

/// The rungs of the counter's ladder that a lifetime total reached in going from `before` to
/// `after`, in rising order (D-44). None for a key that names no counter.
pub fn rungs_crossed(key: &str, before: u64, after: u64) -> Option<Vec<u64>> {
    Some(ladder::rungs_crossed(counter_row(key)?.scale, before, after))
}

/// The last rung of the counter's ladder that `total` reached and the next one. None for a key
/// that names no counter.
pub fn ladder_standing(key: &str, total: u64) -> Option<Standing> {
    Some(ladder::standing(counter_row(key)?.scale, total))
}

/// Star Central's message for the counter's lifetime total reaching the rung `amount`: one of
/// the wordings of the counter's kind, picked by `roll`, a number in [0, 1) the caller supplies
/// (D-46). None for a key that names no counter.
pub fn commendation(key: &str, amount: u64, roll: f64) -> Option<String> {
    Some(messages::lifetime_message(counter_row(key)?, amount, roll))
}

/// Runs one command. A refused command returns the game unchanged.
pub fn apply(game: &Game, command: &Command) -> Applied {
    let mut next = game.clone();
    let mut events = Vec::new();
    match run(&mut next, command, &mut events) {
        Ok(report) => accepted(next, events, report),
        Err(error) => refused(game, error),
    }
}

fn run(game: &mut Game, command: &Command, events: &mut Vec<String>) -> Result<Option<Report>, Refusal> {
    match *command {
        Command::State => Ok(None),
        Command::GalaxyMap => Ok(Some(Report::GalaxyMap { map: game.galaxy.map_rows() })),
        Command::GalaxyWarp { x, y } => action(game, events, |g, e| actions::warp(g, coordinate(x, y)?, e)),
        Command::Subwarp { x, y } => action(game, events, |g, e| actions::subwarp(g, coordinate(x, y)?, e)),
        Command::Dock => action(game, events, actions::dock),
        Command::LongRangeScan => action(game, events, actions::long_range_scan),
        Command::Blast { x, y } => action(game, events, |g, e| actions::blast(g, coordinate(x, y)?, e)),
        Command::Torpedo { x, y } => action(game, events, |g, e| actions::torpedo(g, coordinate(x, y)?, e)),
    }
}

/// The checks every action shares: the game is still on, then the rule, then the game end and
/// the goal check.
fn action(
    game: &mut Game,
    events: &mut Vec<String>,
    rule: impl FnOnce(&mut Game, &mut Vec<String>) -> Result<Report, Refusal>,
) -> Result<Option<Report>, Refusal> {
    if game.status != Status::Playing {
        return Err("The game is over".to_string());
    }
    let report = rule(game, events)?;
    actions::game_end(game, events);
    goals::check(game, events);
    Ok(Some(report))
}

/// A command's `x` and `y` as a coordinate on the grid.
fn coordinate(x: i32, y: i32) -> Result<Xy, Refusal> {
    let at = Xy { x, y };
    match in_bounds(at) {
        true => Ok(at),
        false => Err(format!("Coordinates {} are outside 0..9", format_xy(at))),
    }
}

fn accepted(game: Game, events: Vec<String>, report: Option<Report>) -> Applied {
    let state = game.state();
    Applied { game, result: Outcome { ok: true, error: None, events, report, state } }
}

fn refused(game: &Game, error: Refusal) -> Applied {
    let result = Outcome { ok: false, error: Some(error), events: Vec::new(), report: None, state: game.state() };
    Applied { game: game.clone(), result }
}

/// `counter_table` over JSON: the rows as a JSON array, in table order.
pub fn counter_table_json() -> String {
    serde_json::to_string(counter_table()).expect("the counter table always serializes")
}

/// `rungs_crossed` over JSON: the rungs as a JSON array of numbers.
pub fn rungs_crossed_json(key: &str, before: u64, after: u64) -> Option<String> {
    let rungs = rungs_crossed(key, before, after)?;
    Some(serde_json::to_string(&rungs).expect("rungs always serialize"))
}

/// `ladder_standing` over JSON: `{reached, next}`, `reached` null below the first rung.
pub fn ladder_standing_json(key: &str, total: u64) -> Option<String> {
    let standing = ladder_standing(key, total)?;
    Some(serde_json::to_string(&standing).expect("a standing always serializes"))
}

/// `new_game` over JSON: returns the Game as JSON text.
pub fn new_game_json(seed: u32, start_unix_seconds: i64) -> String {
    serde_json::to_string(&new_game(seed, start_unix_seconds)).expect("a Game always serializes")
}

/// `apply` over JSON: returns `{game, result}` as JSON text. A command that doesn't parse
/// is refused like any other; a game that doesn't parse is an error, since there is no
/// state to report.
pub fn apply_json(game: &str, command: &str) -> Result<String, String> {
    let game: Game = serde_json::from_str(game).map_err(|e| format!("Bad game: {e}"))?;
    let applied = match serde_json::from_str::<Command>(command) {
        Ok(command) => apply(&game, &command),
        Err(e) => refused(&game, format!("Bad command: {e}")),
    };
    Ok(serde_json::to_string(&applied).expect("a result always serializes"))
}

/// `view` over JSON: returns the GameView as JSON text. A game that doesn't parse is an error.
pub fn view_json(game: &str) -> Result<String, String> {
    let game: Game = serde_json::from_str(game).map_err(|e| format!("Bad game: {e}"))?;
    Ok(serde_json::to_string(&view(&game)).expect("a view always serializes"))
}
