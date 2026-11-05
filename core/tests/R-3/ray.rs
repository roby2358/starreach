//! R-3: the ray rule, on hand-built maps.
use crate::helpers::*;

#[test]
fn start_equal_to_dest_is_just_the_start() {
    let game = board(EMPTY_WITH_SHIP_AT_00);
    assert_eq!(game.sector.ray((0, 0), (0, 0)), vec![(0, 0)]);
}

#[test]
fn a_clear_line_ends_at_dest() {
    let game = board(EMPTY_WITH_SHIP_AT_00);
    assert_eq!(game.sector.ray((0, 0), (0, 3)), vec![(0, 0), (0, 1), (0, 2), (0, 3)]);
    assert_eq!(game.sector.ray((0, 0), (2, 2)), vec![(0, 0), (1, 1), (2, 2)]);
}

#[test]
fn a_line_through_an_obstacle_ends_at_the_obstacle() {
    let game = board([
        "S.*.......", "..........", "..........", "..........", "..........",
        "..........", "..........", "..........", "..........", "..........",
    ]);
    assert_eq!(game.sector.ray((0, 0), (0, 5)), vec![(0, 0), (0, 1), (0, 2)]);
}

#[test]
fn leaving_the_board_ends_at_the_first_cell_off_it() {
    let game = board(EMPTY_WITH_SHIP_AT_00);
    assert_eq!(game.sector.ray((0, 8), (0, 12)), vec![(0, 8), (0, 9), (0, 10)]);
}

#[test]
fn the_start_cell_is_never_checked() {
    let game = board(EMPTY_WITH_SHIP_AT_00);
    // (0, 0) holds the ship, which is an obstacle to everything else.
    assert_eq!(game.sector.ray((0, 0), (0, 1)), vec![(0, 0), (0, 1)]);
}
