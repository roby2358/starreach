//! The player's actions (ONTOLOGY rules Warp … Torpedo) and the Game end rule.
//!
//! Each action checks its legality before it changes anything, returns `Err(message)` when
//! refused, and pushes event messages onto `events`.

use serde::Serialize;

use crate::constants::*;
use crate::events::{enemies_turn, stardate_events, warp_events};
use crate::game::{Game, Status};
use crate::geometry::{adjacent, euclid, format_yx, Yx};

pub type Refusal = String;

/// The command's own data, returned in `Result.report`.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(untagged)]
pub enum Report {
    GalaxyMap { map: Vec<String> },
    Warp { sector_yx: Yx, distance: i32, energy_cost: i32, time: f64 },
    Subwarp { ship_yx: Yx, path: Vec<Yx>, energy_cost: i32, time: f64 },
    Dock { time: f64 },
    Scan { scan: Vec<String>, energy_cost: i32 },
    Shot { hit_yx: Yx, path: Vec<Yx>, energy_cost: i32, time: f64 },
}

pub fn warp_distance(from: Yx, to: Yx) -> i32 {
    (euclid(from, to) * WARP_DISTANCE_SCALE) as i32
}

pub fn warp_cost(from: Yx, to: Yx) -> i32 {
    warp_distance(from, to) * WARP_ENERGY_PER_DISTANCE
}

pub fn warp(game: &mut Game, target: Yx, events: &mut Vec<String>) -> Result<Report, Refusal> {
    if target == game.sector_yx {
        return Err("The ship is already in that sector".to_string());
    }
    let distance = warp_distance(game.sector_yx, target);
    let energy_cost = warp_cost(game.sector_yx, target);
    afford(game, energy_cost, "warp")?;
    if game.sector.has_enemies() {
        events.extend(enemies_turn(game));
    }
    if game.ship.hull == 0 {
        return Ok(Report::Warp { sector_yx: game.sector_yx, distance: 0, energy_cost: 0, time: 0.0 });
    }
    let time = distance as f64 * WARP_TIME_PER_DISTANCE;
    game.ship.energy -= energy_cost;
    game.stardate += time;
    game.enter_sector(target);
    events.extend(warp_events(game));
    Ok(Report::Warp { sector_yx: target, distance, energy_cost, time })
}

pub fn subwarp(game: &mut Game, dest: Yx, events: &mut Vec<String>) -> Result<Report, Refusal> {
    let limit = match game.sector.has_enemies() {
        true => SUBWARP_MAX_STEPS_HOSTILE,
        false => SUBWARP_MAX_STEPS,
    };
    let ray = game.sector.ray(game.sector.ship_yx, dest);
    let open = ray.iter().skip(1).take_while(|&&cell| game.sector.is_empty(cell)).count();
    let steps = open.min(limit);
    if steps == 0 {
        return Err(format!("No clear path toward {}", format_yx(dest)));
    }
    let energy_cost = steps as i32 * SUBWARP_ENERGY_PER_STEP;
    afford(game, energy_cost, "subwarp")?;
    let path = ray[..=steps].to_vec();
    let ship_yx = path[steps];
    let time = steps as f64 * SUBWARP_TIME_PER_STEP;
    game.sector.move_occupant(game.sector.ship_yx, ship_yx);
    game.sector.ship_yx = ship_yx;
    game.ship.energy -= energy_cost;
    game.stardate += time;
    events.extend(stardate_events(game));
    Ok(Report::Subwarp { ship_yx, path, energy_cost, time })
}

pub fn dock(game: &mut Game, events: &mut Vec<String>) -> Result<Report, Refusal> {
    if game.sector.has_enemies() {
        return Err("Cannot dock while enemies are present in the sector".to_string());
    }
    let Some(starbase_yx) = game.sector.starbase_yx else {
        return Err("No starbase present in this sector".to_string());
    };
    if !adjacent(starbase_yx, game.sector.ship_yx) {
        return Err("Starbase is not adjacent to the ship".to_string());
    }
    game.ship.resupply();
    game.stardate += DOCK_TIME;
    events.extend(stardate_events(game));
    Ok(Report::Dock { time: DOCK_TIME })
}

pub fn long_range_scan(game: &mut Game, events: &mut Vec<String>) -> Result<Report, Refusal> {
    afford(game, LRS_ENERGY, "a long-range scan")?;
    game.ship.energy -= LRS_ENERGY;
    let scan = game.galaxy.scan(game.sector_yx);
    events.extend(stardate_events(game));
    Ok(Report::Scan { scan, energy_cost: LRS_ENERGY })
}

pub fn blast(game: &mut Game, target: Yx, events: &mut Vec<String>) -> Result<Report, Refusal> {
    let (hit_yx, path) = first_enemy(game, target, "beam")?;
    let range = euclid(game.sector.ship_yx, hit_yx);
    if range > BLAST_RANGE {
        return Err(format!("Enemy at {} is out of blast range ({range:.2} > {BLAST_RANGE})", format_yx(hit_yx)));
    }
    let energy_cost = blast_energy(range);
    afford(game, energy_cost, "this blast")?;
    let time = blast_time(range);
    fire(game, hit_yx, energy_cost, time, events);
    Ok(Report::Shot { hit_yx, path, energy_cost, time })
}

/// Blast energy cost at a range: rises with its square root (D-9).
pub fn blast_energy(range: f64) -> i32 {
    (BLAST_ENERGY_BASE * range.sqrt()) as i32
}

/// Blast time at a range, in whole stardates.
pub fn blast_time(range: f64) -> f64 {
    (BLAST_TIME_A + BLAST_TIME_B * range.sqrt()).trunc()
}

pub fn torpedo(game: &mut Game, target: Yx, events: &mut Vec<String>) -> Result<Report, Refusal> {
    if game.ship.quantorpedoes == 0 {
        return Err("No quantorpedoes remaining".to_string());
    }
    afford(game, TORPEDO_ENERGY, "a torpedo")?;
    let (hit_yx, path) = first_enemy(game, target, "torpedo")?;
    game.ship.quantorpedoes -= 1;
    fire(game, hit_yx, TORPEDO_ENERGY, TORPEDO_TIME, events);
    Ok(Report::Shot { hit_yx, path, energy_cost: TORPEDO_ENERGY, time: TORPEDO_TIME })
}

fn afford(game: &Game, cost: i32, what: &str) -> Result<(), Refusal> {
    match game.ship.energy >= cost {
        true => Ok(()),
        false => Err(format!("Insufficient energy for {what}: needs {cost}, have {}", game.ship.energy)),
    }
}

fn first_enemy(game: &Game, target: Yx, weapon: &str) -> Result<(Yx, Vec<Yx>), Refusal> {
    game.sector
        .first_enemy(game.sector.ship_yx, target)
        .ok_or_else(|| format!("No enemy in {weapon} path"))
}

/// The shared tail of blast and torpedo.
fn fire(game: &mut Game, hit_yx: Yx, energy_cost: i32, time: f64, events: &mut Vec<String>) {
    game.destroy_enemy(hit_yx);
    game.ship.energy -= energy_cost;
    game.stardate += time;
    events.extend(stardate_events(game));
}

/// Runs after every accepted action.
pub fn game_end(game: &mut Game, events: &mut Vec<String>) {
    if game.ship.hull == 0 {
        return finish(game, Status::Lost, "The ship is destroyed", events);
    }
    if game.galaxy.total_enemies() == 0 {
        return finish(game, Status::Won, "Every enemy in the galaxy is destroyed", events);
    }
    if !stranded(game) {
        return;
    }
    if game.sector.starbase_yx.is_none() {
        return finish(game, Status::Lost, "The ship is stranded without energy to reach a starbase", events);
    }
    let transfer = STARBASE_EMERGENCY_ENERGY - game.ship.energy;
    if transfer > 0 {
        game.ship.energy = STARBASE_EMERGENCY_ENERGY;
        events.push(format!("Starbase transfers emergency energy: {transfer}"));
    }
}

fn finish(game: &mut Game, status: Status, message: &str, events: &mut Vec<String>) {
    game.status = status;
    events.push(message.to_string());
}

/// Energy below the warp cost to the nearest visible starbase sector other than this one.
pub fn stranded(game: &Game) -> bool {
    let nearest = game
        .galaxy
        .visible_starbases()
        .filter(|&yx| yx != game.sector_yx)
        .map(|yx| warp_cost(game.sector_yx, yx))
        .min();
    match nearest {
        Some(cost) => game.ship.energy < cost,
        None => true,
    }
}
