//! Events: the game's responses to actions (ONTOLOGY Event and the event rules).
//!
//! One template, `Event { can_occur, execute }`. The event lists and their order are fixed
//! here, not stored in the Game.

use crate::constants::*;
use crate::game::Game;
use crate::geometry::{euclid, exp_falloff, format_xy, Xy};

pub struct Event {
    pub can_occur: fn(&Game) -> bool,
    pub execute: fn(&mut Game) -> Vec<String>,
}

pub const STARBASE_HAIL: Event = Event { can_occur: starbase_present, execute: starbase_hail };
pub const SHIELD_REPLENISH_EVENT: Event = Event { can_occur: shields_can_recharge, execute: shield_replenish };
pub const ENEMIES_TURN: Event = Event { can_occur: enemies_present, execute: enemies_turn };

const WARP_EVENTS: [Event; 1] = [STARBASE_HAIL];
const STARDATE_EVENTS: [Event; 2] = [SHIELD_REPLENISH_EVENT, ENEMIES_TURN];

fn run_all(events: &[Event], game: &mut Game) -> Vec<String> {
    let mut messages = Vec::new();
    for event in events {
        if (event.can_occur)(game) {
            messages.extend((event.execute)(game));
        }
    }
    messages
}

pub fn warp_events(game: &mut Game) -> Vec<String> {
    run_all(&WARP_EVENTS, game)
}

/// Runs when enough time has built up since the last run (or since arrival).
pub fn stardate_events(game: &mut Game) -> Vec<String> {
    if game.startick - game.last_event_startick < EVENT_INTERVAL {
        return Vec::new();
    }
    let messages = run_all(&STARDATE_EVENTS, game);
    game.last_event_startick = game.startick;
    messages
}

fn starbase_present(game: &Game) -> bool {
    game.sector.starbase_xy.is_some()
}

fn enemies_present(game: &Game) -> bool {
    game.sector.has_enemies()
}

fn shields_can_recharge(game: &Game) -> bool {
    game.ship.shields < game.ship.max_shields && game.ship.energy >= 1
}

fn starbase_hail(game: &mut Game) -> Vec<String> {
    let news = match game.sector.has_enemies() {
        true => "under attack, needs assistance",
        false => "all clear, approach for docking",
    };
    vec![format!("Starbase communication: {news}")]
}

fn shield_replenish(game: &mut Game) -> Vec<String> {
    recharge_shields(game, SHIELD_REPLENISH)
}

/// The shield recharge shared by ShieldReplenish and the Warp rule (D-27): up to `limit`
/// points, as far as the shields' maximum and the energy allow. The cost rounds up, so a
/// recharge is never free. No message when nothing is recharged.
pub fn recharge_shields(game: &mut Game, limit: i32) -> Vec<String> {
    let ship = &mut game.ship;
    let points = limit
        .min(ship.max_shields - ship.shields)
        .min(ship.energy * SHIELD_POINTS_PER_ENERGY);
    if points <= 0 {
        return Vec::new();
    }
    let cost = (points + SHIELD_POINTS_PER_ENERGY - 1) / SHIELD_POINTS_PER_ENERGY;
    ship.shields += points;
    ship.energy -= cost;
    vec![format!("Shields recharged by {points} using {cost} energy")]
}

/// Every enemy acts once, in `enemies_xy` order: advance with probability
/// `ENEMY_ADVANCE_FRACTION`, else fire.
pub fn enemies_turn(game: &mut Game) -> Vec<String> {
    let mut messages = Vec::new();
    for index in 0..game.sector.enemies_xy.len() {
        let action = match game.rng.chance(ENEMY_ADVANCE_FRACTION) {
            true => enemy_advance,
            false => enemy_fire,
        };
        messages.extend(action(game, index));
    }
    messages
}

/// On arrival each enemy fires once with probability `chance`, by the enemy fire rule.
/// Stops when the ship is destroyed.
pub fn ambush(game: &mut Game, chance: f64) -> Vec<String> {
    let mut messages = Vec::new();
    for index in 0..game.sector.enemies_xy.len() {
        if game.ship.hull == 0 {
            break;
        }
        if game.rng.chance(chance) {
            messages.extend(enemy_fire(game, index));
        }
    }
    messages
}

/// How an advancing enemy heads for the ship: straight down the ray, or with each step
/// turned one octant (45 degrees) to the left or right of it.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Approach {
    Left,
    HeadOn,
    Right,
}

/// The 8 neighbour steps (dx, dy) in clockwise order, starting up.
const OCTANTS: [(i32, i32); 8] = [(0, -1), (1, -1), (1, 0), (1, 1), (0, 1), (-1, 1), (-1, 0), (-1, -1)];

/// Draws the approach: `ENEMY_OBLIQUE_CHANCE` is split evenly between left and right.
fn choose_approach(game: &mut Game) -> Approach {
    let roll = game.rng.unit();
    match roll {
        r if r < ENEMY_OBLIQUE_CHANCE / 2.0 => Approach::Left,
        r if r >= 1.0 - ENEMY_OBLIQUE_CHANCE / 2.0 => Approach::Right,
        _ => Approach::HeadOn,
    }
}

pub fn enemy_advance(game: &mut Game, index: usize) -> Vec<String> {
    let approach = choose_approach(game);
    advance_by(game, index, approach)
}

/// Moves the enemy by `approach`, only onto empty cells; otherwise it stays and reports blocked.
pub fn advance_by(game: &mut Game, index: usize, approach: Approach) -> Vec<String> {
    let from = game.sector.enemies_xy[index];
    let dest = match approach {
        Approach::HeadOn => head_on_dest(game, from),
        _ => oblique_dest(game, from, approach),
    };
    let blocked = match dest {
        Some(dest) => !game.sector.is_empty(dest),
        None => true,
    };
    if blocked {
        return vec!["Enemy attempted to advance but path was blocked".to_string()];
    }
    let dest = dest.unwrap();
    game.sector.move_occupant(from, dest);
    game.sector.enemies_xy[index] = dest;
    vec![format!("Enemy advanced from {} to {}", format_xy(from), format_xy(dest))]
}

fn head_on_dest(game: &Game, from: Xy) -> Option<Xy> {
    let ray = game.sector.ray(from, game.sector.ship_xy);
    Some(ray[ENEMY_ADVANCE_STEPS.min(ray.len() - 1)])
}

/// Each of `ENEMY_ADVANCE_STEPS` steps is the head-on step turned one octant. A step that
/// would be farther from the ship than where it stands is taken head-on instead. None when
/// a step is blocked.
fn oblique_dest(game: &Game, from: Xy, approach: Approach) -> Option<Xy> {
    let ship = game.sector.ship_xy;
    let mut at = from;
    for _ in 0..ENEMY_ADVANCE_STEPS {
        let head = game.sector.ray(at, ship).get(1).copied()?;
        let step = (head.x - at.x, head.y - at.y);
        let slot = OCTANTS.iter().position(|&o| o == step)?;
        let turn = if approach == Approach::Left { 7 } else { 1 };
        let (dx, dy) = OCTANTS[(slot + turn) % 8];
        let side = at.offset(dx, dy);
        let next = if euclid(side, ship) > euclid(at, ship) { head } else { side };
        if !game.sector.is_empty(next) {
            return None;
        }
        at = next;
    }
    Some(at)
}

pub fn enemy_fire(game: &mut Game, index: usize) -> Vec<String> {
    let factor = fire_factor(game.rng.unit());
    enemy_fire_by(game, index, factor)
}

/// The EnemyFire rule with its damage factor given.
pub fn enemy_fire_by(game: &mut Game, index: usize, factor: f64) -> Vec<String> {
    let from = game.sector.enemies_xy[index];
    let ship_xy = game.sector.ship_xy;
    if game.sector.ray(from, ship_xy).last() != Some(&ship_xy) {
        return vec![format!("Enemy at {} fires raxxon beam but path is blocked", format_xy(from))];
    }
    let distance = euclid(from, ship_xy);
    let damage = fire_damage(distance, factor);
    let dealt = absorb(game, damage);
    vec![
        format!("Enemy at {} fires raxxon beam! Distance: {distance:.2}, Damage: {damage}", format_xy(from)),
        format!("Ship takes {dealt} damage"),
    ]
}

/// A roll in [0, 1) mapped onto the band `ENEMY_FIRE_VARIANCE_MIN..ENEMY_FIRE_VARIANCE_MAX`.
pub fn fire_factor(roll: f64) -> f64 {
    ENEMY_FIRE_VARIANCE_MIN + (ENEMY_FIRE_VARIANCE_MAX - ENEMY_FIRE_VARIANCE_MIN) * roll
}

pub fn fire_damage(distance: f64, factor: f64) -> i32 {
    (fire_base_damage(distance) * factor).round() as i32
}

/// Raxxon damage before the shot's factor (D-10): `ENEMY_FIRE_BASE` at 1 cell, easing linearly to
/// `ENEMY_FIRE_NEAR` at `ENEMY_FIRE_NEAR_RANGE`, then decaying exponentially to `ENEMY_FIRE_FAR` at
/// `ENEMY_FIRE_FAR_RANGE` and holding there beyond it.
pub fn fire_base_damage(distance: f64) -> f64 {
    if distance >= ENEMY_FIRE_FAR_RANGE {
        return ENEMY_FIRE_FAR;
    }
    if distance > ENEMY_FIRE_NEAR_RANGE {
        return exp_falloff(distance, ENEMY_FIRE_NEAR_RANGE, ENEMY_FIRE_FAR_RANGE, ENEMY_FIRE_NEAR, ENEMY_FIRE_FAR);
    }
    let along = (distance - 1.0) / (ENEMY_FIRE_NEAR_RANGE - 1.0);
    ENEMY_FIRE_BASE + (ENEMY_FIRE_NEAR - ENEMY_FIRE_BASE) * along
}

/// Shields first, then hull, neither below 0; each part is counted. Returns the damage taken.
fn absorb(game: &mut Game, damage: i32) -> i32 {
    let ship = &mut game.ship;
    let to_shields = damage.min(ship.shields);
    let to_hull = (damage - to_shields).min(ship.hull);
    ship.shields -= to_shields;
    ship.hull -= to_hull;
    game.counters.shield_damage += to_shields as u32;
    game.counters.hull_damage += to_hull as u32;
    to_shields + to_hull
}

