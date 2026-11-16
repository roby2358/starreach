//! The battle policy, and what a battle takes when a fresh ship fights one sector.

use starreach_core::constants::BLAST_SURE_RANGE;
use starreach_core::game::{EnemySight, Ship};
use starreach_core::geometry::{in_bounds, Yx};
use starreach_core::{apply, new_game, Command, Game, Status};

use crate::stats::{average, percentile, sorted};

/// A battle stops after this many commands, so a policy that can't finish can't hang the run.
const BATTLE_COMMAND_CAP: u32 = 200;
/// When the modeled games start. No modeled number depends on it.
pub const START_UNIX_SECONDS: i64 = 0;
const NEIGHBOURS: [Yx; 8] = [(-1, 0), (-1, 1), (0, 1), (1, 1), (1, 0), (1, -1), (0, -1), (-1, -1)];

struct Battle {
    enemies: u32,
    starticks: i64,
    energy: i32,
    cleared: bool,
}

/// The nearest enemy the ship has a clear shot at.
pub fn nearest_clear(enemies: &[EnemySight]) -> Option<&EnemySight> {
    enemies.iter().filter(|e| e.clear_shot).min_by(|a, b| a.range.total_cmp(&b.range))
}

/// The battle policy against the enemy it has a clear shot at: a blast inside its sure range;
/// beyond it a torpedo while any remain, else a subwarp toward the enemy to close the range.
pub fn engage(target: &EnemySight, torpedoes: i32) -> Command {
    let (y, x) = target.yx;
    if target.range <= BLAST_SURE_RANGE {
        return Command::Blast { y, x };
    }
    match torpedoes > 0 {
        true => Command::Torpedo { y, x },
        false => Command::Subwarp { y, x },
    }
}

/// With no clear shot, the ship sidesteps: the first neighbouring cell the core accepts.
fn sidestep(game: &Game) -> Option<Game> {
    let (y, x) = game.sector.ship_yx;
    NEIGHBOURS
        .iter()
        .map(|&(dy, dx)| (y + dy, x + dx))
        .filter(|&yx| in_bounds(yx))
        .map(|(y, x)| apply(game, &Command::Subwarp { y, x }))
        .find(|applied| applied.result.ok)
        .map(|applied| applied.game)
}

/// One command of the battle policy, or None when the ship can do nothing.
fn battle_step(game: &Game) -> Option<Game> {
    let state = game.state();
    match nearest_clear(&state.enemies) {
        Some(target) => Some(apply(game, &engage(target, state.ship_quantorpedoes)).game),
        None => sidestep(game),
    }
}

/// The battle policy, command after command, until the sector is clear, the game is over, or
/// the policy is stuck.
pub fn fight_on(mut game: Game) -> Game {
    for _ in 0..BATTLE_COMMAND_CAP {
        if game.status != Status::Playing || !game.sector.has_enemies() {
            break;
        }
        match battle_step(&game) {
            Some(next) => game = next,
            None => break,
        }
    }
    game
}

/// A full-strength ship arrives in `sector_yx` and fights. Arrival is by `enter_sector`, so
/// there is no ambush.
fn fight(seed: u32, sector_yx: Yx) -> Battle {
    let mut arrived = new_game(seed, START_UNIX_SECONDS);
    arrived.ship = Ship::full();
    arrived.enter_sector(sector_yx);
    let enemies = arrived.sector.enemies_yx.len() as u32;
    let (startick, energy) = (arrived.startick, arrived.ship.energy);
    let game = fight_on(arrived);
    Battle {
        enemies,
        starticks: game.startick - startick,
        energy: energy - game.ship.energy,
        cleared: !game.sector.has_enemies(),
    }
}

/// Every sector with enemies in galaxies 0..n, each fought once by a fresh ship.
fn battles(n: u32) -> Vec<Battle> {
    let mut battles = Vec::new();
    for seed in 0..n {
        let galaxy = new_game(seed, START_UNIX_SECONDS).galaxy;
        for (y, row) in galaxy.sectors.iter().enumerate() {
            for (x, record) in row.iter().enumerate() {
                if record.enemies > 0 {
                    battles.push(fight(seed, (y as i32, x as i32)));
                }
            }
        }
    }
    battles
}

fn print_battle_row(label: &str, battles: &[&Battle]) {
    let cleared = || battles.iter().filter(|b| b.cleared);
    let times = sorted(cleared().map(|b| b.starticks as f64));
    let energy = sorted(cleared().map(|b| f64::from(b.energy)));
    if times.is_empty() {
        return;
    }
    println!(
        "battle {label}: {} fought, {:.0}% cleared | starticks to clear: mean {:.1}, median {:.0}, p90 {:.0}, max {:.0} | energy to clear: mean {:.0}, median {:.0}, p90 {:.0}",
        battles.len(),
        100.0 * times.len() as f64 / battles.len() as f64,
        average(&times),
        percentile(&times, 0.5),
        percentile(&times, 0.9),
        times[times.len() - 1],
        average(&energy),
        percentile(&energy, 0.5),
        percentile(&energy, 0.9)
    );
}

/// Starticks and energy a battle takes, by enemy count and over all battles.
pub fn print_battles(n: u32) {
    let battles = battles(n);
    let most = battles.iter().map(|b| b.enemies).max().unwrap_or(0);
    for enemies in 1..=most {
        let group: Vec<&Battle> = battles.iter().filter(|b| b.enemies == enemies).collect();
        print_battle_row(&format!("{enemies} enemies"), &group);
    }
    print_battle_row("all", &battles.iter().collect::<Vec<_>>());
}
