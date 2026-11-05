//! The world value (ONTOLOGY Game, Ship, Game creation) and the GameState view of it.

use serde::{Deserialize, Serialize};

use crate::constants::*;
use crate::galaxy::Galaxy;
use crate::geometry::Yx;
use crate::rng::Rng;
use crate::sector::ActiveSector;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Status {
    Playing,
    Won,
    Lost,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Ship {
    pub hull: i32,
    pub max_hull: i32,
    pub shields: i32,
    pub max_shields: i32,
    pub energy: i32,
    pub max_energy: i32,
    pub quantorpedoes: i32,
    pub max_quantorpedoes: i32,
}

impl Ship {
    pub fn full() -> Ship {
        Ship {
            hull: SHIP_MAX_HULL,
            max_hull: SHIP_MAX_HULL,
            shields: SHIP_MAX_SHIELDS,
            max_shields: SHIP_MAX_SHIELDS,
            energy: SHIP_MAX_ENERGY,
            max_energy: SHIP_MAX_ENERGY,
            quantorpedoes: SHIP_MAX_QUANTORPEDOES,
            max_quantorpedoes: SHIP_MAX_QUANTORPEDOES,
        }
    }

    pub fn resupply(&mut self) {
        self.hull = self.max_hull;
        self.shields = self.max_shields;
        self.energy = self.max_energy;
        self.quantorpedoes = self.max_quantorpedoes;
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Game {
    pub seed: u32,
    pub rng: Rng,
    pub status: Status,
    pub galaxy: Galaxy,
    pub ship: Ship,
    pub sector_yx: Yx,
    pub sector: ActiveSector,
    pub stardate: f64,
    pub last_event_stardate: f64,
}

impl Game {
    pub fn new(seed: u32) -> Game {
        let mut rng = Rng::seeded(seed);
        let galaxy = Galaxy::generate(&mut rng);
        let stardate = rng.int_in(STARDATE_START) as f64;
        let sector = instantiate(&galaxy, seed, GALAXY_CENTER);
        Game {
            seed,
            rng,
            status: Status::Playing,
            galaxy,
            ship: Ship::full(),
            sector_yx: GALAXY_CENTER,
            sector,
            stardate,
            last_event_stardate: stardate,
        }
    }

    /// Moves the ship into `target` and builds its board from the seed.
    pub fn enter_sector(&mut self, target: Yx) {
        self.galaxy.record_mut(target).visible = true;
        self.sector_yx = target;
        self.sector = instantiate(&self.galaxy, self.seed, target);
        self.last_event_stardate = self.stardate;
    }

    /// Destroy enemy: off the board, and the galaxy record follows.
    pub fn destroy_enemy(&mut self, yx: Yx) {
        self.sector.remove_enemy(yx);
        self.galaxy.record_mut(self.sector_yx).enemies = self.sector.enemies_yx.len() as u32;
    }

    pub fn state(&self) -> GameState {
        GameState {
            status: self.status,
            sector_yx: self.sector_yx,
            ship_yx: self.sector.ship_yx,
            ship_hull: self.ship.hull,
            ship_max_hull: self.ship.max_hull,
            ship_shields: self.ship.shields,
            ship_max_shields: self.ship.max_shields,
            ship_energy: self.ship.energy,
            ship_max_energy: self.ship.max_energy,
            ship_quantorpedoes: self.ship.quantorpedoes,
            ship_max_quantorpedoes: self.ship.max_quantorpedoes,
            starbase_yx: self.sector.starbase_yx,
            enemies_yx: self.sector.enemies_yx.clone(),
            star_count: self.sector.stars,
            base_count: self.sector.starbase_yx.is_some() as u32,
            enemy_count: self.sector.enemies_yx.len() as u32,
            map: self.sector.map_rows(),
            stardate: format_stardate(self.stardate),
        }
    }
}

fn instantiate(galaxy: &Galaxy, seed: u32, sector_yx: Yx) -> ActiveSector {
    ActiveSector::instantiate(galaxy.record(sector_yx), &mut Rng::for_sector(seed, sector_yx))
}

/// `int(stardate)`, zero-padded to 8 digits, first 8 kept, shown as `99-9999-99`.
pub fn format_stardate(stardate: f64) -> String {
    let digits = format!("{:08}", stardate as i64);
    format!("{}-{}-{}", &digits[0..2], &digits[2..6], &digits[6..8])
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct GameState {
    pub status: Status,
    pub sector_yx: Yx,
    pub ship_yx: Yx,
    pub ship_hull: i32,
    pub ship_max_hull: i32,
    pub ship_shields: i32,
    pub ship_max_shields: i32,
    pub ship_energy: i32,
    pub ship_max_energy: i32,
    pub ship_quantorpedoes: i32,
    pub ship_max_quantorpedoes: i32,
    pub starbase_yx: Option<Yx>,
    pub enemies_yx: Vec<Yx>,
    pub star_count: u32,
    pub base_count: u32,
    pub enemy_count: u32,
    pub map: Vec<String>,
    pub stardate: String,
}
