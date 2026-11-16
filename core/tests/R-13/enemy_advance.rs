//! R-13: enemy advance moves up to ENEMY_ADVANCE_STEPS along the ray, only onto an empty cell.
use crate::helpers::*;
use starreach_core::constants::*;
use starreach_core::events::{advance_by, Approach};
use starreach_core::sector::ENEMY;

fn advance(rows: [&str; 10], index: usize) -> starreach_core::Game {
    let mut game = board(rows);
    advance_by(&mut game, index, Approach::HeadOn);
    game
}

#[test]
fn moves_toward_the_ship_on_a_clear_line() {
    let game = advance([
        "S....E....", "..........", "..........", "..........", "..........",
        "..........", "..........", "..........", "..........", "..........",
    ], 0);
    let dest = xy(5 - ENEMY_ADVANCE_STEPS as i32, 0);
    assert_eq!(game.sector.enemies_xy, vec![dest]);
    assert_eq!(game.sector.at(dest), Some(ENEMY));
    assert!(game.sector.is_empty(xy(5, 0)));
}

#[test]
fn stays_when_adjacent_to_the_ship() {
    let game = advance([
        "SE........", "..........", "..........", "..........", "..........",
        "..........", "..........", "..........", "..........", "..........",
    ], 0);
    assert_eq!(game.sector.enemies_xy, vec![xy(1, 0)]);
}

#[test]
fn stays_when_the_destination_is_a_star() {
    let game = advance([
        "S..*.E....", "..........", "..........", "..........", "..........",
        "..........", "..........", "..........", "..........", "..........",
    ], 0);
    assert_eq!(game.sector.enemies_xy, vec![xy(5, 0)]);
}

#[test]
fn stays_when_the_next_cell_holds_another_enemy() {
    // enemies_xy is in row order, so index 1 is the enemy at (5, 0), behind (4, 0).
    let game = advance([
        "S...EE....", "..........", "..........", "..........", "..........",
        "..........", "..........", "..........", "..........", "..........",
    ], 1);
    assert_eq!(game.sector.enemies_xy, vec![xy(4, 0), xy(5, 0)]);
}
