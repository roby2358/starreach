//! The galaxy: what is remembered about every sector (ONTOLOGY Galaxy, SectorRecord).

use serde::{Deserialize, Serialize};

use crate::constants::*;
use crate::geometry::{all_cells, euclid, in_bounds, Yx};
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
        for yx in all_cells() {
            sectors[yx.0 as usize].push(generate_record(yx, rng));
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
                Some(yx) => self.record_mut(yx).starbases = 1,
                None => return,
            }
        }
    }

    fn find_starbase_spot(&self, rng: &mut Rng, tries: u32) -> Option<Yx> {
        (0..tries)
            .map(|_| (rng.index(GALAXY_SIZE as usize) as i32, rng.index(GALAXY_SIZE as usize) as i32))
            .find(|&yx| self.is_spaced_from_starbases(yx))
    }

    fn is_spaced_from_starbases(&self, yx: Yx) -> bool {
        all_cells()
            .filter(|&other| self.record(other).starbases > 0)
            .all(|other| euclid(yx, other) >= STARBASE_MIN_SPACING)
    }

    /// Every sector with a starbase, visible or not.
    pub fn starbase_sectors(&self) -> Vec<Yx> {
        all_cells().filter(|&yx| self.record(yx).starbases > 0).collect()
    }

    pub fn record(&self, yx: Yx) -> &SectorRecord {
        &self.sectors[yx.0 as usize][yx.1 as usize]
    }

    pub fn record_mut(&mut self, yx: Yx) -> &mut SectorRecord {
        &mut self.sectors[yx.0 as usize][yx.1 as usize]
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

    /// Marks the 3×3 block around `center` visible and returns its 3 rows of summaries.
    pub fn scan(&mut self, center: Yx) -> Vec<String> {
        (-1..=1)
            .map(|dy| {
                (-1..=1)
                    .map(|dx| self.scan_one((center.0 + dy, center.1 + dx)))
                    .collect::<Vec<_>>()
                    .join(" ")
            })
            .collect()
    }

    fn scan_one(&mut self, yx: Yx) -> String {
        if !in_bounds(yx) {
            return ".....".to_string();
        }
        let record = self.record_mut(yx);
        record.visible = true;
        record.summary()
    }

    /// Visible sectors with a starbase.
    pub fn visible_starbases(&self) -> impl Iterator<Item = Yx> + '_ {
        all_cells().filter(|&yx| {
            let r = self.record(yx);
            r.visible && r.starbases > 0
        })
    }
}

fn generate_record(yx: Yx, rng: &mut Rng) -> SectorRecord {
    if yx == GALAXY_CENTER {
        return SectorRecord { visible: true, enemies: 0, starbases: 1, stars: START_SECTOR_STARS };
    }
    let factor = ENEMY_DISTANCE_FLOOR + euclid(yx, GALAXY_CENTER) / ENEMY_DISTANCE_NORM * ENEMY_DISTANCE_SCALE;
    let scaled = (factor * rng.int_in(ENEMY_BASE_ROLL) as f64) as i32;
    let enemies = scaled.clamp(0, ENEMY_MAX_PER_SECTOR as i32) as u32;
    let stars = rng.int_in(STARS_PER_SECTOR) as u32;
    SectorRecord { visible: false, enemies, starbases: 0, stars }
}
