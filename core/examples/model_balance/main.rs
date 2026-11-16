//! Modeled numbers cited as Evidence in docs/RATIONALE.md, in two runs.
//!
//! `just cc-model-balance <galaxies>`: generation, combat, battle-length, warp and energy-reach
//! numbers. `just cc-model-games <games>`: whole games played by a scripted captain, with each
//! counter per game and the counter table's `scale` and `goal_ceiling` they give.
//!
//! Galaxies and games come from seeds 0..n, through the same generation a new game uses.
//! Modeled only: these are formula and sampling results, not play measurements.

mod battle;
mod captain;
mod games;
mod stats;
mod tank;

use starreach_core::actions::{blast_energy, blast_kill_chance, blast_time, warp_cost, warp_time};
use starreach_core::constants::{
    ENEMY_FIRE_VARIANCE_MAX, ENEMY_FIRE_VARIANCE_MIN, GALAXY_CENTER, SHIP_MAX_ENERGY, STARTICKS_PER_STARDATE,
};
use starreach_core::events::fire_damage;
use starreach_core::galaxy::{Galaxy, SectorRecord};
use starreach_core::geometry::all_cells;
use starreach_core::new_game;
use starreach_core::rng::Rng;

use battle::{print_battles, START_UNIX_SECONDS};
use captain::{cost_to_nearest, keeps_a_way_home, presses_on};
use games::print_games;
use stats::{average, percentile, sorted};
use tank::print_tanks;

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

fn print_balance(n: u32) {
    print_generation(n);
    print_combat();
    print_battles(n);
    print_warps();
    print_starbase_reach(n);
    print_tanks("who presses on", n, presses_on);
    print_tanks("who keeps a way home", n, keeps_a_way_home);
}

/// The runs, by the name given as the first argument.
const RUNS: [(&str, fn(u32)); 2] = [("balance", print_balance), ("games", print_games)];

const USAGE: &str = "usage: model_balance balance <galaxies> | model_balance games <games>";

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let [name, count] = args.as_slice() else {
        panic!("{USAGE}");
    };
    let (_, run) = RUNS.iter().find(|(run_name, _)| run_name == name).expect(USAGE);
    run(count.parse().expect("the count must be a positive integer"));
}
