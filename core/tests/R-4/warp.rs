//! R-4: galaxy warp.
use crate::helpers::*;
use starreach_core::actions::{warp_cost, warp_time};
use starreach_core::constants::*;
use starreach_core::geometry::{all_cells, euclid, Yx};
use starreach_core::Status;

#[test]
fn the_current_sector_is_refused() {
    let game = board(EMPTY_WITH_SHIP_AT_00);
    assert_refused(&game, warp(TEST_SECTOR.0, TEST_SECTOR.1));
}

#[test]
fn energy_below_the_cost_is_refused() {
    let mut game = board(EMPTY_WITH_SHIP_AT_00);
    game.ship.energy = warp_cost(TEST_SECTOR, (4, 6)) - 1;
    assert_refused(&game, warp(4, 6));
}

#[test]
fn a_warp_moves_pays_and_restarts_the_event_clock() {
    let game = board(EMPTY_WITH_SHIP_AT_00);
    let applied = run(&game, warp(4, 6));
    let next = &applied.game;
    let time = (WARP_TIME_K * (euclid(TEST_SECTOR, (4, 6)) + 1.0).ln()).round() as i64;
    assert!(applied.result.ok);
    assert_eq!(next.sector_yx, (4, 6));
    assert!(next.galaxy.record((4, 6)).visible);
    assert_eq!(next.startick, game.startick + time);
    assert_eq!(next.ship.energy, game.ship.energy - time as i32 * WARP_ENERGY_PER_TICK);
    assert_eq!(next.last_event_startick, next.startick);
    assert_eq!(next.sector.enemies_yx.len() as u32, next.galaxy.record((4, 6)).enemies);
}

/// Starticks to clear a sector of 7 enemies in 9 of 10 battles, as `just cc-model-balance`
/// measures it (D-5). The shortest warp must take longer.
const LONG_BATTLE_STARTICKS: i64 = 16;

#[test]
fn the_shortest_warp_outlasts_a_long_battle() {
    assert!(warp_time((5, 5), (5, 6)) > LONG_BATTLE_STARTICKS);
}

/// Every warp from a corner, which covers every distance on the map, nearest first.
fn warps_by_distance() -> Vec<Yx> {
    let mut targets: Vec<Yx> = all_cells().filter(|&yx| yx != (0, 0)).collect();
    targets.sort_by(|&a, &b| euclid((0, 0), a).total_cmp(&euclid((0, 0), b)));
    targets
}

/// True when `value` never falls along `targets`, and rises wherever the distance does.
fn rises_with_distance(targets: &[Yx], value: impl Fn(Yx) -> i64) -> bool {
    targets.windows(2).all(|pair| {
        let farther = euclid((0, 0), pair[1]) > euclid((0, 0), pair[0]);
        match farther {
            true => value(pair[1]) > value(pair[0]),
            false => value(pair[1]) == value(pair[0]),
        }
    })
}

#[test]
fn a_longer_warp_takes_longer() {
    assert!(rises_with_distance(&warps_by_distance(), |yx| warp_time((0, 0), yx)));
}

#[test]
fn a_longer_warp_costs_more() {
    assert!(rises_with_distance(&warps_by_distance(), |yx| i64::from(warp_cost((0, 0), yx))));
}

#[test]
fn enemies_act_before_the_warp_and_can_destroy_the_ship() {
    let mut game = board([
        "EEE.......", "ESE.......", "EEE.......", "..........", "..........",
        "..........", "..........", "..........", "..........", "..........",
    ]);
    game.ship.hull = 1;
    game.ship.shields = 0;
    let applied = run(&game, warp(4, 6));
    assert!(applied.result.ok);
    assert_eq!(applied.game.ship.hull, 0);
    assert_eq!(applied.game.status, Status::Lost);
    assert_eq!(applied.game.sector_yx, game.sector_yx, "the warp must not happen");
    assert_eq!(applied.game.ship.energy, game.ship.energy);
}
