---
name: starreach-recipes
description: Project-local just recipes for Starreach (run Python and Rust tests, model balance numbers). Use before running tests or regenerating RATIONALE evidence in this repo.
---

# Starreach recipes

Invoke these recipes; don't call the scripts directly.

| Recipe | What it does |
|---|---|
| `just cc-test [pytest args]` | Runs the Python server's pytest suite in `test/` with `venv_linux` (e.g. `just cc-test -q`) |
| `just cc-test-core [cargo test args]` | Runs the Rust core's rule tests (`core/tests/R-n/`) and the CRITERIA coverage test (e.g. `just cc-test-core --test rules r_9`) |
| `just cc-model-balance [galaxies]` | Prints the modeled generation and combat numbers cited as Evidence in `docs/RATIONALE.md` (default 2000 galaxies) |

A new rule test goes in `core/tests/R-n/<what_it_checks>.rs`, gets a `#[path]` module line
in `core/tests/rules.rs`, and its CRITERIA row becomes `automated`. The coverage test fails
if any of the three is missing.

Setup: `python3 -m venv venv_linux && venv_linux/bin/pip install -r requirements-dev.txt`.
