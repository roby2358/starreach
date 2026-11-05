//! R-24: a sector's terrain is the same on every visit; its enemies stand on the first of
//! the cells first generated for them.
use crate::helpers::*;
use starreach_core::constants::*;
use starreach_core::geometry::all_cells;
use starreach_core::sector::STAR;
use starreach_core::{new_game, Game};

#[test]
fn terrain_returns_and_survivors_keep_the_first_cells() {
    let start = new_game(SEED);
    let target = all_cells().find(|&yx| start.galaxy.record(yx).enemies >= 2).unwrap();
    let first: Game = run(&start, warp(target.0, target.1)).game;

    let mut back = run(&first, warp(GALAXY_CENTER.0, GALAXY_CENTER.1)).game;
    back.galaxy.record_mut(target).enemies -= 1;
    let again = run(&back, warp(target.0, target.1)).game;

    assert_eq!(cells_of(&again, STAR), cells_of(&first, STAR));
    assert_eq!(again.sector.starbase_yx, first.sector.starbase_yx);
    let survivors = first.sector.enemies_yx.len() - 1;
    assert_eq!(again.sector.enemies_yx, first.sector.enemies_yx[..survivors].to_vec());
}
