//! R-37: a counter's ladder is scale × {1, 2, 5} × 10^n, and a total going from one value to
//! another crosses the rungs above the first and at or below the second.
use starreach_core::ladder::{rungs_crossed, standing, Standing};
use starreach_core::{counter_table, ladder_standing, ladder_standing_json, rungs_crossed_json};

#[test]
fn the_rungs_of_a_scale_follow_one_two_five() {
    assert_eq!(rungs_crossed(1, 0, 1000), [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000]);
    assert_eq!(rungs_crossed(10, 0, 1000), [10, 20, 50, 100, 200, 500, 1000]);
    assert_eq!(rungs_crossed(1000, 0, 50_000), [1000, 2000, 5000, 10_000, 20_000, 50_000]);
}

#[test]
fn several_rungs_are_crossed_at_once() {
    assert_eq!(rungs_crossed(10, 15, 120), [20, 50, 100]);
}

#[test]
fn no_rung_is_crossed_between_two_rungs() {
    assert_eq!(rungs_crossed(10, 21, 49), Vec::<u64>::new());
    assert_eq!(rungs_crossed(100, 0, 99), Vec::<u64>::new());
}

#[test]
fn landing_on_a_rung_crosses_it_and_standing_on_it_does_not_cross_it_again() {
    assert_eq!(rungs_crossed(10, 19, 20), [20]);
    assert_eq!(rungs_crossed(10, 20, 49), Vec::<u64>::new());
}

#[test]
fn a_total_that_does_not_move_crosses_nothing() {
    assert_eq!(rungs_crossed(1, 5, 5), Vec::<u64>::new());
}

#[test]
fn a_standing_is_the_last_rung_reached_and_the_next() {
    assert_eq!(standing(10, 0), Standing { reached: None, next: 10 });
    assert_eq!(standing(10, 9), Standing { reached: None, next: 10 });
    assert_eq!(standing(10, 10), Standing { reached: Some(10), next: 20 });
    assert_eq!(standing(10, 137), Standing { reached: Some(100), next: 200 });
    assert_eq!(standing(1000, 5000), Standing { reached: Some(5000), next: 10_000 });
}

#[test]
fn a_ladder_is_practically_endless() {
    let far = 9_000_000_000_000_000; // near 2^53, the largest total a JavaScript caller holds
    assert_eq!(standing(1, far), Standing { reached: Some(5_000_000_000_000_000), next: 10_000_000_000_000_000 });
    assert_eq!(rungs_crossed(1, 0, u64::MAX).last(), Some(&10_000_000_000_000_000_000));
    assert_eq!(standing(1, u64::MAX).next, 10_000_000_000_000_000_000);
}

#[test]
fn each_counter_climbs_the_ladder_of_its_own_scale() {
    for row in counter_table() {
        let first = row.scale as u64;
        assert_eq!(starreach_core::rungs_crossed(row.key, 0, first * 2), Some(vec![first, first * 2]), "{}", row.key);
        assert_eq!(ladder_standing(row.key, first), Some(Standing { reached: Some(first), next: first * 2 }), "{}", row.key);
    }
}

#[test]
fn a_key_that_names_no_counter_has_no_ladder() {
    assert_eq!(starreach_core::rungs_crossed("no_such_counter", 0, 10), None);
    assert_eq!(ladder_standing("no_such_counter", 0), None);
}

#[test]
fn the_ladder_over_json() {
    assert_eq!(rungs_crossed_json("enemies_destroyed", 15, 120).unwrap(), "[20,50,100]");
    assert_eq!(ladder_standing_json("enemies_destroyed", 5).unwrap(), r#"{"reached":null,"next":10}"#);
    assert_eq!(ladder_standing_json("docks", 7).unwrap(), r#"{"reached":5,"next":10}"#);
    assert_eq!(rungs_crossed_json("no_such_counter", 0, 10), None);
}
