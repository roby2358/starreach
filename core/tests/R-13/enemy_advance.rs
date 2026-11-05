//! R-13: enemy advance moves up to ENEMY_ADVANCE_STEPS along the ray, only onto an empty cell.
use crate::helpers::*;
use starreach_core::constants::*;
use starreach_core::events::enemy_advance;
use starreach_core::sector::ENEMY;

fn advance(rows: [&str; 10], index: usize) -> starreach_core::Game {
    let mut game = board(rows);
    enemy_advance(&mut game, index);
    game
}

#[test]
fn moves_toward_the_ship_on_a_clear_line() {
    let game = advance([
        "S....E....", "..........", "..........", "..........", "..........",
        "..........", "..........", "..........", "..........", "..........",
    ], 0);
    let dest = (0, 5 - ENEMY_ADVANCE_STEPS as i32);
    assert_eq!(game.sector.enemies_yx, vec![dest]);
    assert_eq!(game.sector.at(dest), Some(ENEMY));
    assert!(game.sector.is_empty((0, 5)));
}

#[test]
fn stays_when_adjacent_to_the_ship() {
    let game = advance([
        "SE........", "..........", "..........", "..........", "..........",
        "..........", "..........", "..........", "..........", "..........",
    ], 0);
    assert_eq!(game.sector.enemies_yx, vec![(0, 1)]);
}

#[test]
fn stays_when_the_destination_is_a_star() {
    let game = advance([
        "S..*.E....", "..........", "..........", "..........", "..........",
        "..........", "..........", "..........", "..........", "..........",
    ], 0);
    assert_eq!(game.sector.enemies_yx, vec![(0, 5)]);
}

#[test]
fn stays_when_the_next_cell_holds_another_enemy() {
    // enemies_yx is in row order, so index 1 is the enemy at (0, 5), behind (0, 4).
    let game = advance([
        "S...EE....", "..........", "..........", "..........", "..........",
        "..........", "..........", "..........", "..........", "..........",
    ], 1);
    assert_eq!(game.sector.enemies_yx, vec![(0, 4), (0, 5)]);
}
