//! The view: what a read-only display may see of a Game (ONTOLOGY GameView, D-31).
//!
//! A view takes the Game by shared reference, so making one can't change the game. It carries
//! only what the player has uncovered: a hidden sector is null, and the seed and the RNG stay
//! out. The board is the ship's own sector, which the player can always see.

use serde::Serialize;

use crate::galaxy::SectorRecord;
use crate::game::{format_stardate, Game, Ship, Status};
use crate::geometry::Yx;

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct SectorView {
    pub enemies: u32,
    pub starbases: u32,
    pub stars: u32,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct GameView {
    pub status: Status,
    pub stardate: String,
    pub sector_yx: Yx,
    pub ship: Ship,
    /// The ship's sector, a row per string, in the same form as `GameState.map`.
    pub board: Vec<String>,
    /// Indexed `[y][x]`. Null while the sector is hidden.
    pub galaxy: Vec<Vec<Option<SectorView>>>,
}

pub fn view(game: &Game) -> GameView {
    GameView {
        status: game.status,
        stardate: format_stardate(game.stardate),
        sector_yx: game.sector_yx,
        ship: game.ship.clone(),
        board: game.sector.map_rows(),
        galaxy: game.galaxy.sectors.iter().map(|row| row.iter().map(sector_view).collect()).collect(),
    }
}

fn sector_view(record: &SectorRecord) -> Option<SectorView> {
    record.visible.then_some(SectorView { enemies: record.enemies, starbases: record.starbases, stars: record.stars })
}
