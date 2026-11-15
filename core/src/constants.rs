//! Every tunable number (ONTOLOGY Numbers, D-28). The rest of the core refers to these by name.

use crate::geometry::Yx;

pub const GALAXY_SIZE: i32 = 10;
pub const SECTOR_SIZE: i32 = 10;
pub const GALAXY_CENTER: Yx = (4, 4);
pub const START_SECTOR_STARS: u32 = 4;

pub const ENEMY_BASE_ROLL: (i32, i32) = (-3, 9);
pub const ENEMY_DISTANCE_FLOOR: f64 = 0.3;
pub const ENEMY_DISTANCE_SCALE: f64 = 0.7;
/// √50, the distance from the center to a far corner
pub const ENEMY_DISTANCE_NORM: f64 = 7.0710678118654755;
pub const ENEMY_MAX_PER_SECTOR: u32 = 9;
pub const STARS_PER_SECTOR: (i32, i32) = (2, 8);
/// Extra starbases beyond the home base: the target count is uniform in this inclusive range
pub const STARBASE_EXTRA_MIN: i32 = 3;
pub const STARBASE_EXTRA_MAX: i32 = 5;
/// Minimum Euclidean distance between any two starbases, in sectors
pub const STARBASE_MIN_SPACING: f64 = 3.0;
/// Random sectors drawn per starbase before placement gives up
pub const STARBASE_PLACE_TRIES: u32 = 100;

pub const WARP_DISTANCE_SCALE: f64 = 10.0;
pub const WARP_ENERGY_PER_DISTANCE: i32 = 10;
pub const WARP_TIME_PER_DISTANCE: f64 = 0.01;

pub const SUBWARP_MAX_STEPS: usize = 10;
pub const SUBWARP_MAX_STEPS_HOSTILE: usize = 3;
pub const SUBWARP_ENERGY_PER_STEP: i32 = 2;
pub const SUBWARP_TIME_PER_STEP: f64 = 1.0;

pub const DOCK_TIME: f64 = 5.0;
pub const LRS_ENERGY: i32 = 500;
pub const LRS_TIME: f64 = 3.0;

pub const BLAST_RANGE: f64 = 9.0;
/// Up to this range a blast kills with `BLAST_KILL_CHANCE_NEAR`; beyond it the chance falls
/// exponentially to `BLAST_KILL_CHANCE_FAR` at `BLAST_RANGE`.
pub const BLAST_SURE_RANGE: f64 = 4.0;
pub const BLAST_KILL_CHANCE_NEAR: f64 = 0.9;
pub const BLAST_KILL_CHANCE_FAR: f64 = 0.1;
pub const BLAST_ENERGY_BASE: f64 = 1000.0;
pub const BLAST_TIME_A: f64 = -0.37840;
pub const BLAST_TIME_B: f64 = 1.37840;
pub const TORPEDO_ENERGY: i32 = 100;
pub const TORPEDO_TIME: f64 = 1.0;

pub const EVENT_INTERVAL: f64 = 3.0;
pub const ENEMY_ADVANCE_FRACTION: f64 = 1.0 / 3.0;
pub const ENEMY_ADVANCE_STEPS: usize = 2;
pub const ENEMY_OBLIQUE_CHANCE: f64 = 0.5;
pub const ENEMY_AMBUSH_CHANCE: f64 = 0.3;
/// Raxxon damage at 1 cell, easing linearly to `ENEMY_FIRE_NEAR` at `ENEMY_FIRE_NEAR_RANGE`, then
/// decaying exponentially to `ENEMY_FIRE_FAR` at `ENEMY_FIRE_FAR_RANGE` and beyond.
pub const ENEMY_FIRE_BASE: f64 = 2000.0;
pub const ENEMY_FIRE_NEAR: f64 = 1800.0;
pub const ENEMY_FIRE_NEAR_RANGE: f64 = 2.0;
pub const ENEMY_FIRE_FAR: f64 = 100.0;
pub const ENEMY_FIRE_FAR_RANGE: f64 = 9.0;
/// Enemy fire damage is multiplied by a uniform factor in this band.
pub const ENEMY_FIRE_VARIANCE_MIN: f64 = 0.75;
pub const ENEMY_FIRE_VARIANCE_MAX: f64 = 1.25;

pub const SHIP_MAX_HULL: i32 = 2000;
pub const SHIP_MAX_SHIELDS: i32 = 3000;
pub const SHIP_MAX_ENERGY: i32 = 50000;
pub const SHIP_MAX_QUANTORPEDOES: i32 = 7;

pub const STARDATE_START: (i32, i32) = (1_000_000, 2_000_000);

pub const SHIELD_REPLENISH: i32 = 500;
pub const SHIELD_ENERGY_PER_POINT: i32 = 1;
pub const STARBASE_EMERGENCY_ENERGY: i32 = 1000;
