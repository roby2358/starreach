//! R-29: GameState lists each enemy with its range, bearing and clear shot.
use crate::helpers::*;
use starreach_core::game::{EnemySight, Game};
use starreach_core::geometry::euclid;

const EMPTY: [&str; 10] = [
    "..........", "..........", "..........", "..........", "..........",
    "..........", "..........", "..........", "..........", "..........",
];

/// An empty board with the ship at `ship` and an enemy on each of `enemies`.
fn with(ship: (usize, usize), enemies: &[(usize, usize)], stars: &[(usize, usize)]) -> Game {
    let mut rows: Vec<Vec<char>> = EMPTY.iter().map(|r| r.chars().collect()).collect();
    rows[ship.0][ship.1] = 'S';
    enemies.iter().for_each(|&(y, x)| rows[y][x] = 'E');
    stars.iter().for_each(|&(y, x)| rows[y][x] = '*');
    let strings: Vec<String> = rows.iter().map(|r| r.iter().collect()).collect();
    board(std::array::from_fn(|i| strings[i].as_str()))
}

fn sights(game: &Game) -> Vec<EnemySight> {
    game.state().enemies
}

#[test]
fn range_is_the_blast_distance_to_two_decimals() {
    let game = with((5, 5), &[(2, 7)], &[]);
    let range = sights(&game)[0].range;
    assert_eq!(range, 3.61);
    assert_eq!(range, (euclid((5, 5), (2, 7)) * 100.0).round() / 100.0);
}

#[test]
fn bearing_is_clockwise_degrees_from_up_on_the_axes() {
    let game = with((5, 5), &[(2, 5), (5, 8), (8, 5), (5, 2)], &[]);
    let by_cell = |yx| sights(&game).into_iter().find(|s| s.yx == yx).unwrap().bearing;
    assert_eq!(by_cell((2, 5)), 0);
    assert_eq!(by_cell((5, 8)), 90);
    assert_eq!(by_cell((8, 5)), 180);
    assert_eq!(by_cell((5, 2)), 270);
}

#[test]
fn bearing_on_a_diagonal() {
    let game = with((5, 5), &[(2, 8), (8, 8), (8, 2), (2, 2)], &[]);
    let by_cell = |yx| sights(&game).into_iter().find(|s| s.yx == yx).unwrap().bearing;
    assert_eq!(by_cell((2, 8)), 45);
    assert_eq!(by_cell((8, 8)), 135);
    assert_eq!(by_cell((8, 2)), 225);
    assert_eq!(by_cell((2, 2)), 315);
}

#[test]
fn clear_shot_is_true_on_an_open_line() {
    let game = with((5, 5), &[(5, 9)], &[]);
    assert!(sights(&game)[0].clear_shot);
}

#[test]
fn clear_shot_is_false_behind_a_star() {
    let game = with((5, 0), &[(5, 9)], &[(5, 4)]);
    assert!(!sights(&game)[0].clear_shot);
}

#[test]
fn clear_shot_is_false_behind_another_enemy_and_true_for_the_one_in_front() {
    let game = with((5, 0), &[(5, 4), (5, 9)], &[]);
    let s = sights(&game);
    assert!(s.iter().find(|e| e.yx == (5, 4)).unwrap().clear_shot);
    assert!(!s.iter().find(|e| e.yx == (5, 9)).unwrap().clear_shot);
}

#[test]
fn clear_shot_says_nothing_about_range() {
    let game = with((5, 0), &[(5, 9)], &[]);
    assert!(sights(&game)[0].range > starreach_core::constants::BLAST_RANGE);
    assert!(sights(&game)[0].clear_shot);
}

#[test]
fn clear_shot_equals_whether_a_torpedo_at_the_cell_hits_it() {
    let game = with((5, 0), &[(5, 4), (5, 9), (2, 7), (8, 3)], &[(3, 5), (7, 2)]);
    for sight in sights(&game) {
        let shot = report(&run(&game, torpedo(sight.yx.0, sight.yx.1)));
        let destroyed = shot["hit_yx"] == serde_json::json!([sight.yx.0, sight.yx.1]);
        assert_eq!(sight.clear_shot, destroyed, "enemy at {:?}", sight.yx);
    }
}
