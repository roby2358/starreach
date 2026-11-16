//! R-24: a sector's terrain is the same on every visit; its enemies stand on the first of
//! the cells first generated for them.
use crate::helpers::*;
use starreach_core::constants::*;
use starreach_core::geometry::all_cells;
use starreach_core::sector::STAR;
use starreach_core::Game;

#[test]
fn terrain_returns_and_survivors_keep_the_first_cells() {
    let start = new_game(SEED);
    let target = all_cells().find(|&xy| start.galaxy.record(xy).enemies >= 2).unwrap();
    let first: Game = run(&start, warp(target.x, target.y)).game;

    let mut back = run(&first, warp(GALAXY_CENTER.x, GALAXY_CENTER.y)).game;
    back.galaxy.record_mut(target).enemies -= 1;
    let again = run(&back, warp(target.x, target.y)).game;

    assert_eq!(cells_of(&again, STAR), cells_of(&first, STAR));
    assert_eq!(again.sector.starbase_xy, first.sector.starbase_xy);
    let survivors = first.sector.enemies_xy.len() - 1;
    assert_eq!(again.sector.enemies_xy, first.sector.enemies_xy[..survivors].to_vec());
}
