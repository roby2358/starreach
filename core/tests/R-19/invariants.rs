//! R-19: ONTOLOGY's invariants hold after every command in long random sequences.
use crate::helpers::*;
use starreach_core::geometry::{all_cells, Xy};
use starreach_core::rng::Rng;
use starreach_core::sector::{ENEMY, SHIP};
use starreach_core::{apply, Command, Game, Status};

fn random_command(game: &Game, rng: &mut Rng) -> Command {
    let y = rng.int_in((0, 9));
    let x = rng.int_in((0, 9));
    let cell = xy(x, y);
    let aim: Xy = match game.sector.enemies_xy.is_empty() {
        true => cell,
        false => game.sector.enemies_xy[rng.index(game.sector.enemies_xy.len())],
    };
    match rng.int_in((0, 7)) {
        0 => Command::State,
        1 => Command::GalaxyMap,
        2 => warp(cell.x, cell.y),
        3 => subwarp(cell.x, cell.y),
        4 => Command::Dock,
        5 => Command::LongRangeScan,
        6 => blast(aim.x, aim.y),
        _ => torpedo(aim.x, aim.y),
    }
}

fn check(before: &Game, after: &Game) {
    let s = &after.sector;
    let ships: Vec<Xy> = all_cells().filter(|&xy| s.at(xy) == Some(SHIP)).collect();
    assert_eq!(ships, vec![s.ship_xy], "exactly one S, at ship_xy");
    let mut enemy_cells: Vec<Xy> = all_cells().filter(|&xy| s.at(xy) == Some(ENEMY)).collect();
    let mut listed = s.enemies_xy.clone();
    enemy_cells.sort_by_key(|cell| (cell.y, cell.x));
    listed.sort_by_key(|cell| (cell.y, cell.x));
    assert_eq!(enemy_cells, listed, "enemies_xy matches the E cells");
    assert_eq!(after.galaxy.record(after.sector_xy).enemies as usize, s.enemies_xy.len());
    let ship = &after.ship;
    assert!((0..=ship.max_hull).contains(&ship.hull));
    assert!((0..=ship.max_shields).contains(&ship.shields));
    assert!((0..=ship.max_energy).contains(&ship.energy));
    assert!((0..=ship.max_quantorpedoes).contains(&ship.quantorpedoes));
    assert!(after.startick >= before.startick);
    for xy in all_cells() {
        assert!(!before.galaxy.record(xy).visible || after.galaxy.record(xy).visible);
    }
    let counts = |game: &Game| serde_json::to_value(game.counters).unwrap();
    let (was, now) = (counts(before), counts(after));
    for (key, count) in now.as_object().unwrap() {
        assert!(count.as_u64() >= was[key].as_u64(), "{key} never decreases");
    }
    if before.status != Status::Playing {
        assert_eq!(after.status, before.status, "status leaves playing at most once");
    }
}

#[test]
fn invariants_hold_over_random_play() {
    for seed in 0..20 {
        let mut game = new_game(seed);
        let mut chooser = Rng::seeded(1000 + seed);
        for _ in 0..300 {
            let command = random_command(&game, &mut chooser);
            let next = apply(&game, &command).game;
            check(&game, &next);
            game = next;
        }
    }
}
