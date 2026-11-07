//! Starreach core: the game rules as a pure function (ONTOLOGY "Core API", D-21).
//!
//! `new_game(seed)` builds a Game. `apply(game, command)` returns the next Game and a
//! Result. `view(game)` returns what a read-only display may see. The core keeps nothing
//! between calls. The `*_json` functions are the same calls over JSON text, for the WASM
//! boundary.

pub mod actions;
pub mod constants;
pub mod events;
pub mod galaxy;
pub mod game;
pub mod geometry;
pub mod rng;
pub mod sector;
pub mod view;
#[cfg(target_arch = "wasm32")]
mod wasm;

use serde::{Deserialize, Serialize};

use actions::{Refusal, Report};
pub use game::{Game, GameState, Status};
use geometry::{in_bounds, Yx};
pub use view::{view, GameView};

/// A request to the core: `{type, …args}`.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Command {
    State,
    GalaxyMap,
    GalaxyWarp { y: i32, x: i32 },
    Subwarp { y: i32, x: i32 },
    Dock,
    LongRangeScan,
    Blast { y: i32, x: i32 },
    Torpedo { y: i32, x: i32 },
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

pub fn new_game(seed: u32) -> Game {
    Game::new(seed)
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
        Command::GalaxyWarp { y, x } => action(game, events, |g, e| actions::warp(g, coordinate(y, x)?, e)),
        Command::Subwarp { y, x } => action(game, events, |g, e| actions::subwarp(g, coordinate(y, x)?, e)),
        Command::Dock => action(game, events, actions::dock),
        Command::LongRangeScan => action(game, events, actions::long_range_scan),
        Command::Blast { y, x } => action(game, events, |g, e| actions::blast(g, coordinate(y, x)?, e)),
        Command::Torpedo { y, x } => action(game, events, |g, e| actions::torpedo(g, coordinate(y, x)?, e)),
    }
}

/// The checks every action shares: the game is still on, then the rule, then the game end.
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
    Ok(Some(report))
}

fn coordinate(y: i32, x: i32) -> Result<Yx, Refusal> {
    match in_bounds((y, x)) {
        true => Ok((y, x)),
        false => Err(format!("Coordinates ({y}, {x}) are outside 0..9")),
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

/// `new_game` over JSON: returns the Game as JSON text.
pub fn new_game_json(seed: u32) -> String {
    serde_json::to_string(&new_game(seed)).expect("a Game always serializes")
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
