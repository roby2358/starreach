//! Model generation, combat, battle-length and warp-time numbers cited as Evidence in docs/RATIONALE.md.
//!
//! Usage: `just cc-model-balance <galaxies>`. Galaxies come from seeds 0..galaxies, through the
//! same generation a new game uses. Modeled only: these are formula and sampling results, not
//! play measurements.

use starreach_core::actions::{blast_energy, blast_kill_chance, blast_time, warp_time};
use starreach_core::constants::{BLAST_SURE_RANGE, ENEMY_FIRE_VARIANCE_MAX, ENEMY_FIRE_VARIANCE_MIN};
use starreach_core::events::fire_damage;
use starreach_core::galaxy::{Galaxy, SectorRecord};
use starreach_core::game::{EnemySight, Ship};
use starreach_core::geometry::{in_bounds, Yx};
use starreach_core::rng::Rng;
use starreach_core::{apply, new_game, Command, Game, Status};

const RANGES: [f64; 10] = [1.0, std::f64::consts::SQRT_2, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0];

struct GalaxyCounts {
    enemies: u32,
    starbases: u32,
    enemy_free_sectors: u32,
}

fn count(galaxy: &Galaxy) -> GalaxyCounts {
    let records: Vec<&SectorRecord> = galaxy.sectors.iter().flatten().collect();
    GalaxyCounts {
        enemies: records.iter().map(|r| r.enemies).sum(),
        starbases: records.iter().map(|r| r.starbases).sum(),
        enemy_free_sectors: records.iter().filter(|r| r.enemies == 0).count() as u32,
    }
}

fn mean(values: impl Iterator<Item = u32>, n: u32) -> f64 {
    values.map(f64::from).sum::<f64>() / f64::from(n)
}

fn print_generation(n: u32) {
    let counts: Vec<GalaxyCounts> = (0..n).map(|seed| count(&Galaxy::generate(&mut Rng::seeded(seed)))).collect();
    let enemies = || counts.iter().map(|c| c.enemies);
    let starbases = || counts.iter().map(|c| c.starbases);
    println!("galaxies: {n}");
    println!(
        "enemies/galaxy mean {:.0} range {}-{}",
        mean(enemies(), n),
        enemies().min().unwrap(),
        enemies().max().unwrap()
    );
    println!(
        "starbases/galaxy (with Star Central) mean {:.2} range {}-{}",
        mean(starbases(), n),
        starbases().min().unwrap(),
        starbases().max().unwrap()
    );
    println!("enemy-free sectors mean {:.0}", mean(counts.iter().map(|c| c.enemy_free_sectors), n));
}

/// Per range: enemy fire at the band's low end, middle and high end; the blast's cost, time
/// and kill chance, and its expected energy per kill (cost / chance, since a miss still pays).
fn print_combat() {
    for range in RANGES {
        let chance = blast_kill_chance(range);
        println!(
            "range {range:4.2}: enemy fire {:4}-{:4}-{:4} dmg | blast {} energy, time {}, kill {:.0}%, {:.0} energy/kill",
            fire_damage(range, ENEMY_FIRE_VARIANCE_MIN),
            fire_damage(range, 1.0),
            fire_damage(range, ENEMY_FIRE_VARIANCE_MAX),
            blast_energy(range),
            blast_time(range),
            chance * 100.0,
            f64::from(blast_energy(range)) / chance
        );
    }
}

/// A battle stops after this many commands, so a policy that can't finish can't hang the run.
const BATTLE_COMMAND_CAP: u32 = 200;
const NEIGHBOURS: [Yx; 8] = [(-1, 0), (-1, 1), (0, 1), (1, 1), (1, 0), (1, -1), (0, -1), (-1, -1)];

struct Battle {
    enemies: u32,
    stardates: f64,
    cleared: bool,
}

/// The nearest enemy the ship has a clear shot at.
fn nearest_clear(enemies: &[EnemySight]) -> Option<&EnemySight> {
    enemies.iter().filter(|e| e.clear_shot).min_by(|a, b| a.range.total_cmp(&b.range))
}

/// The battle policy's shot: a blast inside its sure range, a torpedo beyond it while any
/// remain, else a blast.
fn shot(target: &EnemySight, torpedoes: i32) -> Command {
    let (y, x) = target.yx;
    match target.range > BLAST_SURE_RANGE && torpedoes > 0 {
        true => Command::Torpedo { y, x },
        false => Command::Blast { y, x },
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
        Some(target) => Some(apply(game, &shot(target, state.ship_quantorpedoes)).game),
        None => sidestep(game),
    }
}

/// A full-strength ship arrives in `sector_yx` and fights until the sector is clear, the ship
/// is lost, or the policy is stuck. Arrival is by `enter_sector`, so there is no ambush.
fn fight(seed: u32, sector_yx: Yx) -> Battle {
    let mut game = new_game(seed);
    game.ship = Ship::full();
    game.enter_sector(sector_yx);
    let enemies = game.sector.enemies_yx.len() as u32;
    let arrived = game.stardate;
    for _ in 0..BATTLE_COMMAND_CAP {
        if game.status != Status::Playing || !game.sector.has_enemies() {
            break;
        }
        match battle_step(&game) {
            Some(next) => game = next,
            None => break,
        }
    }
    Battle { enemies, stardates: game.stardate - arrived, cleared: !game.sector.has_enemies() }
}

/// Every sector with enemies in galaxies 0..n, each fought once by a fresh ship.
fn battles(n: u32) -> Vec<Battle> {
    let mut battles = Vec::new();
    for seed in 0..n {
        let galaxy = new_game(seed).galaxy;
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

fn percentile(sorted: &[f64], fraction: f64) -> f64 {
    sorted[((sorted.len() - 1) as f64 * fraction).round() as usize]
}

fn print_battle_row(label: &str, battles: &[&Battle]) {
    let mut times: Vec<f64> = battles.iter().filter(|b| b.cleared).map(|b| b.stardates).collect();
    if times.is_empty() {
        return;
    }
    times.sort_by(f64::total_cmp);
    println!(
        "battle {label}: {} fought, {:.0}% cleared | stardates to clear: mean {:.1}, median {:.0}, p90 {:.0}, max {:.0}",
        battles.len(),
        100.0 * times.len() as f64 / battles.len() as f64,
        times.iter().sum::<f64>() / times.len() as f64,
        percentile(&times, 0.5),
        percentile(&times, 0.9),
        times[times.len() - 1]
    );
}

/// Stardates a battle takes, by enemy count and over all battles, beside what a warp takes.
fn print_battles(n: u32) {
    let battles = battles(n);
    let most = battles.iter().map(|b| b.enemies).max().unwrap_or(0);
    for enemies in 1..=most {
        let group: Vec<&Battle> = battles.iter().filter(|b| b.enemies == enemies).collect();
        print_battle_row(&format!("{enemies} enemies"), &group);
    }
    print_battle_row("all", &battles.iter().collect::<Vec<_>>());
    println!(
        "warp time: adjacent {:.2}, diagonal {:.2}, 5 sectors {:.2}, corner to corner {:.2}",
        warp_time((0, 0), (0, 1)),
        warp_time((0, 0), (1, 1)),
        warp_time((0, 0), (0, 5)),
        warp_time((0, 0), (9, 9))
    );
}

fn main() {
    let arg = std::env::args().nth(1).expect("usage: model_balance <galaxies>");
    let n: u32 = arg.parse().expect("galaxies must be a positive integer");
    print_generation(n);
    print_combat();
    print_battles(n);
}
