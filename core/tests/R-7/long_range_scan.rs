//! R-7: long-range scan.
use crate::helpers::*;
use starreach_core::constants::*;
use starreach_core::game::format_duration;
use starreach_core::Command;

#[test]
fn energy_below_the_cost_is_refused() {
    let mut game = board(EMPTY_WITH_SHIP_AT_00);
    game.ship.energy = LRS_ENERGY - 1;
    assert_refused(&game, Command::LongRangeScan);
}

#[test]
fn reveals_the_block_and_pays_energy() {
    let game = board(EMPTY_WITH_SHIP_AT_00);
    let applied = run(&game, Command::LongRangeScan);
    let next = &applied.game;
    assert_eq!(next.ship.energy, game.ship.energy - LRS_ENERGY);
    for dy in -1..=1 {
        for dx in -1..=1 {
            assert!(next.galaxy.record(TEST_SECTOR.offset(dx, dy)).visible);
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
    game.sector_xy = xy(0, 0);
    let scan = report(&run(&game, Command::LongRangeScan))["scan"].clone();
    assert_eq!(scan[0], "..... ..... .....");
    assert!(scan[1].as_str().unwrap().starts_with("..... "));
}

#[test]
fn takes_lrs_time_and_reports_it() {
    let game = board(EMPTY_WITH_SHIP_AT_00);
    let applied = run(&game, Command::LongRangeScan);
    assert_eq!(applied.game.startick, game.startick + LRS_TIME);
    assert_eq!(report(&applied)["time"], format_duration(LRS_TIME));
}

#[test]
fn an_enemy_present_acts_after_the_scan() {
    let mut game = board([
        "S.........", "..........", "..........", "..........", "..........",
        "..........", "..........", "..........", "..........", ".........E",
    ]);
    game.ship.shields = SHIP_MAX_SHIELDS;
    let applied = run(&game, Command::LongRangeScan);
    assert_eq!(applied.result.events.iter().filter(|e| e.starts_with("Enemy")).count(), 1);
}

#[test]
fn a_cleared_sector_advances_the_stardate_with_no_enemy_events() {
    let mut game = board(EMPTY_WITH_SHIP_AT_00);
    game.ship.shields = SHIP_MAX_SHIELDS;
    let applied = run(&game, Command::LongRangeScan);
    assert_eq!(applied.game.startick, game.startick + LRS_TIME);
    assert!(applied.result.events.is_empty());
}
