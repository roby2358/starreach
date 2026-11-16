//! R-29: GameState lists each enemy with its range, bearing and clear shot.
use crate::helpers::*;
use starreach_core::game::{EnemySight, Game};
use starreach_core::geometry::{euclid, Xy};

const EMPTY: [&str; 10] = [
    "..........", "..........", "..........", "..........", "..........",
    "..........", "..........", "..........", "..........", "..........",
];

/// An empty board with the ship at `ship` and an enemy on each of `enemies`.
fn with(ship: Xy, enemies: &[Xy], stars: &[Xy]) -> Game {
    let mut rows: Vec<Vec<char>> = EMPTY.iter().map(|r| r.chars().collect()).collect();
    let mut put = |at: Xy, occupant: char| rows[at.y as usize][at.x as usize] = occupant;
    put(ship, 'S');
    enemies.iter().for_each(|&at| put(at, 'E'));
    stars.iter().for_each(|&at| put(at, '*'));
    let strings: Vec<String> = rows.iter().map(|r| r.iter().collect()).collect();
    board(std::array::from_fn(|i| strings[i].as_str()))
}

fn sights(game: &Game) -> Vec<EnemySight> {
    game.state().enemies
}

#[test]
fn range_is_the_blast_distance_to_two_decimals() {
    let game = with(xy(5, 5), &[xy(7, 2)], &[]);
    let range = sights(&game)[0].range;
    assert_eq!(range, 3.61);
    assert_eq!(range, (euclid(xy(5, 5), xy(7, 2)) * 100.0).round() / 100.0);
}

#[test]
fn bearing_is_clockwise_degrees_from_up_on_the_axes() {
    let game = with(xy(5, 5), &[xy(5, 2), xy(8, 5), xy(5, 8), xy(2, 5)], &[]);
    let by_cell = |cell| sights(&game).into_iter().find(|s| s.xy == cell).unwrap().bearing;
    assert_eq!(by_cell(xy(5, 2)), 0);
    assert_eq!(by_cell(xy(8, 5)), 90);
    assert_eq!(by_cell(xy(5, 8)), 180);
    assert_eq!(by_cell(xy(2, 5)), 270);
}

#[test]
fn bearing_on_a_diagonal() {
    let game = with(xy(5, 5), &[xy(8, 2), xy(8, 8), xy(2, 8), xy(2, 2)], &[]);
    let by_cell = |cell| sights(&game).into_iter().find(|s| s.xy == cell).unwrap().bearing;
    assert_eq!(by_cell(xy(8, 2)), 45);
    assert_eq!(by_cell(xy(8, 8)), 135);
    assert_eq!(by_cell(xy(2, 8)), 225);
    assert_eq!(by_cell(xy(2, 2)), 315);
}

#[test]
fn clear_shot_is_true_on_an_open_line() {
    let game = with(xy(5, 5), &[xy(9, 5)], &[]);
    assert!(sights(&game)[0].clear_shot);
}

#[test]
fn clear_shot_is_false_behind_a_star() {
    let game = with(xy(0, 5), &[xy(9, 5)], &[xy(4, 5)]);
    assert!(!sights(&game)[0].clear_shot);
}

#[test]
fn clear_shot_is_false_behind_another_enemy_and_true_for_the_one_in_front() {
    let game = with(xy(0, 5), &[xy(4, 5), xy(9, 5)], &[]);
    let s = sights(&game);
    assert!(s.iter().find(|e| e.xy == xy(4, 5)).unwrap().clear_shot);
    assert!(!s.iter().find(|e| e.xy == xy(9, 5)).unwrap().clear_shot);
}

#[test]
fn clear_shot_says_nothing_about_range() {
    let game = with(xy(0, 0), &[xy(9, 9)], &[]);
    assert!(sights(&game)[0].range > starreach_core::constants::BLAST_RANGE);
    assert!(sights(&game)[0].clear_shot);
}

#[test]
fn clear_shot_equals_whether_a_torpedo_at_the_cell_hits_it() {
    let game = with(xy(0, 5), &[xy(4, 5), xy(9, 5), xy(7, 2), xy(3, 8)], &[xy(5, 3), xy(2, 7)]);
    for sight in sights(&game) {
        let shot = report(&run(&game, torpedo(sight.xy.x, sight.xy.y)));
        let destroyed = shot["hit_xy"] == serde_json::json!([sight.xy.x, sight.xy.y]);
        assert_eq!(sight.clear_shot, destroyed, "enemy at {:?}", sight.xy);
    }
}
