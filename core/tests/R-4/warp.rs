//! R-4: galaxy warp.
use crate::helpers::*;
use starreach_core::actions::{warp_cost, warp_time};
use starreach_core::constants::*;
use starreach_core::geometry::{all_cells, euclid, Xy};
use starreach_core::Status;

#[test]
fn the_current_sector_is_refused() {
    let game = board(EMPTY_WITH_SHIP_AT_00);
    assert_refused(&game, warp(TEST_SECTOR.x, TEST_SECTOR.y));
}

#[test]
fn energy_below_the_cost_is_refused() {
    let mut game = board(EMPTY_WITH_SHIP_AT_00);
    game.ship.energy = warp_cost(TEST_SECTOR, xy(6, 4)) - 1;
    assert_refused(&game, warp(6, 4));
}

#[test]
fn a_warp_moves_pays_and_restarts_the_event_clock() {
    let game = board(EMPTY_WITH_SHIP_AT_00);
    let applied = run(&game, warp(6, 4));
    let next = &applied.game;
    let time = (WARP_TIME_K * (euclid(TEST_SECTOR, xy(6, 4)) + 1.0).ln()).round() as i64;
    assert!(applied.result.ok);
    assert_eq!(next.sector_xy, xy(6, 4));
    assert!(next.galaxy.record(xy(6, 4)).visible);
    assert_eq!(next.startick, game.startick + time);
    assert_eq!(next.ship.energy, game.ship.energy - time as i32 * WARP_ENERGY_PER_TICK);
    assert_eq!(next.last_event_startick, next.startick);
    assert_eq!(next.sector.enemies_xy.len() as u32, next.galaxy.record(xy(6, 4)).enemies);
}

/// Starticks to clear a sector of 7 enemies in 9 of 10 battles, as `just cc-model-balance`
/// measures it (D-5). The shortest warp must take longer.
const LONG_BATTLE_STARTICKS: i64 = 16;

#[test]
fn the_shortest_warp_outlasts_a_long_battle() {
    assert!(warp_time(xy(5, 5), xy(6, 5)) > LONG_BATTLE_STARTICKS);
}

/// Every warp from a corner, which covers every distance on the map, nearest first.
fn warps_by_distance() -> Vec<Xy> {
    let mut targets: Vec<Xy> = all_cells().filter(|&to| to != xy(0, 0)).collect();
    targets.sort_by(|&a, &b| euclid(xy(0, 0), a).total_cmp(&euclid(xy(0, 0), b)));
    targets
}

/// True when `value` never falls along `targets`, and rises wherever the distance does.
fn rises_with_distance(targets: &[Xy], value: impl Fn(Xy) -> i64) -> bool {
    targets.windows(2).all(|pair| {
        let farther = euclid(xy(0, 0), pair[1]) > euclid(xy(0, 0), pair[0]);
        match farther {
            true => value(pair[1]) > value(pair[0]),
            false => value(pair[1]) == value(pair[0]),
        }
    })
}

#[test]
fn a_longer_warp_takes_longer() {
    assert!(rises_with_distance(&warps_by_distance(), |to| warp_time(xy(0, 0), to)));
}

#[test]
fn a_longer_warp_costs_more() {
    assert!(rises_with_distance(&warps_by_distance(), |to| i64::from(warp_cost(xy(0, 0), to))));
}

#[test]
fn enemies_act_before_the_warp_and_can_destroy_the_ship() {
    let mut game = board([
        "EEE.......", "ESE.......", "EEE.......", "..........", "..........",
        "..........", "..........", "..........", "..........", "..........",
    ]);
    game.ship.hull = 1;
    game.ship.shields = 0;
    let applied = run(&game, warp(6, 4));
    assert!(applied.result.ok);
    assert_eq!(applied.game.ship.hull, 0);
    assert_eq!(applied.game.status, Status::Lost);
    assert_eq!(applied.game.sector_xy, game.sector_xy, "the warp must not happen");
    assert_eq!(applied.game.ship.energy, game.ship.energy);
}

/// A board with only the ship, next to a sector with no enemies to warp to.
const QUIET_TARGET: Xy = xy(6, 4);

fn beside_a_quiet_sector() -> starreach_core::game::Game {
    let mut game = board(EMPTY_WITH_SHIP_AT_00);
    game.galaxy.record_mut(QUIET_TARGET).enemies = 0;
    game
}

fn recharges(events: &[String]) -> Vec<&String> {
    events.iter().filter(|e| e.starts_with("Shields recharged")).collect()
}

#[test]
fn a_damaged_ship_arrives_with_full_shields_and_pays_for_them() {
    let cases = [
        // shield points missing -> energy for the recharge
        (SHIP_MAX_SHIELDS, SHIP_MAX_SHIELDS / SHIELD_POINTS_PER_ENERGY),
        (1000, 1000 / SHIELD_POINTS_PER_ENERGY),
        (1, 1),
    ];
    for (missing, cost) in cases {
        let mut game = beside_a_quiet_sector();
        game.ship.shields = SHIP_MAX_SHIELDS - missing;
        let applied = run(&game, warp(6, 4));
        assert_eq!(applied.game.ship.shields, SHIP_MAX_SHIELDS);
        assert_eq!(applied.game.ship.energy, game.ship.energy - warp_cost(TEST_SECTOR, xy(6, 4)) - cost);
        assert_eq!(report(&applied)["energy_cost"], warp_cost(TEST_SECTOR, xy(6, 4)));
        assert_eq!(recharges(&applied.result.events), [&format!("Shields recharged by {missing} using {cost} energy")]);
    }
}

#[test]
fn full_shields_cost_nothing_and_say_nothing() {
    let game = beside_a_quiet_sector();
    let applied = run(&game, warp(6, 4));
    assert_eq!(applied.game.ship.energy, game.ship.energy - warp_cost(TEST_SECTOR, xy(6, 4)));
    assert!(recharges(&applied.result.events).is_empty());
}

#[test]
fn too_little_energy_recharges_as_far_as_it_goes() {
    let cases = [
        // energy left after the warp -> shield points recharged
        (7, 7 * SHIELD_POINTS_PER_ENERGY),
        (0, 0),
    ];
    for (left, points) in cases {
        let mut game = beside_a_quiet_sector();
        game.ship.shields = 0;
        game.ship.energy = warp_cost(TEST_SECTOR, xy(6, 4)) + left;
        let applied = run(&game, warp(6, 4));
        assert!(applied.result.ok, "the warp's own cost is all it needs");
        assert_eq!(applied.game.sector_xy, xy(6, 4));
        assert_eq!(applied.game.ship.shields, points);
        assert_eq!(applied.game.ship.energy, 0);
        assert_eq!(recharges(&applied.result.events).len(), usize::from(points > 0));
    }
}

#[test]
fn a_warp_does_not_repair_the_hull() {
    let mut game = beside_a_quiet_sector();
    game.ship.hull = 700;
    game.ship.shields = 0;
    let applied = run(&game, warp(6, 4));
    assert_eq!(applied.game.ship.hull, 700);
}

#[test]
fn the_ship_meets_the_arrival_ambush_with_recharged_shields_and_no_other_enemy_turn() {
    for seed in 0..200 {
        let mut game = board(EMPTY_WITH_SHIP_AT_00);
        game.galaxy.record_mut(xy(6, 4)).enemies = 3;
        game.rng = starreach_core::rng::Rng::seeded(seed);
        game.ship.shields = 0;
        let applied = run(&game, warp(6, 4));
        let events = &applied.result.events;
        let first_fire = events.iter().position(|e| e.contains("fires raxxon beam"));
        let recharge = events.iter().position(|e| e.starts_with("Shields recharged")).unwrap();
        assert!(first_fire.is_none_or(|fire| recharge < fire), "the recharge comes before the ambush");
        let fires = events.iter().filter(|e| e.contains("fires raxxon beam")).count();
        assert!(fires <= 3, "each enemy fires at most once, for all the journey's length");
        assert!(!events.iter().any(|e| e.contains("advance")), "no enemy moves during the journey");
        let taken: i32 = events
            .iter()
            .filter_map(|e| e.strip_prefix("Ship takes ")?.strip_suffix(" damage")?.parse::<i32>().ok())
            .sum();
        assert_eq!(applied.game.ship.shields + applied.game.ship.hull, SHIP_MAX_SHIELDS + SHIP_MAX_HULL - taken);
        assert_eq!(applied.game.last_event_startick, applied.game.startick);
    }
}
