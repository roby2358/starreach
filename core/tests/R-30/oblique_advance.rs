//! R-30: an advancing enemy picks left, head-on or right with the game's rng; an oblique
//! approach never ends farther from the ship and never passes through anything.
use crate::helpers::*;
use starreach_core::constants::*;
use starreach_core::events::{advance_by, enemy_advance, Approach};
use starreach_core::geometry::euclid;
use starreach_core::rng::Rng;
use starreach_core::sector::ENEMY;

const OPEN: [&str; 10] = [
    "S.........", "..........", "..........", "..........", "..........",
    ".....E....", "..........", "..........", "..........", "..........",
];

#[test]
fn an_oblique_advance_never_ends_farther_from_the_ship() {
    for approach in [Approach::Left, Approach::Right] {
        for (x, y) in [(5, 5), (2, 9), (8, 3), (6, 4), (3, 7), (9, 9)] {
            let mut rows: Vec<String> = OPEN.iter().map(|r| r.replace('E', ".")).collect();
            rows[y].replace_range(x..x + 1, "E");
            let rows: [&str; 10] = std::array::from_fn(|i| rows[i].as_str());
            let mut game = board(rows);
            let (ship, from) = (game.sector.ship_xy, game.sector.enemies_xy[0]);
            advance_by(&mut game, 0, approach);
            let to = game.sector.enemies_xy[0];
            assert!(euclid(to, ship) <= euclid(from, ship), "{approach:?} from {from:?} to {to:?}");
            assert!(to != from, "{approach:?} from {from:?} should move in the open");
        }
    }
}

#[test]
fn the_two_oblique_approaches_end_on_opposite_sides_of_the_ray() {
    let mut left = board(OPEN);
    let mut right = board(OPEN);
    advance_by(&mut left, 0, Approach::Left);
    advance_by(&mut right, 0, Approach::Right);
    assert_ne!(left.sector.enemies_xy, right.sector.enemies_xy);
    assert!(left.sector.enemies_xy[0].x < right.sector.enemies_xy[0].x);
}

#[test]
fn an_oblique_advance_stops_when_blocked_without_falling_back() {
    // Ship top-left, enemy on the diagonal: head-on is (4,4). Turning left goes up the column
    // side, turning right goes along the row side; a star on that cell blocks it.
    let mut blocked_left = board([
        "S.........", "..........", "..........", "..........", "..........",
        ".....E....", "..........", "..........", "..........", "..........",
    ]);
    let mut open = blocked_left.clone();
    advance_by(&mut open, 0, Approach::Left);
    let first_step = open.sector.enemies_xy[0];
    assert_ne!(first_step, xy(5, 5));
    // Put a star where the left approach would end; it must stay put.
    blocked_left.sector.set(first_step, '*');
    let messages = advance_by(&mut blocked_left, 0, Approach::Left);
    assert_eq!(blocked_left.sector.enemies_xy, vec![xy(5, 5)]);
    assert!(messages[0].contains("blocked"));
}

#[test]
fn an_oblique_advance_never_lands_on_another_enemy() {
    for approach in [Approach::Left, Approach::Right] {
        let mut game = board([
            "S.........", ".EEEE.....", ".EEEE.....", ".EEEE.....", "..........",
            ".....E....", "..........", "..........", "..........", "..........",
        ]);
        let index = game.sector.enemies_xy.iter().position(|&e| e == xy(5, 5)).unwrap();
        advance_by(&mut game, index, approach);
        let mut cells = game.sector.enemies_xy.clone();
        cells.sort_by_key(|cell| (cell.y, cell.x));
        cells.dedup();
        assert_eq!(cells.len(), 13);
        assert_eq!(cells_of(&game, ENEMY).len(), 13);
    }
}

#[test]
fn no_oblique_step_exceeds_the_advance_limit() {
    for approach in [Approach::Left, Approach::Right] {
        let mut game = board(OPEN);
        advance_by(&mut game, 0, approach);
        let (dx, dy) = (game.sector.enemies_xy[0].x - 5, game.sector.enemies_xy[0].y - 5);
        assert!(dy.abs().max(dx.abs()) as usize <= ENEMY_ADVANCE_STEPS);
    }
}

#[test]
fn the_approach_follows_the_seed() {
    let run = |seed: u32| {
        let mut game = board(OPEN);
        game.rng = Rng::seeded(seed);
        enemy_advance(&mut game, 0);
        game.sector.enemies_xy[0]
    };
    for seed in 0..50 {
        assert_eq!(run(seed), run(seed));
    }
}

#[test]
fn over_many_seeds_all_three_approaches_occur_at_the_set_rate() {
    let head_on = {
        let mut game = board(OPEN);
        advance_by(&mut game, 0, Approach::HeadOn);
        game.sector.enemies_xy[0]
    };
    let (mut left, mut right) = (0, 0);
    let mut straight = 0;
    let (mut left_dest, mut right_dest) = (board(OPEN), board(OPEN));
    advance_by(&mut left_dest, 0, Approach::Left);
    advance_by(&mut right_dest, 0, Approach::Right);
    let trials = 4000;
    for seed in 0..trials {
        let mut game = board(OPEN);
        game.rng = Rng::seeded(seed);
        enemy_advance(&mut game, 0);
        let dest = game.sector.enemies_xy[0];
        match dest {
            d if d == head_on => straight += 1,
            d if d == left_dest.sector.enemies_xy[0] => left += 1,
            d if d == right_dest.sector.enemies_xy[0] => right += 1,
            d => panic!("unexpected destination {d:?}"),
        }
    }
    let share = |n: i32| n as f64 / trials as f64;
    let side = ENEMY_OBLIQUE_CHANCE / 2.0;
    assert!((share(left) - side).abs() < 0.03, "left {}", share(left));
    assert!((share(right) - side).abs() < 0.03, "right {}", share(right));
    assert!((share(straight) - (1.0 - ENEMY_OBLIQUE_CHANCE)).abs() < 0.03, "head-on {}", share(straight));
}
