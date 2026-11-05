//! R-22: after a successful shot the galaxy record counts the enemies left.
use crate::helpers::*;

const TWO_ENEMIES: [&str; 10] = [
    "S..E......", "..........", "..........", "..........", "..........",
    "..........", "..........", "..........", "..........", "........E.",
];

#[test]
fn a_blast_updates_the_record() {
    let next = run(&board(TWO_ENEMIES), blast(0, 3)).game;
    assert_eq!(next.galaxy.record(next.sector_yx).enemies, 1);
    assert_eq!(next.sector.enemies_yx.len(), 1);
}

#[test]
fn a_torpedo_updates_the_record() {
    let next = run(&board(TWO_ENEMIES), torpedo(9, 8)).game;
    assert_eq!(next.galaxy.record(next.sector_yx).enemies, 1);
    assert_eq!(next.sector.enemies_yx.len(), 1);
}
