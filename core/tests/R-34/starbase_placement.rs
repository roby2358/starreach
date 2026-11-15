//! R-34: extra starbases are a seeded count placed at least STARBASE_MIN_SPACING apart.
use starreach_core::constants::*;
use starreach_core::galaxy::Galaxy;
use starreach_core::geometry::euclid;
use starreach_core::rng::Rng;

fn galaxy(seed: u32) -> Galaxy {
    Galaxy::generate(&mut Rng::seeded(seed))
}

fn empty_galaxy_with_home() -> Galaxy {
    let mut g = galaxy(0);
    for yx in g.starbase_sectors() {
        g.record_mut(yx).starbases = (yx == GALAXY_CENTER) as u32;
    }
    g
}

#[test]
fn extra_count_is_within_bounds_and_every_value_occurs() {
    let mut seen = std::collections::BTreeSet::new();
    for seed in 0..500 {
        let extra = galaxy(seed).starbase_sectors().len() as i32 - 1;
        assert!((STARBASE_EXTRA_MIN..=STARBASE_EXTRA_MAX).contains(&extra), "seed {seed}: {extra}");
        seen.insert(extra);
    }
    assert_eq!(seen.len() as i32, STARBASE_EXTRA_MAX - STARBASE_EXTRA_MIN + 1);
}

#[test]
fn every_pair_of_starbases_is_spaced_apart() {
    for seed in 0..500 {
        let bases = galaxy(seed).starbase_sectors();
        assert!(bases.contains(&GALAXY_CENTER));
        for (i, &a) in bases.iter().enumerate() {
            for &b in &bases[i + 1..] {
                assert!(euclid(a, b) >= STARBASE_MIN_SPACING, "seed {seed}: {a:?} {b:?}");
            }
        }
    }
}

#[test]
fn each_sector_holds_at_most_one_starbase() {
    for seed in 0..200 {
        let g = galaxy(seed);
        assert!(g.sectors.iter().flatten().all(|r| r.starbases <= 1));
    }
}

#[test]
fn same_seed_gives_the_same_placement() {
    for seed in 0..50 {
        assert_eq!(galaxy(seed), galaxy(seed));
    }
}

#[test]
fn placement_stops_early_when_no_spot_is_found() {
    for seed in 0..50 {
        let mut g = empty_galaxy_with_home();
        g.place_extra_starbases(&mut Rng::seeded(seed), 0);
        assert_eq!(g.starbase_sectors(), vec![GALAXY_CENTER]);
    }
}

#[test]
fn placement_never_exceeds_the_maximum_even_with_many_tries() {
    for seed in 0..50 {
        let mut g = empty_galaxy_with_home();
        g.place_extra_starbases(&mut Rng::seeded(seed), 100_000);
        assert!(g.starbase_sectors().len() as i32 - 1 <= STARBASE_EXTRA_MAX);
    }
}
