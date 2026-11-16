//! R-3: the ray rule, on hand-built maps.
use crate::helpers::*;

#[test]
fn start_equal_to_dest_is_just_the_start() {
    let game = board(EMPTY_WITH_SHIP_AT_00);
    assert_eq!(game.sector.ray(xy(0, 0), xy(0, 0)), vec![xy(0, 0)]);
}

#[test]
fn a_clear_line_ends_at_dest() {
    let game = board(EMPTY_WITH_SHIP_AT_00);
    assert_eq!(game.sector.ray(xy(0, 0), xy(3, 0)), vec![xy(0, 0), xy(1, 0), xy(2, 0), xy(3, 0)]);
    assert_eq!(game.sector.ray(xy(0, 0), xy(2, 2)), vec![xy(0, 0), xy(1, 1), xy(2, 2)]);
}

#[test]
fn a_line_through_an_obstacle_ends_at_the_obstacle() {
    let game = board([
        "S.*.......", "..........", "..........", "..........", "..........",
        "..........", "..........", "..........", "..........", "..........",
    ]);
    assert_eq!(game.sector.ray(xy(0, 0), xy(5, 0)), vec![xy(0, 0), xy(1, 0), xy(2, 0)]);
}

#[test]
fn leaving_the_board_ends_at_the_first_cell_off_it() {
    let game = board(EMPTY_WITH_SHIP_AT_00);
    assert_eq!(game.sector.ray(xy(8, 0), xy(12, 0)), vec![xy(8, 0), xy(9, 0), xy(10, 0)]);
}

#[test]
fn the_start_cell_is_never_checked() {
    let game = board(EMPTY_WITH_SHIP_AT_00);
    // (0, 0) holds the ship, which is an obstacle to everything else.
    assert_eq!(game.sector.ray(xy(0, 0), xy(1, 0)), vec![xy(0, 0), xy(1, 0)]);
}
