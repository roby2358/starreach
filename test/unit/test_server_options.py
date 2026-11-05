"""Command-line options reach the server (not a game rule, so it lives in unit/)."""
import pytest

from src.server import app
from src.server.app import ServerOptions, StarreachServer, parse_options


def test_no_arguments_gives_stdio_on_all_interfaces_port_8000():
    assert parse_options([]) == ServerOptions(stream=False, host="0.0.0.0", port=8000, log_level="info")


def test_each_argument_is_parsed():
    options = parse_options(["--stream", "--host", "127.0.0.1", "--port", "9001", "--log-level", "debug"])
    assert options == ServerOptions(stream=True, host="127.0.0.1", port=9001, log_level="debug")


def test_unknown_log_level_is_rejected():
    with pytest.raises(SystemExit):
        parse_options(["--log-level", "verbose"])


def test_http_server_runs_on_the_configured_host_port_and_log_level(monkeypatch):
    calls = []
    monkeypatch.setattr(app.uvicorn, "run", lambda asgi_app, **kwargs: calls.append(kwargs))
    server = StarreachServer(app.FastMCP("test"))

    server.run_http_server(ServerOptions(stream=False, host="127.0.0.1", port=9001, log_level="warning"))

    assert calls == [{"host": "127.0.0.1", "port": 9001, "log_level": "warning"}]
