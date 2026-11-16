//! Model generation, combat, battle-length, warp and energy-reach numbers cited as Evidence in
//! docs/RATIONALE.md.
//!
//! Usage: `just cc-model-balance <galaxies>`. Galaxies come from seeds 0..galaxies, through the
//! same generation a new game uses. Modeled only: these are formula and sampling results, not
//! play measurements.

use starreach_core::actions::{blast_energy, blast_kill_chance, blast_time, warp_cost, warp_time};
use starreach_core::constants::{
    BLAST_SURE_RANGE, ENEMY_FIRE_VARIANCE_MAX, ENEMY_FIRE_VARIANCE_MIN, GALAXY_CENTER, SHIP_MAX_ENERGY,
    STARTICKS_PER_STARDATE,
};
use starreach_core::events::fire_damage;
use starreach_core::galaxy::{Galaxy, SectorRecord};
use starreach_core::game::{EnemySight, Ship};
use starreach_core::geometry::{all_cells, in_bounds, Yx};
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
/// When the modeled games start. No modeled number depends on it.
const START_UNIX_SECONDS: i64 = 0;
const NEIGHBOURS: [Yx; 8] = [(-1, 0), (-1, 1), (0, 1), (1, 1), (1, 0), (1, -1), (0, -1), (-1, -1)];

struct Battle {
    enemies: u32,
    starticks: i64,
    energy: i32,
    cleared: bool,
}

/// The nearest enemy the ship has a clear shot at.
fn nearest_clear(enemies: &[EnemySight]) -> Option<&EnemySight> {
    enemies.iter().filter(|e| e.clear_shot).min_by(|a, b| a.range.total_cmp(&b.range))
}

/// The battle policy against the enemy it has a clear shot at: a blast inside its sure range;
/// beyond it a torpedo while any remain, else a subwarp toward the enemy to close the range.
fn engage(target: &EnemySight, torpedoes: i32) -> Command {
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
fn fight_on(mut game: Game) -> Game {
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

fn percentile(sorted: &[f64], fraction: f64) -> f64 {
    sorted[((sorted.len() - 1) as f64 * fraction).round() as usize]
}

fn sorted(values: impl Iterator<Item = f64>) -> Vec<f64> {
    let mut values: Vec<f64> = values.collect();
    values.sort_by(f64::total_cmp);
    values
}

fn average(values: &[f64]) -> f64 {
    values.iter().sum::<f64>() / values.len() as f64
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
fn print_battles(n: u32) {
    let battles = battles(n);
    let most = battles.iter().map(|b| b.enemies).max().unwrap_or(0);
    for enemies in 1..=most {
        let group: Vec<&Battle> = battles.iter().filter(|b| b.enemies == enemies).collect();
        print_battle_row(&format!("{enemies} enemies"), &group);
    }
    print_battle_row("all", &battles.iter().collect::<Vec<_>>());
}

/// What a warp takes and costs, to set beside a battle.
fn print_warps() {
    let warps = [("next sector", (0, 1)), ("diagonal", (1, 1)), ("5 sectors", (0, 5)), ("corner to corner", (9, 9))];
    for (label, to) in warps {
        let time = warp_time((0, 0), to);
        println!(
            "warp {label}: {time} starticks ({:.2} stardates), {} energy",
            time as f64 / STARTICKS_PER_STARDATE as f64,
            warp_cost((0, 0), to)
        );
    }
    println!(
        "a full tank ({SHIP_MAX_ENERGY}) is {} next-sector warps or {} corner-to-corner warps, with nothing else spent",
        SHIP_MAX_ENERGY / warp_cost((0, 0), (0, 1)),
        SHIP_MAX_ENERGY / warp_cost((0, 0), (9, 9))
    );
}

/// The cheapest warp from `from` to one of `starbases`, leaving out `from` itself.
fn cost_to_nearest(from: Yx, starbases: &[Yx]) -> Option<i32> {
    starbases.iter().filter(|&&yx| yx != from).map(|&yx| warp_cost(from, yx)).min()
}

fn print_reach_row(label: &str, costs: &[f64]) {
    println!(
        "warp energy to {label}: mean {:.0}, median {:.0}, p90 {:.0}, max {:.0} ({:.0}% of a full tank)",
        average(costs),
        percentile(costs, 0.5),
        percentile(costs, 0.9),
        costs[costs.len() - 1],
        100.0 * costs[costs.len() - 1] / f64::from(SHIP_MAX_ENERGY)
    );
}

/// From every sector without a starbase, the warp energy to the nearest starbase: to any of
/// the galaxy's, and to Star Central alone, the one a new captain knows.
fn print_starbase_reach(n: u32) {
    let mut nearest = Vec::new();
    for seed in 0..n {
        let starbases = new_game(seed, START_UNIX_SECONDS).galaxy.starbase_sectors();
        let open = all_cells().filter(|yx| !starbases.contains(yx));
        nearest.extend(open.filter_map(|yx| cost_to_nearest(yx, &starbases)).map(f64::from));
    }
    let home = all_cells().filter_map(|yx| cost_to_nearest(yx, &[GALAXY_CENTER])).map(f64::from);
    print_reach_row("the nearest starbase", &sorted(nearest.into_iter()));
    print_reach_row("Star Central", &sorted(home));
}

/// Energy a careful captain keeps for the battle in the next sector: what clearing a sector
/// takes in 9 of 10 battles, from the "battle all" row.
const BATTLE_RESERVE: i32 = 6000;

/// How a ship's single tank of energy ends.
#[derive(Clone, Copy, PartialEq)]
enum TankEnd {
    Stranded,
    Destroyed,
    Won,
    /// The captain declined the next warp.
    Halted,
    /// The battle policy could not finish a sector.
    Stuck,
}

const TANK_ENDS: [(TankEnd, &str); 5] = [
    (TankEnd::Stranded, "stranded"),
    (TankEnd::Destroyed, "destroyed"),
    (TankEnd::Halted, "halted by the captain"),
    (TankEnd::Won, "galaxy cleared"),
    (TankEnd::Stuck, "battle script stuck"),
];

struct Tank {
    cleared: u32,
    end: TankEnd,
}

/// Decides whether the ship warps on to `target`, the next sector with enemies.
type Captain = fn(&Game, Yx) -> bool;

/// Warps on whenever the warp itself is affordable.
fn presses_on(game: &Game, target: Yx) -> bool {
    game.ship.energy >= warp_cost(game.sector_yx, target)
}

/// Warps on only if, on arrival, the ship still holds `BATTLE_RESERVE` and the warp from there
/// to the nearest starbase it knows.
fn keeps_a_way_home(game: &Game, target: Yx) -> bool {
    let known: Vec<Yx> = game.galaxy.visible_starbases().collect();
    let Some(home) = cost_to_nearest(target, &known) else {
        return false;
    };
    game.ship.energy >= warp_cost(game.sector_yx, target) + BATTLE_RESERVE + home
}

/// The cheapest sector to warp to that still has enemies. The script reads the galaxy's
/// records, so it knows what a captain would have to scan for.
fn nearest_enemy_sector(game: &Game) -> Option<Yx> {
    all_cells()
        .filter(|&yx| yx != game.sector_yx && game.galaxy.record(yx).enemies > 0)
        .min_by_key(|&yx| warp_time(game.sector_yx, yx))
}

fn lost_how(game: &Game) -> TankEnd {
    match game.ship.hull == 0 {
        true => TankEnd::Destroyed,
        false => TankEnd::Stranded,
    }
}

/// A new game's ship goes from one enemy sector to the nearest next, clearing each, and never
/// docks or scans: how far one tank of energy goes. Arrival is by a real warp, ambush included.
fn one_tank(seed: u32, captain: Captain) -> Tank {
    let mut game = new_game(seed, START_UNIX_SECONDS);
    let mut cleared = 0;
    loop {
        let Some((y, x)) = nearest_enemy_sector(&game) else {
            return Tank { cleared, end: TankEnd::Won };
        };
        if !captain(&game, (y, x)) {
            return Tank { cleared, end: TankEnd::Halted };
        }
        game = fight_on(apply(&game, &Command::GalaxyWarp { y, x }).game);
        if game.status == Status::Lost {
            return Tank { cleared, end: lost_how(&game) };
        }
        if game.sector.has_enemies() {
            return Tank { cleared, end: TankEnd::Stuck };
        }
        cleared += 1;
    }
}

fn print_tanks(label: &str, n: u32, captain: Captain) {
    let tanks: Vec<Tank> = (0..n).map(|seed| one_tank(seed, captain)).collect();
    let cleared = sorted(tanks.iter().map(|t| f64::from(t.cleared)));
    let ends: Vec<String> = TANK_ENDS
        .iter()
        .map(|&(end, name)| (name, tanks.iter().filter(|t| t.end == end).count()))
        .filter(|&(_, count)| count > 0)
        .map(|(name, count)| format!("{name} {:.1}%", 100.0 * count as f64 / f64::from(n)))
        .collect();
    println!(
        "one tank, captain {label}: enemy sectors cleared mean {:.1}, p10 {:.0}, median {:.0}, p90 {:.0}, max {:.0} | ends: {}",
        average(&cleared),
        percentile(&cleared, 0.1),
        percentile(&cleared, 0.5),
        percentile(&cleared, 0.9),
        cleared[cleared.len() - 1],
        ends.join(", ")
    );
}

fn main() {
    let arg = std::env::args().nth(1).expect("usage: model_balance <galaxies>");
    let n: u32 = arg.parse().expect("galaxies must be a positive integer");
    print_generation(n);
    print_combat();
    print_battles(n);
    print_warps();
    print_starbase_reach(n);
    print_tanks("who presses on", n, presses_on);
    print_tanks("who keeps a way home", n, keeps_a_way_home);
}
