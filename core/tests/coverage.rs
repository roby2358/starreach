//! The coverage test (CRITERIA "Tests"): CRITERIA's Instrument column and the `R-n/` test
//! directories in every package must agree, and every rule test file must be compiled.

use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};

/// Packages that own `R-n/` test directories, relative to the repo root.
const TEST_ROOTS: [&str; 3] = ["core/tests", "app/test", "adapters/node/test"];

fn repo_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap().to_path_buf()
}

/// `(id, instrument)` for every R- and U-row in CRITERIA.md.
fn criteria_rows() -> Vec<(String, String)> {
    let text = fs::read_to_string(repo_root().join("docs/CRITERIA.md")).unwrap();
    text.lines()
        .filter(|line| line.starts_with("| R-") || line.starts_with("| U-"))
        .map(|line| {
            let cells: Vec<&str> = line.trim_matches('|').split(" | ").map(str::trim).collect();
            (cells[0].to_string(), cells.last().unwrap().to_string())
        })
        .collect()
}

fn valid_instrument(instrument: &str) -> bool {
    matches!(instrument, "automated" | "not yet covered" | "retired") || instrument.starts_with("manual — ")
}

/// Each `R-n` directory with at least one file in it, across every package.
fn test_directories() -> BTreeSet<String> {
    let mut found = BTreeSet::new();
    for root in TEST_ROOTS.iter().map(|r| repo_root().join(r)).filter(|r| r.is_dir()) {
        for entry in fs::read_dir(root).unwrap().flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            let has_files = fs::read_dir(entry.path()).map(|mut d| d.next().is_some()).unwrap_or(false);
            if name.starts_with("R-") && has_files {
                found.insert(name);
            }
        }
    }
    found
}

#[test]
fn every_instrument_is_one_of_the_four_forms() {
    for (id, instrument) in criteria_rows() {
        assert!(valid_instrument(&instrument), "{id} has instrument {instrument:?}");
    }
}

#[test]
fn automated_rows_and_test_directories_match() {
    let automated: BTreeSet<String> = criteria_rows()
        .into_iter()
        .filter(|(id, instrument)| id.starts_with("R-") && instrument == "automated")
        .map(|(id, _)| id)
        .collect();
    let directories = test_directories();
    let missing: Vec<_> = automated.difference(&directories).collect();
    let orphaned: Vec<_> = directories.difference(&automated).collect();
    assert!(missing.is_empty(), "automated rows with no test directory: {missing:?}");
    assert!(orphaned.is_empty(), "test directories whose row isn't automated: {orphaned:?}");
}

#[test]
fn every_core_rule_test_file_is_compiled() {
    let tests = repo_root().join("core/tests");
    let aggregator = fs::read_to_string(tests.join("rules.rs")).unwrap();
    for dir in fs::read_dir(&tests).unwrap().flatten().filter(|e| e.file_name().to_string_lossy().starts_with("R-")) {
        for file in fs::read_dir(dir.path()).unwrap().flatten() {
            let relative = format!("{}/{}", dir.file_name().to_string_lossy(), file.file_name().to_string_lossy());
            assert!(aggregator.contains(&format!("#[path = \"{relative}\"]")), "{relative} is not in rules.rs");
        }
    }
}
