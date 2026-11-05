//! The live board of the sector the ship is in (ONTOLOGY ActiveSector, Ray, Sector instantiation).

use serde::{Deserialize, Serialize};

use crate::constants::SECTOR_SIZE;
use crate::galaxy::SectorRecord;
use crate::geometry::{all_cells, bresenham, in_bounds, Yx};
use crate::rng::Rng;

pub const EMPTY: char = '.';
pub const SHIP: char = 'S';
pub const STARBASE: char = 'B';
pub const ENEMY: char = 'E';
pub const STAR: char = '*';

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ActiveSector {
    pub map: Vec<Vec<char>>,
    pub ship_yx: Yx,
    pub starbase_yx: Option<Yx>,
    pub enemies_yx: Vec<Yx>,
    pub stars: u32,
}

impl ActiveSector {
    /// Builds the board from the record and the sector's own stream: starbase, then stars,
    /// then live enemies, then the ship, each on a random empty cell.
    pub fn instantiate(record: &SectorRecord, rng: &mut Rng) -> ActiveSector {
        let mut sector = ActiveSector {
            map: vec![vec![EMPTY; SECTOR_SIZE as usize]; SECTOR_SIZE as usize],
            ship_yx: (0, 0),
            starbase_yx: None,
            enemies_yx: Vec::new(),
            stars: record.stars,
        };
        if record.starbases > 0 {
            sector.starbase_yx = Some(sector.place(STARBASE, rng));
        }
        for _ in 0..record.stars {
            sector.place(STAR, rng);
        }
        for _ in 0..record.enemies {
            let yx = sector.place(ENEMY, rng);
            sector.enemies_yx.push(yx);
        }
        sector.ship_yx = sector.place(SHIP, rng);
        sector
    }

    /// Puts `occupant` on a random empty cell. The board holds at most 19 occupants, so an
    /// empty cell always exists.
    fn place(&mut self, occupant: char, rng: &mut Rng) -> Yx {
        let empty: Vec<Yx> = all_cells().filter(|&yx| self.is_empty(yx)).collect();
        let yx = empty[rng.index(empty.len())];
        self.set(yx, occupant);
        yx
    }

    /// The occupant of a cell, or None off the board.
    pub fn at(&self, yx: Yx) -> Option<char> {
        in_bounds(yx).then(|| self.map[yx.0 as usize][yx.1 as usize])
    }

    pub fn is_empty(&self, yx: Yx) -> bool {
        self.at(yx) == Some(EMPTY)
    }

    pub fn set(&mut self, yx: Yx, occupant: char) {
        self.map[yx.0 as usize][yx.1 as usize] = occupant;
    }

    pub fn has_enemies(&self) -> bool {
        !self.enemies_yx.is_empty()
    }

    /// The cells from `start` toward `dest`: `start` first, then each cell stepped into,
    /// stopping after the first obstacle (off the board or not empty) or at `dest`.
    pub fn ray(&self, start: Yx, dest: Yx) -> Vec<Yx> {
        let mut cells = vec![start];
        if start == dest {
            return cells;
        }
        for cell in bresenham(start, dest) {
            cells.push(cell);
            if !self.is_empty(cell) || cell == dest {
                break;
            }
        }
        cells
    }

    /// The enemy a shot from `start` toward `dest` hits: the ray's end, if it is an enemy.
    pub fn first_enemy(&self, start: Yx, dest: Yx) -> Option<(Yx, Vec<Yx>)> {
        let ray = self.ray(start, dest);
        let end = *ray.last().expect("a ray holds at least its start");
        (end != start && self.at(end) == Some(ENEMY)).then_some((end, ray))
    }

    pub fn move_occupant(&mut self, from: Yx, to: Yx) {
        let occupant = self.map[from.0 as usize][from.1 as usize];
        self.set(from, EMPTY);
        self.set(to, occupant);
    }

    pub fn remove_enemy(&mut self, yx: Yx) {
        self.enemies_yx.retain(|&e| e != yx);
        self.set(yx, EMPTY);
    }

    pub fn map_rows(&self) -> Vec<String> {
        self.map.iter().map(|row| row.iter().collect()).collect()
    }
}
