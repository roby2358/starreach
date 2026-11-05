# Run the test suite
cc-test *args:
    venv_linux/bin/python -m pytest {{args}}

# Model generation and combat numbers cited as Evidence in docs/RATIONALE.md
cc-model-balance galaxies="2000":
    venv_linux/bin/python tools/model_balance.py {{galaxies}}
