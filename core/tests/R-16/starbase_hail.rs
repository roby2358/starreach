//! R-16: one hail on arrival in a sector with a starbase.
use crate::helpers::*;

fn hails_on_arrival(enemies: u32) -> Vec<String> {
    let mut game = board(EMPTY_WITH_SHIP_AT_00);
    let record = game.galaxy.record_mut((4, 6));
    record.starbases = 1;
    record.enemies = enemies;
    let events = run(&game, warp(4, 6)).result.events;
    events.into_iter().filter(|e| e.starts_with("Starbase communication")).collect()
}

#[test]
fn all_clear_without_enemies() {
    assert_eq!(hails_on_arrival(0), vec!["Starbase communication: all clear, approach for docking"]);
}

#[test]
fn under_attack_with_enemies() {
    assert_eq!(hails_on_arrival(3), vec!["Starbase communication: under attack, needs assistance"]);
}

#[test]
fn no_hail_without_a_starbase() {
    let mut game = board(EMPTY_WITH_SHIP_AT_00);
    game.galaxy.record_mut((4, 6)).starbases = 0;
    let events = run(&game, warp(4, 6)).result.events;
    assert!(events.iter().all(|e| !e.starts_with("Starbase communication")));
}
