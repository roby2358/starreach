//! R-1: galaxy generation.
use starreach_core::constants::*;
use starreach_core::geometry::{all_cells, euclid};
use starreach_core::new_game;

#[test]
fn center_is_known_and_others_are_hidden_within_ranges() {
    let game = new_game(11);
    for yx in all_cells() {
        let r = game.galaxy.record(yx);
        if yx == GALAXY_CENTER {
            assert_eq!((r.visible, r.enemies, r.starbases, r.stars), (true, 0, 1, START_SECTOR_STARS));
            continue;
        }
        assert!(!r.visible);
        assert!(r.enemies <= ENEMY_MAX_PER_SECTOR);
        assert!(r.starbases <= 1);
        assert!((STARS_PER_SECTOR.0..=STARS_PER_SECTOR.1).contains(&(r.stars as i32)));
    }
}

#[test]
fn enemies_rise_with_distance_from_center() {
    let (mut near, mut far) = ((0u32, 0u32), (0u32, 0u32));
    for seed in 0..300 {
        let game = new_game(seed);
        for yx in all_cells().filter(|&yx| yx != GALAXY_CENTER) {
            let d = euclid(yx, GALAXY_CENTER);
            let bucket = if d <= 2.0 { &mut near } else if d >= 5.0 { &mut far } else { continue };
            bucket.0 += game.galaxy.record(yx).enemies;
            bucket.1 += 1;
        }
    }
    let mean = |b: (u32, u32)| b.0 as f64 / b.1 as f64;
    assert!(mean(far) > mean(near), "far {} vs near {}", mean(far), mean(near));
}
