//! Model generation and combat numbers cited as Evidence in docs/RATIONALE.md.
//!
//! Usage: `just cc-model-balance <galaxies>`. Galaxies come from seeds 0..galaxies, through the
//! same generation a new game uses. Modeled only: these are formula and sampling results, not
//! play measurements.

use starreach_core::actions::{blast_energy, blast_time};
use starreach_core::events::fire_damage;
use starreach_core::galaxy::{Galaxy, SectorRecord};
use starreach_core::rng::Rng;

const RANGES: [f64; 7] = [1.0, std::f64::consts::SQRT_2, 2.0, 3.0, 4.0, 5.0, 6.0];

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
    let central_only = counts.iter().filter(|c| c.starbases == 1).count() as f64 / f64::from(n);
    println!("galaxies: {n}");
    println!(
        "enemies/galaxy mean {:.0} range {}-{}",
        mean(enemies(), n),
        enemies().min().unwrap(),
        enemies().max().unwrap()
    );
    println!(
        "starbases/galaxy mean {:.2}; P(Star Central only) {:.0}%",
        mean(counts.iter().map(|c| c.starbases), n),
        central_only * 100.0
    );
    println!("enemy-free sectors mean {:.0}", mean(counts.iter().map(|c| c.enemy_free_sectors), n));
}

fn print_combat() {
    for range in RANGES {
        println!(
            "range {range:4.2}: enemy fire {:5} dmg | blast {} energy, time {}",
            fire_damage(range),
            blast_energy(range),
            blast_time(range)
        );
    }
}

fn main() {
    let arg = std::env::args().nth(1).expect("usage: model_balance <galaxies>");
    let n: u32 = arg.parse().expect("galaxies must be a positive integer");
    print_generation(n);
    print_combat();
}
