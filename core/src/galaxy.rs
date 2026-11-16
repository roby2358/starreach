//! The galaxy: what is remembered about every sector (ONTOLOGY Galaxy, SectorRecord).

use serde::{Deserialize, Serialize};

use crate::constants::*;
use crate::geometry::{all_cells, euclid, in_bounds, Xy};
use crate::rng::Rng;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct SectorRecord {
    pub visible: bool,
    pub enemies: u32,
    pub starbases: u32,
    pub stars: u32,
}

impl SectorRecord {
    /// `"E|B|S"` when visible, `"....."` when hidden.
    pub fn summary(&self) -> String {
        match self.visible {
            true => format!("{}|{}|{}", self.enemies, self.starbases, self.stars),
            false => ".....".to_string(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Galaxy {
    /// Indexed `[y][x]`.
    pub sectors: Vec<Vec<SectorRecord>>,
}

impl Galaxy {
    /// Galaxy generation, in row order, drawing from the game stream.
    pub fn generate(rng: &mut Rng) -> Galaxy {
        let mut sectors = vec![Vec::new(); GALAXY_SIZE as usize];
        for xy in all_cells() {
            sectors[xy.y as usize].push(generate_record(xy, rng));
        }
        let mut galaxy = Galaxy { sectors };
        galaxy.place_extra_starbases(rng, STARBASE_PLACE_TRIES);
        galaxy
    }

    /// Places a target count of extra starbases, each at least `STARBASE_MIN_SPACING` from every
    /// starbase already placed. Stops at the first placement that finds no fit within `tries`.
    pub fn place_extra_starbases(&mut self, rng: &mut Rng, tries: u32) {
        let target = rng.int_in((STARBASE_EXTRA_MIN, STARBASE_EXTRA_MAX));
        for _ in 0..target {
            match self.find_starbase_spot(rng, tries) {
                Some(xy) => self.record_mut(xy).starbases = 1,
                None => return,
            }
        }
    }

    fn find_starbase_spot(&self, rng: &mut Rng, tries: u32) -> Option<Xy> {
        (0..tries).map(|_| random_sector(rng)).find(|&xy| self.is_spaced_from_starbases(xy))
    }

    fn is_spaced_from_starbases(&self, xy: Xy) -> bool {
        all_cells()
            .filter(|&other| self.record(other).starbases > 0)
            .all(|other| euclid(xy, other) >= STARBASE_MIN_SPACING)
    }

    /// Every sector with a starbase, visible or not.
    pub fn starbase_sectors(&self) -> Vec<Xy> {
        all_cells().filter(|&xy| self.record(xy).starbases > 0).collect()
    }

    pub fn record(&self, xy: Xy) -> &SectorRecord {
        &self.sectors[xy.y as usize][xy.x as usize]
    }

    pub fn record_mut(&mut self, xy: Xy) -> &mut SectorRecord {
        &mut self.sectors[xy.y as usize][xy.x as usize]
    }

    pub fn total_enemies(&self) -> u32 {
        self.sectors.iter().flatten().map(|r| r.enemies).sum()
    }

    /// 10 rows of 10 space-separated summaries.
    pub fn map_rows(&self) -> Vec<String> {
        self.sectors
            .iter()
            .map(|row| row.iter().map(SectorRecord::summary).collect::<Vec<_>>().join(" "))
            .collect()
    }

    /// The 3×3 block around `center` as 3 rows of summaries.
    pub fn scan(&self, center: Xy) -> Vec<String> {
        (-1..=1)
            .map(|dy| {
                (-1..=1)
                    .map(|dx| self.scan_one(center.offset(dx, dy)))
                    .collect::<Vec<_>>()
                    .join(" ")
            })
            .collect()
    }

    fn scan_one(&self, xy: Xy) -> String {
        match in_bounds(xy) {
            true => self.record(xy).summary(),
            false => ".....".to_string(),
        }
    }

    /// Visible sectors with a starbase.
    pub fn visible_starbases(&self) -> impl Iterator<Item = Xy> + '_ {
        all_cells().filter(|&xy| {
            let r = self.record(xy);
            r.visible && r.starbases > 0
        })
    }
}

/// The sectors of the 3×3 block around `center` that are in the galaxy.
pub fn scan_block(center: Xy) -> impl Iterator<Item = Xy> {
    all_cells().filter(move |&xy| (xy.x - center.x).abs() <= 1 && (xy.y - center.y).abs() <= 1)
}

/// A sector drawn from the stream: the row first, then the column.
fn random_sector(rng: &mut Rng) -> Xy {
    let y = rng.index(GALAXY_SIZE as usize) as i32;
    let x = rng.index(GALAXY_SIZE as usize) as i32;
    Xy { x, y }
}

fn generate_record(xy: Xy, rng: &mut Rng) -> SectorRecord {
    if xy == GALAXY_CENTER {
        return SectorRecord { visible: true, enemies: 0, starbases: 1, stars: START_SECTOR_STARS };
    }
    let factor = ENEMY_DISTANCE_FLOOR + euclid(xy, GALAXY_CENTER) / ENEMY_DISTANCE_NORM * ENEMY_DISTANCE_SCALE;
    let scaled = (factor * rng.int_in(ENEMY_BASE_ROLL) as f64) as i32;
    let enemies = scaled.clamp(0, ENEMY_MAX_PER_SECTOR as i32) as u32;
    let stars = rng.int_in(STARS_PER_SECTOR) as u32;
    SectorRecord { visible: false, enemies, starbases: 0, stars }
}
