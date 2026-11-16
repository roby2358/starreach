//! R-38: every kind of Star Central message has exactly 20 distinct wordings, each carrying
//! every placeholder of its kind; a message is a wording with its placeholders filled, picked
//! by the caller's roll.
use std::collections::HashSet;

use starreach_core::messages::{
    compose, lifetime_kind, message_kind, LIFETIME_COMMENDATION, LIFETIME_NOTORIETY, MESSAGE_TABLE, WORDINGS_PER_KIND,
};
use starreach_core::{commendation, counter_table};

/// The roll that picks wording `index`: the middle of its twentieth.
fn roll_for(index: usize) -> f64 {
    (index as f64 + 0.5) / WORDINGS_PER_KIND as f64
}

#[test]
fn every_kind_has_exactly_twenty_distinct_wordings() {
    assert_eq!(WORDINGS_PER_KIND, 20);
    for kind in &MESSAGE_TABLE {
        let distinct: HashSet<&str> = kind.wordings.iter().copied().collect();
        assert_eq!(distinct.len(), 20, "{}", kind.key);
    }
}

#[test]
fn kinds_are_keyed_by_distinct_names() {
    let keys: HashSet<&str> = MESSAGE_TABLE.iter().map(|kind| kind.key).collect();
    assert_eq!(keys.len(), MESSAGE_TABLE.len());
    assert!(MESSAGE_TABLE.iter().all(|kind| message_kind(kind.key).unwrap().key == kind.key));
    assert!(message_kind("no_such_kind").is_none());
}

#[test]
fn every_wording_carries_each_placeholder_of_its_kind_once_and_no_other() {
    for kind in &MESSAGE_TABLE {
        for wording in kind.wordings {
            let mut rest = wording.to_string();
            for name in kind.placeholders {
                let placeholder = format!("{{{name}}}");
                assert_eq!(wording.matches(&placeholder).count(), 1, "{placeholder} in {wording:?}");
                rest = rest.replace(&placeholder, "");
            }
            assert!(!rest.contains('{') && !rest.contains('}'), "another placeholder in {wording:?}");
        }
    }
}

#[test]
fn every_wording_fills_its_placeholders() {
    for kind in &MESSAGE_TABLE {
        let values: Vec<(&str, &str)> = kind.placeholders.iter().map(|name| (*name, "VALUE")).collect();
        for index in 0..WORDINGS_PER_KIND {
            let message = compose(kind.key, roll_for(index), &values).unwrap();
            assert!(!message.contains('{') && !message.contains('}'), "{message:?}");
            assert_eq!(message.matches("VALUE").count(), kind.placeholders.len(), "{message:?}");
        }
    }
}

#[test]
fn the_roll_picks_the_wording_and_the_same_roll_picks_the_same_one() {
    let values = [("amount", "5000"), ("label", "enemies destroyed")];
    let picked: HashSet<String> =
        (0..WORDINGS_PER_KIND).map(|index| compose(LIFETIME_COMMENDATION, roll_for(index), &values).unwrap()).collect();
    assert_eq!(picked.len(), WORDINGS_PER_KIND);
    assert_eq!(compose(LIFETIME_COMMENDATION, 0.3, &values), compose(LIFETIME_COMMENDATION, 0.3, &values));
    assert_eq!(
        compose(LIFETIME_COMMENDATION, 0.0, &values).unwrap(),
        "Star Central to captain: commendation. Your lifetime tally of enemies destroyed has reached 5000."
    );
}

#[test]
fn a_roll_outside_zero_to_one_still_picks_a_wording() {
    let values = [("amount", "1"), ("label", "docks at a starbase")];
    assert_eq!(compose(LIFETIME_COMMENDATION, 1.0, &values), compose(LIFETIME_COMMENDATION, roll_for(19), &values));
    assert_eq!(compose(LIFETIME_COMMENDATION, -0.5, &values), compose(LIFETIME_COMMENDATION, 0.0, &values));
}

#[test]
fn a_missing_value_or_an_unknown_kind_gives_no_message() {
    assert_eq!(compose(LIFETIME_COMMENDATION, 0.0, &[("amount", "5")]), None);
    assert_eq!(compose("no_such_kind", 0.0, &[("amount", "5"), ("label", "docks")]), None);
}

#[test]
fn every_message_is_from_star_central() {
    for kind in &MESSAGE_TABLE {
        assert!(kind.wordings.iter().all(|wording| wording.starts_with("Star Central")), "{}", kind.key);
    }
}

#[test]
fn a_positive_counter_earns_a_commendation_and_a_negative_one_notoriety() {
    for row in counter_table() {
        let expected = if row.may_be_goal { LIFETIME_COMMENDATION } else { LIFETIME_NOTORIETY };
        assert_eq!(lifetime_kind(row), expected, "{}", row.key);
    }
}

#[test]
fn a_commendation_names_the_counters_label_and_the_amount_in_a_wording_of_its_kind() {
    for row in counter_table() {
        let kind = message_kind(lifetime_kind(row)).unwrap();
        for index in 0..WORDINGS_PER_KIND {
            let message = commendation(row.key, 5000, roll_for(index)).unwrap();
            let expected = kind.wordings[index].replace("{amount}", "5000").replace("{label}", row.label);
            assert_eq!(message, expected);
        }
    }
    assert_eq!(commendation("no_such_counter", 5000, 0.0), None);
}
