//! The live board of the sector the ship is in (ONTOLOGY ActiveSector, Ray, Sector instantiation).

use serde::{Deserialize, Serialize};

use crate::constants::SECTOR_SIZE;
use crate::galaxy::SectorRecord;
use crate::geometry::{all_cells, bresenham, in_bounds, xy, Xy};
use crate::rng::Rng;

pub const EMPTY: char = '.';
pub const SHIP: char = 'S';
pub const STARBASE: char = 'B';
pub const ENEMY: char = 'E';
pub const STAR: char = '*';

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ActiveSector {
    pub map: Vec<Vec<char>>,
    pub ship_xy: Xy,
    pub starbase_xy: Option<Xy>,
    pub enemies_xy: Vec<Xy>,
    pub stars: u32,
}

impl ActiveSector {
    /// Builds the board from the record and the sector's own stream: starbase, then stars,
    /// then live enemies, then the ship, each on a random empty cell.
    pub fn instantiate(record: &SectorRecord, rng: &mut Rng) -> ActiveSector {
        let mut sector = ActiveSector {
            map: vec![vec![EMPTY; SECTOR_SIZE as usize]; SECTOR_SIZE as usize],
            ship_xy: xy(0, 0),
            starbase_xy: None,
            enemies_xy: Vec::new(),
            stars: record.stars,
        };
        if record.starbases > 0 {
            sector.starbase_xy = Some(sector.place(STARBASE, rng));
        }
        for _ in 0..record.stars {
            sector.place(STAR, rng);
        }
        for _ in 0..record.enemies {
            let xy = sector.place(ENEMY, rng);
            sector.enemies_xy.push(xy);
        }
        sector.ship_xy = sector.place(SHIP, rng);
        sector
    }

    /// Puts `occupant` on a random empty cell. The board holds at most 19 occupants, so an
    /// empty cell always exists.
    fn place(&mut self, occupant: char, rng: &mut Rng) -> Xy {
        let empty: Vec<Xy> = all_cells().filter(|&xy| self.is_empty(xy)).collect();
        let xy = empty[rng.index(empty.len())];
        self.set(xy, occupant);
        xy
    }

    /// The occupant of a cell, or None off the board.
    pub fn at(&self, xy: Xy) -> Option<char> {
        in_bounds(xy).then(|| self.map[xy.y as usize][xy.x as usize])
    }

    pub fn is_empty(&self, xy: Xy) -> bool {
        self.at(xy) == Some(EMPTY)
    }

    pub fn set(&mut self, xy: Xy, occupant: char) {
        self.map[xy.y as usize][xy.x as usize] = occupant;
    }

    pub fn has_enemies(&self) -> bool {
        !self.enemies_xy.is_empty()
    }

    /// The cells from `start` toward `dest`: `start` first, then each cell stepped into,
    /// stopping after the first obstacle (off the board or not empty) or at `dest`.
    pub fn ray(&self, start: Xy, dest: Xy) -> Vec<Xy> {
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
    pub fn first_enemy(&self, start: Xy, dest: Xy) -> Option<(Xy, Vec<Xy>)> {
        let ray = self.ray(start, dest);
        let end = *ray.last().expect("a ray holds at least its start");
        (end != start && self.at(end) == Some(ENEMY)).then_some((end, ray))
    }

    pub fn move_occupant(&mut self, from: Xy, to: Xy) {
        let occupant = self.map[from.y as usize][from.x as usize];
        self.set(from, EMPTY);
        self.set(to, occupant);
    }

    pub fn remove_enemy(&mut self, xy: Xy) {
        self.enemies_xy.retain(|&e| e != xy);
        self.set(xy, EMPTY);
    }

    pub fn map_rows(&self) -> Vec<String> {
        self.map.iter().map(|row| row.iter().collect()).collect()
    }
}
