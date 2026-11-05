//! R-8: the galaxy map.
use crate::helpers::*;
use starreach_core::constants::*;
use starreach_core::Command;

#[test]
fn ten_rows_of_ten_entries_with_hidden_sectors_as_dots() {
    let game = board(EMPTY_WITH_SHIP_AT_00);
    let applied = run(&game, Command::GalaxyMap);
    let rows = report(&applied)["map"].clone();
    let rows: Vec<&str> = rows.as_array().unwrap().iter().map(|r| r.as_str().unwrap()).collect();
    assert_eq!(rows.len(), 10);
    for (y, row) in rows.iter().enumerate() {
        let entries: Vec<&str> = row.split(' ').collect();
        assert_eq!(entries.len(), 10);
        for (x, entry) in entries.iter().enumerate() {
            let record = game.galaxy.record((y as i32, x as i32));
            match record.visible {
                true => assert_eq!(*entry, format!("{}|{}|{}", record.enemies, record.starbases, record.stars)),
                false => assert_eq!(*entry, "....."),
            }
        }
    }
    let center = rows[GALAXY_CENTER.0 as usize].split(' ').nth(GALAXY_CENTER.1 as usize).unwrap();
    assert_ne!(center, ".....");
}

#[test]
fn the_map_changes_nothing() {
    let game = board(EMPTY_WITH_SHIP_AT_00);
    assert_eq!(run(&game, Command::GalaxyMap).game, game);
}
