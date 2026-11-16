//! R-2: a sector built from its record and the seed.
use starreach_core::galaxy::SectorRecord;
use starreach_core::geometry::{all_cells, xy};
use starreach_core::rng::Rng;
use starreach_core::sector::{ActiveSector, ENEMY, SHIP, STAR, STARBASE};

fn build() -> ActiveSector {
    let record = SectorRecord { visible: true, enemies: 5, starbases: 1, stars: 6 };
    ActiveSector::instantiate(&record, &mut Rng::for_sector(3, xy(7, 2)))
}

fn count(sector: &ActiveSector, occupant: char) -> usize {
    all_cells().filter(|&xy| sector.at(xy) == Some(occupant)).count()
}

#[test]
fn board_matches_the_record() {
    let sector = build();
    assert_eq!(count(&sector, SHIP), 1);
    assert_eq!(sector.at(sector.ship_xy), Some(SHIP));
    assert_eq!(count(&sector, STARBASE), 1);
    assert_eq!(sector.at(sector.starbase_xy.unwrap()), Some(STARBASE));
    assert_eq!(count(&sector, STAR), 6);
    assert_eq!(count(&sector, ENEMY), 5);
    assert_eq!(sector.enemies_xy.len(), 5);
    assert!(sector.enemies_xy.iter().all(|&xy| sector.at(xy) == Some(ENEMY)));
}

#[test]
fn same_seed_sector_and_record_give_the_same_board() {
    assert_eq!(build(), build());
}
