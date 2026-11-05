---
name: starreach-recipes
description: Project-local just recipes for Starreach (run tests, model balance numbers). Use before running tests or regenerating RATIONALE evidence in this repo.
---

# Starreach recipes

Invoke these recipes; don't call the scripts directly.

| Recipe | What it does |
|---|---|
| `just cc-test [pytest args]` | Runs the pytest suite in `test/` with `venv_linux` (e.g. `just cc-test -q`) |
| `just cc-model-balance [galaxies]` | Prints the modeled generation and combat numbers cited as Evidence in `docs/RATIONALE.md` (default 2000 galaxies) |

Setup: `python3 -m venv venv_linux && venv_linux/bin/pip install -r requirements-dev.txt`.
