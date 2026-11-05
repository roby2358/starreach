//! R-19: ONTOLOGY's invariants hold after every command in long random sequences.
use crate::helpers::*;
use starreach_core::geometry::{all_cells, Yx};
use starreach_core::rng::Rng;
use starreach_core::sector::{ENEMY, SHIP};
use starreach_core::{apply, new_game, Command, Game, Status};

fn random_command(game: &Game, rng: &mut Rng) -> Command {
    let cell = (rng.int_in((0, 9)), rng.int_in((0, 9)));
    let aim: Yx = match game.sector.enemies_yx.is_empty() {
        true => cell,
        false => game.sector.enemies_yx[rng.index(game.sector.enemies_yx.len())],
    };
    match rng.int_in((0, 7)) {
        0 => Command::State,
        1 => Command::GalaxyMap,
        2 => warp(cell.0, cell.1),
        3 => subwarp(cell.0, cell.1),
        4 => Command::Dock,
        5 => Command::LongRangeScan,
        6 => blast(aim.0, aim.1),
        _ => torpedo(aim.0, aim.1),
    }
}

fn check(before: &Game, after: &Game) {
    let s = &after.sector;
    let ships: Vec<Yx> = all_cells().filter(|&yx| s.at(yx) == Some(SHIP)).collect();
    assert_eq!(ships, vec![s.ship_yx], "exactly one S, at ship_yx");
    let mut enemy_cells: Vec<Yx> = all_cells().filter(|&yx| s.at(yx) == Some(ENEMY)).collect();
    let mut listed = s.enemies_yx.clone();
    enemy_cells.sort();
    listed.sort();
    assert_eq!(enemy_cells, listed, "enemies_yx matches the E cells");
    assert_eq!(after.galaxy.record(after.sector_yx).enemies as usize, s.enemies_yx.len());
    let ship = &after.ship;
    assert!((0..=ship.max_hull).contains(&ship.hull));
    assert!((0..=ship.max_shields).contains(&ship.shields));
    assert!((0..=ship.max_energy).contains(&ship.energy));
    assert!((0..=ship.max_quantorpedoes).contains(&ship.quantorpedoes));
    assert!(after.stardate >= before.stardate);
    for yx in all_cells() {
        assert!(!before.galaxy.record(yx).visible || after.galaxy.record(yx).visible);
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
