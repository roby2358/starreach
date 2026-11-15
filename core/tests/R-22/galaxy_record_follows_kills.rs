//! R-22: after a successful shot the galaxy record counts the enemies left.
use crate::helpers::*;
use starreach_core::actions::blast_by;

const TWO_ENEMIES: [&str; 10] = [
    "S..E......", "..........", "..........", "..........", "..........",
    "..........", "..........", "..........", "..........", "........E.",
];

#[test]
fn a_blast_kill_updates_the_record() {
    let mut next = board(TWO_ENEMIES);
    blast_by(&mut next, (0, 3), 0.0, &mut Vec::new()).unwrap();
    assert_eq!(next.galaxy.record(next.sector_yx).enemies, 1);
    assert_eq!(next.sector.enemies_yx.len(), 1);
}

#[test]
fn a_torpedo_updates_the_record() {
    let next = run(&board(TWO_ENEMIES), torpedo(9, 8)).game;
    assert_eq!(next.galaxy.record(next.sector_yx).enemies, 1);
    assert_eq!(next.sector.enemies_yx.len(), 1);
}
