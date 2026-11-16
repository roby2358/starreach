//! The scripted captains: when to warp on, and the whole-game captain's next command.
//!
//! The whole-game captain is a yardstick, not an AI player. It plays with the real commands and
//! knows only what a player would: the sectors the galaxy record shows as visible.

use starreach_core::actions::{warp_cost, warp_time};
use starreach_core::constants::{LRS_ENERGY, SHIP_MAX_HULL, SUBWARP_MAX_STEPS_HOSTILE};
use starreach_core::galaxy::scan_block;
use starreach_core::game::Ship;
use starreach_core::geometry::{adjacent, all_cells, euclid, Yx};
use starreach_core::sector::ActiveSector;
use starreach_core::{apply, Command, Game};

use crate::battle::{engage, nearest_clear};

/// Energy a careful captain keeps for the battle in the next sector: what clearing a sector
/// takes in 9 of 10 battles, from the "battle all" row.
const BATTLE_RESERVE: i32 = 6000;
/// Below this hull the whole-game captain goes to a starbase before the next sector.
const HULL_LOW: i32 = SHIP_MAX_HULL / 2;
/// Energy the whole-game captain keeps in a battle beyond the warp to a starbase: a blast at
/// the far end of its sure range and a full shield recharge on the way.
const WITHDRAW_MARGIN: i32 = 2500;

/// The cheapest warp from `from` to one of `starbases`, leaving out `from` itself.
pub fn cost_to_nearest(from: Yx, starbases: &[Yx]) -> Option<i32> {
    starbases.iter().filter(|&&yx| yx != from).map(|&yx| warp_cost(from, yx)).min()
}

/// Warps on whenever the warp itself is affordable.
pub fn presses_on(game: &Game, target: Yx) -> bool {
    game.ship.energy >= warp_cost(game.sector_yx, target)
}

/// Warps on only if, on arrival, the ship still holds `BATTLE_RESERVE` and the warp from there
/// to the nearest starbase it knows.
pub fn keeps_a_way_home(game: &Game, target: Yx) -> bool {
    let known: Vec<Yx> = game.galaxy.visible_starbases().collect();
    match cost_to_nearest(target, &known) {
        Some(home) => holds_reserve(game, target, home),
        None => false,
    }
}

/// After the warp to `target` the ship still holds `BATTLE_RESERVE` and `home`, the energy to
/// reach a starbase from there.
fn holds_reserve(game: &Game, target: Yx, home: i32) -> bool {
    game.ship.energy >= warp_cost(game.sector_yx, target) + BATTLE_RESERVE + home
}

/// The whole-game captain's next command, applied: fight the sector (or leave it while the
/// energy still reaches a starbase), else dock when a starbase is here, else scan what is hidden
/// around the ship, else warp to the next sector. None when the captain can do nothing.
pub fn captain_step(game: &Game) -> Option<Game> {
    if game.sector.has_enemies() {
        return withdraw(game).or_else(|| fight_step(game));
    }
    if game.sector.starbase_yx.is_some() && game.ship != Ship::full() {
        return dock_step(game);
    }
    if scan_is_due(game) {
        return accepted(game, &Command::LongRangeScan);
    }
    let (y, x) = next_sector(game)?;
    accepted(game, &Command::GalaxyWarp { y, x })
}

fn accepted(game: &Game, command: &Command) -> Option<Game> {
    let applied = apply(game, command);
    applied.result.ok.then_some(applied.game)
}

/// Leaves a battle for the nearest known starbase when the hull is low, or when the energy is
/// down to the warp there and `WITHDRAW_MARGIN`. None when the captain stays, or the core
/// refuses the warp.
fn withdraw(game: &Game) -> Option<Game> {
    let home = way_home(game, game.sector_yx)?;
    if game.ship.energy >= home + WITHDRAW_MARGIN {
        return None;
    }
    let (y, x) = nearest_starbase(game)?;
    accepted(game, &Command::GalaxyWarp { y, x })
}

/// One command of the battle: the battle policy's shot at the nearest enemy in the clear; when
/// there is none, or the core refuses the shot (too little energy for a blast at that range),
/// a subwarp to open a shot or close the range.
fn fight_step(game: &Game) -> Option<Game> {
    let state = game.state();
    nearest_clear(&state.enemies)
        .and_then(|target| accepted(game, &engage(target, state.ship_quantorpedoes)))
        .or_else(|| close_in(game))
}

/// How good a firing position `cell` is: whether every enemy is out of its line of fire, then
/// the range to the nearest enemy it could fire on (to the nearest of all when it has none).
fn firing_rank(sector: &ActiveSector, cell: Yx) -> (bool, f64) {
    let in_line = |enemy: Yx| sector.first_enemy(cell, enemy).is_some_and(|(hit, _)| hit == enemy);
    let nearest = |enemies: &mut dyn Iterator<Item = Yx>| enemies.map(|enemy| euclid(cell, enemy)).min_by(f64::total_cmp);
    let enemies = || sector.enemies_yx.iter().copied();
    match nearest(&mut enemies().filter(|&enemy| in_line(enemy))) {
        Some(range) => (false, range),
        None => (true, nearest(&mut enemies()).unwrap_or(f64::MAX)),
    }
}

/// Subwarps to the best firing position within one hostile subwarp.
fn close_in(game: &Game) -> Option<Game> {
    let sector = &game.sector;
    let ship = sector.ship_yx;
    let within = |cell: Yx| (cell.0 - ship.0).abs().max((cell.1 - ship.1).abs()) <= SUBWARP_MAX_STEPS_HOSTILE as i32;
    let rank = |cell: Yx| firing_rank(sector, cell);
    let (y, x) = all_cells()
        .filter(|&cell| within(cell) && reaches(sector, ship, cell))
        .min_by(|&a, &b| rank(a).partial_cmp(&rank(b)).expect("ranges are numbers"))?;
    accepted(game, &Command::Subwarp { y, x })
}

/// Warp energy from `from` to a starbase the captain knows: nothing when `from` has one.
fn way_home(game: &Game, from: Yx) -> Option<i32> {
    let known: Vec<Yx> = game.galaxy.visible_starbases().collect();
    match known.contains(&from) {
        true => Some(0),
        false => cost_to_nearest(from, &known),
    }
}

/// A sector next to the ship's is still hidden, and the scan leaves the energy to get home.
fn scan_is_due(game: &Game) -> bool {
    let hidden = scan_block(game.sector_yx).any(|yx| !game.galaxy.record(yx).visible);
    let spare = way_home(game, game.sector_yx).is_some_and(|home| game.ship.energy >= LRS_ENERGY + home);
    hidden && spare
}

/// The cheapest sector to warp to among those `wanted` picks.
fn nearest_sector(game: &Game, wanted: impl Fn(Yx) -> bool) -> Option<Yx> {
    all_cells()
        .filter(|&yx| yx != game.sector_yx && wanted(yx))
        .min_by_key(|&yx| warp_time(game.sector_yx, yx))
}

/// The cheapest known starbase sector to warp to.
fn nearest_starbase(game: &Game) -> Option<Yx> {
    let record = |yx| game.galaxy.record(yx);
    nearest_sector(game, |yx| record(yx).visible && record(yx).starbases > 0)
}

/// Where the whole-game captain warps next: to the nearest sector known to hold enemies, or
/// with none known the nearest hidden one; but to the nearest known starbase when the hull is
/// low, the ship carries fewer torpedoes than that sector has enemies (a full rack is always
/// enough), or the warp would not leave a battle reserve and a way home.
fn next_sector(game: &Game) -> Option<Yx> {
    let record = |yx| game.galaxy.record(yx);
    let starbase = nearest_starbase(game);
    let target = nearest_sector(game, |yx| record(yx).visible && record(yx).enemies > 0)
        .or_else(|| nearest_sector(game, |yx| !record(yx).visible))?;
    let torpedoes_wanted = (record(target).enemies as i32).clamp(1, game.ship.max_quantorpedoes);
    if game.ship.hull < HULL_LOW || game.ship.quantorpedoes < torpedoes_wanted {
        return starbase;
    }
    match way_home(game, target).is_some_and(|home| holds_reserve(game, target, home)) {
        true => Some(target),
        false => starbase,
    }
}

/// `to` is empty and a subwarp from `from` toward it arrives.
fn reaches(sector: &ActiveSector, from: Yx, to: Yx) -> bool {
    sector.is_empty(to) && sector.ray(from, to).last() == Some(&to)
}

/// One command toward a resupply: dock when beside the starbase, else subwarp to the nearest
/// cell beside it that a straight run reaches, else to a cell from which one can be reached.
fn dock_step(game: &Game) -> Option<Game> {
    let sector = &game.sector;
    let ship = sector.ship_yx;
    let starbase = sector.starbase_yx?;
    if adjacent(starbase, ship) {
        return accepted(game, &Command::Dock);
    }
    let berths: Vec<Yx> = all_cells().filter(|&yx| adjacent(starbase, yx)).collect();
    let nearest = |cells: &mut dyn Iterator<Item = Yx>| cells.min_by(|&a, &b| euclid(ship, a).total_cmp(&euclid(ship, b)));
    let berth = nearest(&mut berths.iter().copied().filter(|&berth| reaches(sector, ship, berth)));
    let waypoint = || {
        nearest(&mut all_cells().filter(|&cell| {
            reaches(sector, ship, cell) && berths.iter().any(|&berth| reaches(sector, cell, berth))
        }))
    };
    let (y, x) = berth.or_else(waypoint)?;
    accepted(game, &Command::Subwarp { y, x })
}
