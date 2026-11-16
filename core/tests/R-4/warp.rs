//! R-4: galaxy warp.
use crate::helpers::*;
use starreach_core::actions::{warp_cost, warp_time};
use starreach_core::constants::*;
use starreach_core::geometry::euclid;
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
    let distance = (euclid(TEST_SECTOR, (4, 6)) * WARP_DISTANCE_SCALE) as i32;
    assert!(applied.result.ok);
    assert_eq!(next.sector_yx, (4, 6));
    assert!(next.galaxy.record((4, 6)).visible);
    assert_eq!(next.ship.energy, game.ship.energy - distance * WARP_ENERGY_PER_DISTANCE);
    assert_eq!(next.stardate, game.stardate + distance as f64 * WARP_TIME_PER_DISTANCE);
    assert_eq!(next.last_event_stardate, next.stardate);
    assert_eq!(next.sector.enemies_yx.len() as u32, next.galaxy.record((4, 6)).enemies);
}

/// Stardates to clear the largest sectors in 9 of 10 battles, as `just cc-model-balance`
/// measures it (D-5). The shortest warp must take longer.
const LONG_BATTLE_STARDATES: f64 = 19.0;

#[test]
fn the_shortest_warp_outlasts_a_long_battle() {
    assert!(warp_time((5, 5), (5, 6)) > LONG_BATTLE_STARDATES);
}

#[test]
fn a_longer_warp_takes_longer() {
    let times: Vec<f64> = (1..10).map(|x| warp_time((0, 0), (0, x))).collect();
    assert!(times.windows(2).all(|pair| pair[0] < pair[1]));
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
