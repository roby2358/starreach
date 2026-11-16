//! R-26: a stranded ship in a sector with a starbase gets emergency energy instead of losing.
use crate::helpers::*;
use starreach_core::constants::*;
use starreach_core::geometry::all_cells;
use starreach_core::{Command, Status};

#[test]
fn a_starbase_tops_up_a_stranded_ship() {
    let mut game = board([
        "S.........", ".B........", "..........", "..........", "..........",
        "..........", "..........", "..........", "..........", "..........",
    ]);
    for xy in all_cells().filter(|&xy| xy != game.sector_xy) {
        game.galaxy.record_mut(xy).starbases = 0;
    }
    game.ship.energy = LRS_ENERGY + 100;
    let applied = run(&game, Command::LongRangeScan);
    assert_eq!(applied.game.status, Status::Playing);
    assert_eq!(applied.game.ship.energy, STARBASE_EMERGENCY_ENERGY);
    let message = format!("Starbase transfers emergency energy: {}", STARBASE_EMERGENCY_ENERGY - 100);
    assert!(applied.result.events.contains(&message));
}
