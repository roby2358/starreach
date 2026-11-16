//! The world value (ONTOLOGY Game, Ship, Game creation) and the GameState view of it.

use serde::{Deserialize, Serialize};

use crate::constants::*;
use crate::counters::Counters;
use crate::galaxy::Galaxy;
use crate::geometry::{euclid, Yx};
use crate::goals::{self, Goal, GoalState};
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
    /// The game clock, in whole starticks (D-12).
    pub startick: i64,
    /// The clock when stardate events last ran, or when the ship entered the sector.
    pub last_event_startick: i64,
    /// What has happened in this game so far (D-42).
    pub counters: Counters,
    /// This game's objectives, chosen from the seed at creation (D-47).
    pub goals: Vec<Goal>,
}

impl Game {
    /// A game from its seed, with the clock started at the real time `start_unix_seconds`.
    pub fn new(seed: u32, start_unix_seconds: i64) -> Game {
        let mut rng = Rng::seeded(seed);
        let galaxy = Galaxy::generate(&mut rng);
        let startick = start_startick(start_unix_seconds);
        let sector = instantiate(&galaxy, seed, GALAXY_CENTER);
        Game {
            seed,
            rng,
            status: Status::Playing,
            galaxy,
            ship: Ship::full(),
            sector_yx: GALAXY_CENTER,
            sector,
            startick,
            last_event_startick: startick,
            counters: Counters::default(),
            goals: goals::choose(seed),
        }
    }

    /// Makes a sector's counts visible (Visibility). The one place a hidden sector is uncovered,
    /// so the one place a starbase is discovered.
    pub fn reveal(&mut self, yx: Yx) {
        let record = self.galaxy.record_mut(yx);
        if record.visible {
            return;
        }
        record.visible = true;
        self.counters.starbases_discovered += record.starbases;
    }

    /// Moves the ship into `target` and builds its board from the seed.
    pub fn enter_sector(&mut self, target: Yx) {
        self.reveal(target);
        self.sector_yx = target;
        self.sector = instantiate(&self.galaxy, self.seed, target);
        self.last_event_startick = self.startick;
    }

    /// Destroy enemy: off the board, and the galaxy record follows.
    pub fn destroy_enemy(&mut self, yx: Yx) {
        self.sector.remove_enemy(yx);
        self.galaxy.record_mut(self.sector_yx).enemies = self.sector.enemies_yx.len() as u32;
        self.counters.enemies_destroyed += 1;
        if !self.sector.has_enemies() {
            self.counters.sectors_cleared += 1;
        }
    }

    /// Each enemy as the ship sees it (ONTOLOGY EnemySight), in `enemies_yx` order.
    fn enemy_sights(&self) -> Vec<EnemySight> {
        let ship = self.sector.ship_yx;
        self.sector
            .enemies_yx
            .iter()
            .map(|&yx| EnemySight {
                yx,
                range: (euclid(ship, yx) * 100.0).round() / 100.0,
                bearing: bearing(ship, yx),
                clear_shot: self.sector.first_enemy(ship, yx).map(|(hit, _)| hit) == Some(yx),
            })
            .collect()
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
            enemies: self.enemy_sights(),
            star_count: self.sector.stars,
            base_count: self.sector.starbase_yx.is_some() as u32,
            enemy_count: self.sector.enemies_yx.len() as u32,
            map: self.sector.map_rows(),
            stardate: format_stardate(self.startick),
            counters: self.counters,
            goals: self.goals.iter().map(|goal| goal.state(&self.counters)).collect(),
        }
    }
}

fn instantiate(galaxy: &Galaxy, seed: u32, sector_yx: Yx) -> ActiveSector {
    ActiveSector::instantiate(galaxy.record(sector_yx), &mut Rng::for_sector(seed, sector_yx))
}

/// The clock a game starts at: the Unix time counted in starticks, moved on by
/// `STARDATE_EPOCH_OFFSET` stardates (D-12).
pub fn start_startick(unix_seconds: i64) -> i64 {
    (unix_seconds * STARTICKS_PER_STARDATE).div_euclid(SECONDS_PER_STARDATE)
        + STARDATE_EPOCH_OFFSET * STARTICKS_PER_STARDATE
}

/// A startick count as stardates to three decimals, truncated: the whole stardates, the first
/// two decimals and the third. The one place a clock value or a duration becomes digits.
fn stardate_parts(starticks: i64) -> (i64, i64, i64) {
    let whole = starticks / STARTICKS_PER_STARDATE;
    let thousandths = starticks % STARTICKS_PER_STARDATE * 1000 / STARTICKS_PER_STARDATE;
    (whole, thousandths / 10, thousandths % 10)
}

/// The clock as a stardate, `ddd.dddd.dd.d`: the whole stardates zero-padded to seven digits
/// with the last four set apart, then the decimals (D-12).
pub fn format_stardate(startick: i64) -> String {
    let (whole, hundredths, third) = stardate_parts(startick);
    format!("{:03}.{:04}.{hundredths:02}.{third}", whole / 10_000, whole % 10_000)
}

/// A length of time in stardates, `d.dd.d`: as a stardate, with the whole part unpadded (D-12).
pub fn format_duration(starticks: i64) -> String {
    let (whole, hundredths, third) = stardate_parts(starticks);
    format!("{whole}.{hundredths:02}.{third}")
}

/// Whole degrees clockwise from up (toward row 0), in `0..360`.
fn bearing(from: Yx, to: Yx) -> i32 {
    let up = (from.0 - to.0) as f64;
    let right = (to.1 - from.1) as f64;
    (right.atan2(up).to_degrees().rem_euclid(360.0).round() as i32) % 360
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct EnemySight {
    pub yx: Yx,
    pub range: f64,
    pub bearing: i32,
    pub clear_shot: bool,
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
    pub enemies: Vec<EnemySight>,
    pub star_count: u32,
    pub base_count: u32,
    pub enemy_count: u32,
    pub map: Vec<String>,
    pub stardate: String,
    pub counters: Counters,
    /// The game's goals with their progress, in the Game's order.
    pub goals: Vec<GoalState>,
}
