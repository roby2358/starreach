# Run the Python server's test suite
cc-test *args:
    venv_linux/bin/python -m pytest {{args}}

# Run the Rust core's rule tests and the CRITERIA coverage test
cc-test-core *args:
    cargo test --manifest-path core/Cargo.toml {{args}}

# Model generation and combat numbers cited as Evidence in docs/RATIONALE.md
cc-model-balance galaxies="2000":
    venv_linux/bin/python tools/model_balance.py {{galaxies}}
