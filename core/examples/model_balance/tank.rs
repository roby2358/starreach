//! One tank of energy: how far a ship goes from a new game without docking or scanning.

use starreach_core::actions::warp_time;
use starreach_core::geometry::{all_cells, Xy};
use starreach_core::{apply, new_game, Command, Game, Status};

use crate::battle::{fight_on, START_UNIX_SECONDS};
use crate::stats::{average, percentile, sorted};

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
pub type Captain = fn(&Game, Xy) -> bool;


/// The cheapest sector to warp to that still has enemies. The script reads the galaxy's
/// records, so it knows what a captain would have to scan for.
fn nearest_enemy_sector(game: &Game) -> Option<Xy> {
    all_cells()
        .filter(|&xy| xy != game.sector_xy && game.galaxy.record(xy).enemies > 0)
        .min_by_key(|&xy| warp_time(game.sector_xy, xy))
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
        let Some(target) = nearest_enemy_sector(&game) else {
            return Tank { cleared, end: TankEnd::Won };
        };
        if !captain(&game, target) {
            return Tank { cleared, end: TankEnd::Halted };
        }
        game = fight_on(apply(&game, &Command::GalaxyWarp { x: target.x, y: target.y }).game);
        if game.status == Status::Lost {
            return Tank { cleared, end: lost_how(&game) };
        }
        if game.sector.has_enemies() {
            return Tank { cleared, end: TankEnd::Stuck };
        }
        cleared += 1;
    }
}

pub fn print_tanks(label: &str, n: u32, captain: Captain) {
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
