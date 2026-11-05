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
pub const STARBASE_CHANCE: f64 = 0.02;

pub const WARP_DISTANCE_SCALE: f64 = 10.0;
pub const WARP_ENERGY_PER_DISTANCE: i32 = 10;
pub const WARP_TIME_PER_DISTANCE: f64 = 0.01;

pub const SUBWARP_MAX_STEPS: usize = 10;
pub const SUBWARP_MAX_STEPS_HOSTILE: usize = 3;
pub const SUBWARP_ENERGY_PER_STEP: i32 = 2;
pub const SUBWARP_TIME_PER_STEP: f64 = 1.0;

pub const DOCK_TIME: f64 = 5.0;
pub const LRS_ENERGY: i32 = 500;

pub const BLAST_RANGE: f64 = 6.0;
pub const BLAST_ENERGY_BASE: f64 = 1000.0;
pub const BLAST_TIME_A: f64 = -0.37840;
pub const BLAST_TIME_B: f64 = 1.37840;
pub const TORPEDO_ENERGY: i32 = 100;
pub const TORPEDO_TIME: f64 = 1.0;

pub const EVENT_INTERVAL: f64 = 3.0;
pub const ENEMY_ADVANCE_FRACTION: f64 = 1.0 / 3.0;
pub const ENEMY_ADVANCE_STEPS: usize = 2;
pub const ENEMY_FIRE_BASE: f64 = 2000.0;
pub const ENEMY_FIRE_FALLOFF: f64 = 1.57;

pub const SHIP_MAX_HULL: i32 = 2000;
pub const SHIP_MAX_SHIELDS: i32 = 3000;
pub const SHIP_MAX_ENERGY: i32 = 50000;
pub const SHIP_MAX_QUANTORPEDOES: i32 = 7;

pub const STARDATE_START: (i32, i32) = (1_000_000, 2_000_000);

pub const SHIELD_REPLENISH: i32 = 500;
pub const SHIELD_ENERGY_PER_POINT: i32 = 1;
pub const STARBASE_EMERGENCY_ENERGY: i32 = 1000;
