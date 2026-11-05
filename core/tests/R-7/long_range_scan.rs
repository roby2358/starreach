//! R-7: long-range scan.
use crate::helpers::*;
use starreach_core::constants::*;
use starreach_core::Command;

#[test]
fn energy_below_the_cost_is_refused() {
    let mut game = board(EMPTY_WITH_SHIP_AT_00);
    game.ship.energy = LRS_ENERGY - 1;
    assert_refused(&game, Command::LongRangeScan);
}

#[test]
fn reveals_the_block_and_pays_without_taking_time() {
    let game = board(EMPTY_WITH_SHIP_AT_00);
    let applied = run(&game, Command::LongRangeScan);
    let next = &applied.game;
    assert_eq!(next.ship.energy, game.ship.energy - LRS_ENERGY);
    assert_eq!(next.stardate, game.stardate);
    for dy in -1..=1 {
        for dx in -1..=1 {
            assert!(next.galaxy.record((TEST_SECTOR.0 + dy, TEST_SECTOR.1 + dx)).visible);
        }
    }
    let scan = report(&applied)["scan"].clone();
    let middle = next.galaxy.record(TEST_SECTOR);
    let expected = format!("{}|{}|{}", middle.enemies, middle.starbases, middle.stars);
    assert_eq!(scan[1].as_str().unwrap().split(' ').nth(1).unwrap(), expected);
}

#[test]
fn sectors_off_the_galaxy_show_dots() {
    let mut game = board(EMPTY_WITH_SHIP_AT_00);
    game.sector_yx = (0, 0);
    let scan = report(&run(&game, Command::LongRangeScan))["scan"].clone();
    assert_eq!(scan[0], "..... ..... .....");
    assert!(scan[1].as_str().unwrap().starts_with("..... "));
}
