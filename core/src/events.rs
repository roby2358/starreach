//! Events: the game's responses to actions (ONTOLOGY Event and the event rules).
//!
//! One template, `Event { can_occur, execute }`. The event lists and their order are fixed
//! here, not stored in the Game.

use crate::constants::*;
use crate::game::Game;
use crate::geometry::{euclid, format_yx};

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
    if game.stardate - game.last_event_stardate < EVENT_INTERVAL {
        return Vec::new();
    }
    let messages = run_all(&STARDATE_EVENTS, game);
    game.last_event_stardate = game.stardate;
    messages
}

fn starbase_present(game: &Game) -> bool {
    game.sector.starbase_yx.is_some()
}

fn enemies_present(game: &Game) -> bool {
    game.sector.has_enemies()
}

fn shields_can_recharge(game: &Game) -> bool {
    game.ship.shields < game.ship.max_shields && game.ship.energy >= SHIELD_ENERGY_PER_POINT
}

fn starbase_hail(game: &mut Game) -> Vec<String> {
    let news = match game.sector.has_enemies() {
        true => "under attack, needs assistance",
        false => "all clear, approach for docking",
    };
    vec![format!("Starbase communication: {news}")]
}

fn shield_replenish(game: &mut Game) -> Vec<String> {
    let ship = &mut game.ship;
    let amount = SHIELD_REPLENISH
        .min(ship.max_shields - ship.shields)
        .min(ship.energy / SHIELD_ENERGY_PER_POINT);
    let cost = amount * SHIELD_ENERGY_PER_POINT;
    ship.shields += amount;
    ship.energy -= cost;
    vec![format!("Shields recharged by {amount} using {cost} energy")]
}

/// Every enemy acts once, in `enemies_yx` order: advance with probability
/// `ENEMY_ADVANCE_FRACTION`, else fire.
pub fn enemies_turn(game: &mut Game) -> Vec<String> {
    let mut messages = Vec::new();
    for index in 0..game.sector.enemies_yx.len() {
        let action = match game.rng.chance(ENEMY_ADVANCE_FRACTION) {
            true => enemy_advance,
            false => enemy_fire,
        };
        messages.extend(action(game, index));
    }
    messages
}

pub fn enemy_advance(game: &mut Game, index: usize) -> Vec<String> {
    let from = game.sector.enemies_yx[index];
    let ray = game.sector.ray(from, game.sector.ship_yx);
    let dest = ray[ENEMY_ADVANCE_STEPS.min(ray.len() - 1)];
    if !game.sector.is_empty(dest) {
        return vec!["Enemy attempted to advance but path was blocked".to_string()];
    }
    game.sector.move_occupant(from, dest);
    game.sector.enemies_yx[index] = dest;
    vec![format!("Enemy advanced from {} to {}", format_yx(from), format_yx(dest))]
}

pub fn enemy_fire(game: &mut Game, index: usize) -> Vec<String> {
    let from = game.sector.enemies_yx[index];
    let ship_yx = game.sector.ship_yx;
    if game.sector.ray(from, ship_yx).last() != Some(&ship_yx) {
        return vec![format!("Enemy at {} fires raxxon beam but path is blocked", format_yx(from))];
    }
    let distance = euclid(from, ship_yx);
    let damage = fire_damage(distance);
    let dealt = absorb(game, damage);
    vec![
        format!("Enemy at {} fires raxxon beam! Distance: {distance:.2}, Damage: {damage}", format_yx(from)),
        format!("Ship takes {dealt} damage"),
    ]
}

pub fn fire_damage(distance: f64) -> i32 {
    (ENEMY_FIRE_BASE * (1.0 / distance).powf(ENEMY_FIRE_FALLOFF)).round() as i32
}

/// Shields first, then hull, neither below 0. Returns the damage taken.
fn absorb(game: &mut Game, damage: i32) -> i32 {
    let ship = &mut game.ship;
    let to_shields = damage.min(ship.shields);
    let to_hull = (damage - to_shields).min(ship.hull);
    ship.shields -= to_shields;
    ship.hull -= to_hull;
    to_shields + to_hull
}

