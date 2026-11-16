//! The player's actions (ONTOLOGY rules Warp … Torpedo) and the Game end rule.
//!
//! Each action checks its legality before it changes anything, returns `Err(message)` when
//! refused, and pushes event messages onto `events`.

use serde::Serialize;

use crate::constants::*;
use crate::counters::Counters;
use crate::events::{ambush, enemies_turn, recharge_shields, stardate_events, warp_events};
use crate::galaxy::scan_block;
use crate::game::{format_duration, Game, Status};
use crate::geometry::{adjacent, euclid, exp_falloff, format_xy, Xy};

pub type Refusal = String;

/// The command's own data, returned in `Result.report`. `time` is the action's length as a
/// stardate duration (`format_duration`). A warp's `energy_cost` is the warp's own; the shield
/// recharge on the way is charged on top and told in the events.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(untagged)]
pub enum Report {
    GalaxyMap { map: Vec<String> },
    Warp { sector_xy: Xy, energy_cost: i32, time: String },
    Subwarp { ship_xy: Xy, path: Vec<Xy>, energy_cost: i32, time: String },
    Dock { time: String },
    Scan { scan: Vec<String>, energy_cost: i32, time: String },
    Shot { hit_xy: Xy, path: Vec<Xy>, destroyed: bool, energy_cost: i32, time: String },
}

/// Warp time in starticks: logarithmic in the distance in sectors, rounded to the nearest
/// whole startick (D-5).
pub fn warp_time(from: Xy, to: Xy) -> i64 {
    (WARP_TIME_K * (euclid(from, to) + 1.0).ln()).round() as i64
}

/// Warp energy: a flat price per startick of the journey (D-5).
pub fn warp_cost(from: Xy, to: Xy) -> i32 {
    warp_time(from, to) as i32 * WARP_ENERGY_PER_TICK
}

pub fn warp(game: &mut Game, target: Xy, events: &mut Vec<String>) -> Result<Report, Refusal> {
    if target == game.sector_xy {
        return Err("The ship is already in that sector".to_string());
    }
    let energy_cost = warp_cost(game.sector_xy, target);
    afford(game, energy_cost, "warp")?;
    if game.sector.has_enemies() {
        events.extend(enemies_turn(game));
    }
    if game.ship.hull == 0 {
        return Ok(Report::Warp { sector_xy: game.sector_xy, energy_cost: 0, time: format_duration(0) });
    }
    let time = warp_time(game.sector_xy, target);
    game.ship.energy -= energy_cost;
    game.startick += time;
    let shield_limit = game.ship.max_shields;
    events.extend(recharge_shields(game, shield_limit));
    game.enter_sector(target);
    game.counters.sectors_warped += 1;
    events.extend(ambush(game, ENEMY_AMBUSH_CHANCE));
    events.extend(warp_events(game));
    Ok(Report::Warp { sector_xy: target, energy_cost, time: format_duration(time) })
}

pub fn subwarp(game: &mut Game, dest: Xy, events: &mut Vec<String>) -> Result<Report, Refusal> {
    let limit = match game.sector.has_enemies() {
        true => SUBWARP_MAX_STEPS_HOSTILE,
        false => SUBWARP_MAX_STEPS,
    };
    let ray = game.sector.ray(game.sector.ship_xy, dest);
    let open = ray.iter().skip(1).take_while(|&&cell| game.sector.is_empty(cell)).count();
    let steps = open.min(limit);
    if steps == 0 {
        return Err(format!("No clear path toward {}", format_xy(dest)));
    }
    let energy_cost = steps as i32 * SUBWARP_ENERGY_PER_STEP;
    afford(game, energy_cost, "subwarp")?;
    let path = ray[..=steps].to_vec();
    let ship_xy = path[steps];
    let time = steps as i64 * SUBWARP_TIME_PER_STEP;
    game.sector.move_occupant(game.sector.ship_xy, ship_xy);
    game.sector.ship_xy = ship_xy;
    game.ship.energy -= energy_cost;
    pass_time(game, time, events);
    Ok(Report::Subwarp { ship_xy, path, energy_cost, time: format_duration(time) })
}

pub fn dock(game: &mut Game, events: &mut Vec<String>) -> Result<Report, Refusal> {
    if game.sector.has_enemies() {
        return Err("Cannot dock while enemies are present in the sector".to_string());
    }
    let Some(starbase_xy) = game.sector.starbase_xy else {
        return Err("No starbase present in this sector".to_string());
    };
    if !adjacent(starbase_xy, game.sector.ship_xy) {
        return Err("Starbase is not adjacent to the ship".to_string());
    }
    game.ship.resupply();
    game.counters.docks += 1;
    pass_time(game, DOCK_TIME, events);
    Ok(Report::Dock { time: format_duration(DOCK_TIME) })
}

pub fn long_range_scan(game: &mut Game, events: &mut Vec<String>) -> Result<Report, Refusal> {
    afford(game, LRS_ENERGY, "a long-range scan")?;
    game.ship.energy -= LRS_ENERGY;
    game.counters.scans += 1;
    for xy in scan_block(game.sector_xy) {
        game.reveal(xy);
    }
    let scan = game.galaxy.scan(game.sector_xy);
    pass_time(game, LRS_TIME, events);
    Ok(Report::Scan { scan, energy_cost: LRS_ENERGY, time: format_duration(LRS_TIME) })
}

pub fn blast(game: &mut Game, target: Xy, events: &mut Vec<String>) -> Result<Report, Refusal> {
    let roll = game.rng.unit();
    blast_by(game, target, roll, events)
}

/// The Blast rule with its kill roll given: the hit enemy is destroyed iff
/// `roll < blast_kill_chance(range)`. A miss still costs the energy and the time.
pub fn blast_by(game: &mut Game, target: Xy, roll: f64, events: &mut Vec<String>) -> Result<Report, Refusal> {
    let (hit_xy, path) = first_enemy(game, target, "beam")?;
    let range = euclid(game.sector.ship_xy, hit_xy);
    if range > BLAST_RANGE {
        return Err(format!("Enemy at {} is out of blast range ({range:.2} > {BLAST_RANGE})", format_xy(hit_xy)));
    }
    let energy_cost = blast_energy(range);
    afford(game, energy_cost, "this blast")?;
    let time = blast_time(range);
    let destroyed = roll < blast_kill_chance(range);
    match destroyed {
        true => game.counters.blasts_hit += 1,
        false => {
            game.counters.blasts_missed += 1;
            events.push(format!("Blaston beam misses the enemy at {}! Distance: {range:.2}", format_xy(hit_xy)));
        }
    }
    fire(game, hit_xy, destroyed, energy_cost, time, events);
    Ok(Report::Shot { hit_xy, path, destroyed, energy_cost, time: format_duration(time) })
}

/// The chance a blast destroys the enemy it hits: `BLAST_KILL_CHANCE_NEAR` up to
/// `BLAST_SURE_RANGE`, then decaying exponentially to `BLAST_KILL_CHANCE_FAR` at `BLAST_RANGE`.
pub fn blast_kill_chance(range: f64) -> f64 {
    if range <= BLAST_SURE_RANGE {
        return BLAST_KILL_CHANCE_NEAR;
    }
    exp_falloff(range, BLAST_SURE_RANGE, BLAST_RANGE, BLAST_KILL_CHANCE_NEAR, BLAST_KILL_CHANCE_FAR)
}

/// Blast energy cost at a range: rises with its square root (D-9).
pub fn blast_energy(range: f64) -> i32 {
    (BLAST_ENERGY_BASE * range.sqrt()) as i32
}

/// Blast time at a range, in starticks, truncated to a whole one.
pub fn blast_time(range: f64) -> i64 {
    (BLAST_TIME_A + BLAST_TIME_B * range.sqrt()) as i64
}

pub fn torpedo(game: &mut Game, target: Xy, events: &mut Vec<String>) -> Result<Report, Refusal> {
    if game.ship.quantorpedoes == 0 {
        return Err("No quantorpedoes remaining".to_string());
    }
    afford(game, TORPEDO_ENERGY, "a torpedo")?;
    let (hit_xy, path) = first_enemy(game, target, "torpedo")?;
    game.ship.quantorpedoes -= 1;
    game.counters.torpedoes_fired += 1;
    fire(game, hit_xy, true, TORPEDO_ENERGY, TORPEDO_TIME, events);
    Ok(Report::Shot { hit_xy, path, destroyed: true, energy_cost: TORPEDO_ENERGY, time: format_duration(TORPEDO_TIME) })
}

fn afford(game: &Game, cost: i32, what: &str) -> Result<(), Refusal> {
    match game.ship.energy >= cost {
        true => Ok(()),
        false => Err(format!("Insufficient energy for {what}: needs {cost}, have {}", game.ship.energy)),
    }
}

fn first_enemy(game: &Game, target: Xy, weapon: &str) -> Result<(Xy, Vec<Xy>), Refusal> {
    game.sector
        .first_enemy(game.sector.ship_xy, target)
        .ok_or_else(|| format!("No enemy in {weapon} path"))
}

/// The shared tail of blast and torpedo.
fn fire(game: &mut Game, hit_xy: Xy, destroyed: bool, energy_cost: i32, time: i64, events: &mut Vec<String>) {
    if destroyed {
        game.destroy_enemy(hit_xy);
    }
    game.ship.energy -= energy_cost;
    pass_time(game, time, events);
}

/// Moves the clock on by `time` starticks and runs the stardate events that fall due.
fn pass_time(game: &mut Game, time: i64, events: &mut Vec<String>) {
    game.startick += time;
    events.extend(stardate_events(game));
}

/// One way a game ends: the status it leaves, its message and what it adds to the counters.
struct Ending {
    status: Status,
    message: &'static str,
    count: fn(&mut Counters),
}

const DESTROYED: Ending =
    Ending { status: Status::Lost, message: "The ship is destroyed", count: |c| c.games_lost += 1 };
const VICTORIOUS: Ending =
    Ending { status: Status::Won, message: "Every enemy in the galaxy is destroyed", count: |c| c.games_won += 1 };
const STRANDED: Ending = Ending {
    status: Status::Lost,
    message: "The ship is stranded without energy to reach a starbase",
    count: |c| {
        c.games_lost += 1;
        c.times_stranded += 1;
    },
};

/// Runs after every accepted action.
pub fn game_end(game: &mut Game, events: &mut Vec<String>) {
    if game.ship.hull == 0 {
        return finish(game, &DESTROYED, events);
    }
    if game.galaxy.total_enemies() == 0 {
        return finish(game, &VICTORIOUS, events);
    }
    if !stranded(game) {
        return;
    }
    if game.sector.starbase_xy.is_none() {
        return finish(game, &STRANDED, events);
    }
    let transfer = STARBASE_EMERGENCY_ENERGY - game.ship.energy;
    if transfer > 0 {
        game.ship.energy = STARBASE_EMERGENCY_ENERGY;
        events.push(format!("Starbase transfers emergency energy: {transfer}"));
    }
}

fn finish(game: &mut Game, ending: &Ending, events: &mut Vec<String>) {
    game.status = ending.status;
    (ending.count)(&mut game.counters);
    events.push(ending.message.to_string());
}

/// Energy below the warp cost to the nearest visible starbase sector other than this one.
pub fn stranded(game: &Game) -> bool {
    let nearest = game
        .galaxy
        .visible_starbases()
        .filter(|&xy| xy != game.sector_xy)
        .map(|xy| warp_cost(game.sector_xy, xy))
        .min();
    match nearest {
        Some(cost) => game.ship.energy < cost,
        None => true,
    }
}
