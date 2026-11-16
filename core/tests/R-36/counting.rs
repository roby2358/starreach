//! R-36: each counter rises by the right amount on its event, and no other counter moves.
//! Every test compares the whole `Counters`, so a counter that rose by mistake fails it.
use crate::helpers::*;
use starreach_core::actions::{blast_by, warp_cost};
use starreach_core::constants::*;
use starreach_core::events::{enemy_fire_by, fire_damage};
use starreach_core::geometry::{all_cells, Xy};
use starreach_core::{Command, Counters, Game};

const KILL: f64 = 0.0;
const MISS: f64 = 0.999;

/// Two enemies, each a clear shot from the ship: one at range 4 on row 0, one in column 0.
const TWO_ENEMIES: [&str; 10] = [
    "S...E.....", "..........", "..........", "..........", "E.........",
    "..........", "..........", "..........", "..........", "..........",
];

const ONE_ENEMY: [&str; 10] = [
    "S...E.....", "..........", "..........", "..........", "..........",
    "..........", "..........", "..........", "..........", "..........",
];

const TWO_AWAY: [&str; 10] = [
    "S.E.......", "..........", "..........", "..........", "..........",
    "..........", "..........", "..........", "..........", "..........",
];

const BASE_ADJACENT: [&str; 10] = [
    "S.........", ".B........", "..........", "..........", "..........",
    "..........", "..........", "..........", "..........", "..........",
];

/// A sector next to `TEST_SECTOR`, inside its long range scan.
const NEIGHBOUR: Xy = xy(2, 4);

fn zero() -> Counters {
    Counters::default()
}

fn blast_rolled(game: &Game, target: Xy, roll: f64) -> Game {
    let mut next = game.clone();
    blast_by(&mut next, target, roll, &mut Vec::new()).unwrap();
    next
}

/// An empty board whose galaxy has no starbase but Star Central's, and enemies only far away.
fn quiet_galaxy() -> Game {
    let mut game = board(EMPTY_WITH_SHIP_AT_00);
    for xy in all_cells().filter(|&xy| xy != GALAXY_CENTER) {
        game.galaxy.record_mut(xy).starbases = 0;
    }
    game.galaxy.record_mut(NEIGHBOUR).enemies = 0;
    game
}

/// `quiet_galaxy` with a hidden starbase in `NEIGHBOUR`.
fn hidden_starbase_next_door() -> Game {
    let mut game = quiet_galaxy();
    game.galaxy.record_mut(NEIGHBOUR).starbases = 1;
    game
}

#[test]
fn a_new_game_starts_every_counter_at_zero() {
    let game = new_game(SEED);
    assert_eq!(game.counters, zero());
    let state = serde_json::to_value(game.state()).unwrap();
    assert!(state["counters"].as_object().unwrap().values().all(|count| count == 0));
}

#[test]
fn the_state_reports_the_games_counters() {
    let applied = run(&board(ONE_ENEMY), torpedo(4, 0));
    assert_eq!(applied.result.state.counters, applied.game.counters);
    assert_ne!(applied.result.state.counters, zero());
}

#[test]
fn a_refused_command_leaves_the_counters_unchanged() {
    let mut game = board(EMPTY_WITH_SHIP_AT_00);
    game.counters = Counters { enemies_destroyed: 3, scans: 2, ..zero() };
    let own_sector = warp(game.sector_xy.x, game.sector_xy.y);
    for command in [Command::Dock, blast(5, 5), torpedo(5, 5), own_sector, subwarp(0, 0)] {
        let applied = run(&game, command);
        assert!(!applied.result.ok);
        assert_eq!(applied.result.state.counters, game.counters);
    }
}

#[test]
fn queries_and_a_subwarp_count_nothing() {
    let game = board(EMPTY_WITH_SHIP_AT_00);
    for command in [Command::State, Command::GalaxyMap, subwarp(5, 0)] {
        let applied = run(&game, command);
        assert!(applied.result.ok);
        assert_eq!(applied.game.counters, zero());
    }
}

#[test]
fn a_blast_that_kills_counts_a_hit_and_an_enemy() {
    let next = blast_rolled(&board(TWO_ENEMIES), xy(4, 0), KILL);
    assert_eq!(next.counters, Counters { blasts_hit: 1, enemies_destroyed: 1, ..zero() });
}

#[test]
fn a_blast_that_misses_counts_a_miss_and_no_hit() {
    let next = blast_rolled(&board(TWO_ENEMIES), xy(4, 0), MISS);
    assert_eq!(next.counters, Counters { blasts_missed: 1, ..zero() });
}

#[test]
fn a_torpedo_counts_a_torpedo_and_an_enemy() {
    let next = run(&board(TWO_ENEMIES), torpedo(4, 0)).game;
    assert_eq!(next.counters, Counters { torpedoes_fired: 1, enemies_destroyed: 1, ..zero() });
}

#[test]
fn the_last_enemy_in_the_sector_counts_a_sector_cleared() {
    let one_left = blast_rolled(&board(TWO_ENEMIES), xy(4, 0), KILL);
    assert_eq!(one_left.counters.sectors_cleared, 0);
    let cleared = blast_rolled(&one_left, xy(0, 4), KILL);
    assert_eq!(cleared.counters, Counters { blasts_hit: 2, enemies_destroyed: 2, sectors_cleared: 1, ..zero() });
}

#[test]
fn a_completed_warp_counts_a_sector_warped() {
    let next = run(&quiet_galaxy(), warp(NEIGHBOUR.x, NEIGHBOUR.y)).game;
    assert_eq!(next.sector_xy, NEIGHBOUR);
    assert_eq!(next.counters, Counters { sectors_warped: 1, ..zero() });
}

/// The parting enemy turn destroys the ship, so the warp never happens: a loss and the hull
/// point it took, and no sector warped.
#[test]
fn a_warp_the_enemies_stop_counts_no_sector_warped() {
    let mut game = board([
        "EEE.......", "ESE.......", "EEE.......", "..........", "..........",
        "..........", "..........", "..........", "..........", "..........",
    ]);
    game.ship.hull = 1;
    game.ship.shields = 0;
    let next = run(&game, warp(NEIGHBOUR.x, NEIGHBOUR.y)).game;
    assert_eq!(next.counters, Counters { hull_damage: 1, games_lost: 1, ..zero() });
}

#[test]
fn a_dock_counts_a_dock() {
    let next = run(&board(BASE_ADJACENT), Command::Dock).game;
    assert_eq!(next.counters, Counters { docks: 1, ..zero() });
}

#[test]
fn a_long_range_scan_counts_a_scan() {
    let next = run(&quiet_galaxy(), Command::LongRangeScan).game;
    assert_eq!(next.counters, Counters { scans: 1, ..zero() });
}

#[test]
fn a_scan_that_uncovers_a_starbase_counts_it_once_however_often_it_is_seen() {
    let scanned = run(&hidden_starbase_next_door(), Command::LongRangeScan).game;
    assert_eq!(scanned.counters, Counters { scans: 1, starbases_discovered: 1, ..zero() });
    let rescanned = run(&scanned, Command::LongRangeScan).game;
    assert_eq!(rescanned.counters, Counters { scans: 2, starbases_discovered: 1, ..zero() });
    let visited = run(&rescanned, warp(NEIGHBOUR.x, NEIGHBOUR.y)).game;
    assert_eq!(visited.counters, Counters { scans: 2, starbases_discovered: 1, sectors_warped: 1, ..zero() });
}

#[test]
fn a_warp_that_uncovers_a_starbase_counts_it() {
    let next = run(&hidden_starbase_next_door(), warp(NEIGHBOUR.x, NEIGHBOUR.y)).game;
    assert_eq!(next.counters, Counters { sectors_warped: 1, starbases_discovered: 1, ..zero() });
}

/// Star Central's starbase is visible from the start, so neither seeing it again nor coming
/// back to it discovers it.
#[test]
fn the_starting_sectors_starbase_is_never_discovered() {
    let scanned = run(&quiet_galaxy(), Command::LongRangeScan).game;
    let home = run(&scanned, warp(GALAXY_CENTER.x, GALAXY_CENTER.y)).game;
    assert_eq!(home.sector_xy, GALAXY_CENTER);
    assert_eq!(home.counters, Counters { scans: 1, sectors_warped: 1, ..zero() });
}

#[test]
fn enemy_fire_counts_what_the_shields_absorb_as_shield_damage_and_the_rest_as_hull_damage() {
    let mut game = board(TWO_AWAY);
    game.ship.shields = 100;
    enemy_fire_by(&mut game, 0, 1.0);
    let to_hull = (fire_damage(2.0, 1.0) - 100) as u32;
    assert_eq!(game.counters, Counters { shield_damage: 100, hull_damage: to_hull, ..zero() });
}

#[test]
fn damage_beyond_what_the_hull_had_is_not_counted() {
    let mut game = board(TWO_AWAY);
    game.ship.shields = 0;
    game.ship.hull = 10;
    enemy_fire_by(&mut game, 0, 1.0);
    assert_eq!(game.counters, Counters { hull_damage: 10, ..zero() });
}

#[test]
fn a_blocked_shot_counts_no_damage() {
    let mut game = board([
        "S*E.......", "..........", "..........", "..........", "..........",
        "..........", "..........", "..........", "..........", "..........",
    ]);
    enemy_fire_by(&mut game, 0, 1.0);
    assert_eq!(game.counters, zero());
}

#[test]
fn a_destroyed_ship_counts_a_game_lost_and_not_a_stranding() {
    let mut game = quiet_galaxy();
    game.ship.hull = 0;
    let next = run(&game, Command::LongRangeScan).game;
    assert_eq!(next.counters, Counters { scans: 1, games_lost: 1, ..zero() });
}

#[test]
fn destroying_the_last_enemy_in_the_galaxy_counts_a_game_won() {
    let mut game = board(ONE_ENEMY);
    for xy in all_cells().filter(|&xy| xy != game.sector_xy) {
        game.galaxy.record_mut(xy).enemies = 0;
    }
    let next = run(&game, torpedo(4, 0)).game;
    let expected =
        Counters { torpedoes_fired: 1, enemies_destroyed: 1, sectors_cleared: 1, games_won: 1, ..zero() };
    assert_eq!(next.counters, expected);
}

#[test]
fn a_stranding_counts_a_game_lost_and_a_time_stranded() {
    let mut game = quiet_galaxy();
    game.ship.energy = LRS_ENERGY + warp_cost(game.sector_xy, GALAXY_CENTER) - 1;
    let next = run(&game, Command::LongRangeScan).game;
    assert_eq!(next.counters, Counters { scans: 1, games_lost: 1, times_stranded: 1, ..zero() });
}

/// A starbase in the sector gives emergency energy and the game goes on: not a stranding.
#[test]
fn a_stranded_ship_a_starbase_rescues_counts_nothing_for_it() {
    let mut game = board(BASE_ADJACENT);
    for xy in all_cells().filter(|&xy| xy != game.sector_xy) {
        game.galaxy.record_mut(xy).starbases = 0;
    }
    game.ship.energy = LRS_ENERGY + 100;
    let next = run(&game, Command::LongRangeScan).game;
    assert_eq!(next.counters, Counters { scans: 1, ..zero() });
}
