# FINAL WORKING SOLUTION - Use the official MCP SDK with proper stateless config
from mcp.server.fastmcp import FastMCP
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route
from starlette.middleware.cors import CORSMiddleware
from starlette.applications import Starlette
from src.models.game import Game, GameState
import uvicorn
import argparse
import sys
import threading
from pathlib import Path
from typing import Dict, Optional, List, Tuple
from dataclasses import dataclass
import uuid

class GameSession:
    def __init__(self, session_id: str):
        self.session_id = session_id
        self.game = Game()

class GameManager:
    def __init__(self):
        self.sessions: Dict[str, GameSession] = {}
        
    def create_session(self) -> str:
        session_id = str(uuid.uuid4())
        self.sessions[session_id] = GameSession(session_id)
        return session_id
        
    def create_session_with_id(self, session_id: str) -> str:
        """Create a session with a specific ID"""
        self.sessions[session_id] = GameSession(session_id)
        return session_id
        
    def get_session(self, session_id: str) -> Optional[GameSession]:
        return self.sessions.get(session_id)
        
    def remove_session(self, session_id: str) -> None:
        if session_id in self.sessions:
            del self.sessions[session_id]

# Create a global game manager instance
game_manager = GameManager()

# Define project root and public directory paths
PROJECT_ROOT = Path(__file__).parent.parent.parent
PUBLIC_DIR = PROJECT_ROOT / 'public'

@dataclass(frozen=True)
class ServerOptions:
    """Command-line options for running the server"""
    stream: bool
    host: str
    port: int
    log_level: str


class StarreachServer:
    def __init__(self, mcp_instance: FastMCP):
        self.mcp = mcp_instance
        self.game_manager = game_manager
        self.http_app = self._create_http_app()
        self.http_thread = None
        
        # Register MCP tools and resources
        self._register_mcp_handlers()

    def _register_mcp_handlers(self):
        """Register MCP tools and resources"""

        @self.mcp.prompt("instructions")
        async def instructions() -> str:
            """Get instructions for displaying the sector"""
            instructions_path = PUBLIC_DIR / 'instructions.txt'
            with open(instructions_path, 'r') as f:
                return f.read().strip()

        @self.mcp.tool()
        async def create_game() -> dict:
            """Start a new single-player game session and join it automatically"""
            session_id = self.game_manager.create_session()
            session = self.game_manager.get_session(session_id)
            return {
                "message": "Single player game started successfully",
                "session_id": session_id,
                "state": session.game.state
            }

        @self.mcp.tool()
        async def state(session_id: str) -> GameState:
            """Get the current game state for a specific session"""
            session = self.game_manager.get_session(session_id)
            if not session:
                raise ValueError("Game session not found")
            return session.game.state

        @self.mcp.tool()
        async def subwarp(session_id: str, y: int, x: int) -> dict:
            """Move the ship in a specific game session"""
            session = self.game_manager.get_session(session_id)
            if not session:
                raise ValueError("Game session not found")
            movement_result = session.game.subwarp(y, x)
            return {
                "movement": movement_result,
                "state": session.game.state
            }

        @self.mcp.tool()
        async def galaxy_map(session_id: str) -> dict:
            """Get the complete 10x10 galaxy map for a specific session (enemies, starbases, stars)"""
            session = self.game_manager.get_session(session_id)
            if not session:
                raise ValueError("Game session not found")
            return {"map": session.game.galaxy.galaxy_map()}

        @self.mcp.tool()
        async def long_range_scan(session_id: str) -> dict:
            """Get a 3x3 scan around the current sector position for a specific session (enemies, starbases, stars)"""
            session = self.game_manager.get_session(session_id)
            if not session:
                raise ValueError("Game session not found")
            return session.game.long_range_scan()

        @self.mcp.tool()
        async def galaxy_warp(session_id: str, y: int, x: int) -> dict:
            """Warp the ship to a new sector at coordinates (y, x) for a specific session"""
            session = self.game_manager.get_session(session_id)
            if not session:
                raise ValueError("Game session not found")
            
            movement_result = session.game.warp(y, x)
            
            return {
                "movement": movement_result,
                "state": session.game.state
            }

        @self.mcp.tool()
        async def dock(session_id: str) -> dict:
            """Attempt to dock with a starbase in the current sector for a specific session"""
            session = self.game_manager.get_session(session_id)
            if not session:
                raise ValueError("Game session not found")
            
            dock_result = session.game.dock()
            
            return {
                "dock": dock_result,
                "state": session.game.state
            }

        @self.mcp.tool()
        async def blast(session_id: str, y: int, x: int) -> dict:
            """Fire a blaston beam at coordinates (y, x) in a specific game session"""
            session = self.game_manager.get_session(session_id)
            if not session:
                raise ValueError("Game session not found")
            
            blast_result = session.game.blast(y, x)
            
            return {
                "blast": blast_result,
                "state": session.game.state
            }

        @self.mcp.tool()
        async def torpedo(session_id: str, y: int, x: int) -> dict:
            """Fire a quantorpedo at coordinates (y, x) in a specific game session"""
            session = self.game_manager.get_session(session_id)
            if not session:
                raise ValueError("Game session not found")
            
            torpedo_result = session.game.torpedo(y, x)
            
            return {
                "torpedo": torpedo_result,
                "state": session.game.state
            }

    def _create_http_app(self) -> Starlette:
        """Create and configure the HTTP application"""
        app = Starlette(routes=[
            Route("/health", self.health_check),
            Route("/config", self.config_check),
            Route("/state", self.get_state)
        ])
        
        app.add_middleware(
            CORSMiddleware,
            allow_origins=["*"],
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )
        return app

    @staticmethod
    async def health_check(request: Request) -> JSONResponse:
        return JSONResponse({"status": "ok"})

    @staticmethod
    async def config_check(request: Request) -> JSONResponse:
        return JSONResponse({
            "name": "Starreach",
            "version": "1.0.0",
            "mcp": {
                "endpoint": "/mcp",
                "transport": "streamable-http"
            },
            "capabilities": {
                "tools": True,
                "resources": True,
                "prompts": True
            }
        })

    async def get_state(self, request: Request) -> JSONResponse:
        """Return the current game state"""
        # For HTTP endpoint, use a default session or create one
        default_session_id = "default"
        session = self.game_manager.get_session(default_session_id)
        if not session:
            # Create a default session for the HTTP endpoint
            self.game_manager.create_session_with_id(default_session_id)
            session = self.game_manager.get_session(default_session_id)
        
        return JSONResponse(session.game.state)

    @staticmethod
    def _print_endpoints(options: ServerOptions):
        """Print available HTTP endpoints"""
        base_url = f"http://localhost:{options.port}"
        print(f"HTTP endpoints available at: {base_url}")
        print(f"Health check: {base_url}/health")
        print(f"Config: {base_url}/config")
        print(f"State: {base_url}/state")

    @staticmethod
    def _serve(app, options: ServerOptions):
        """Run an ASGI app with uvicorn on the configured host, port and log level"""
        uvicorn.run(app, host=options.host, port=options.port, log_level=options.log_level)

    def run_http_server(self, options: ServerOptions):
        """Run the HTTP server in the current thread"""
        self._print_endpoints(options)
        self._serve(self.http_app, options)

    def start_http_server_thread(self, options: ServerOptions):
        """Start the HTTP server in a background thread"""
        self.http_thread = threading.Thread(target=self.run_http_server, args=(options,), daemon=True)
        self.http_thread.start()

    def run_streamable(self, options: ServerOptions):
        """Run the MCP server in streamable HTTP mode"""
        print("Starting MCP server in HTTP mode...")
        app = self.mcp.streamable_http_app()

        for route in self.http_app.routes:
            app.router.routes.insert(0, route)

        app.add_middleware(
            CORSMiddleware,
            allow_origins=["*"],
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

        self._serve(app, options)

    def run_stdio(self, options: ServerOptions):
        """Run the MCP server in stdio mode with HTTP endpoints"""
        print("Starting MCP server in stdio mode with HTTP endpoints...")
        self.start_http_server_thread(options)
        self.mcp.run()


def parse_options(argv: List[str]) -> ServerOptions:
    """Parse command-line arguments into ServerOptions"""
    parser = argparse.ArgumentParser(description='Run the Starreach MCP server')
    parser.add_argument('--stream', action='store_true', help='Run in streamable HTTP mode instead of stdio')
    parser.add_argument('--host', default='0.0.0.0', help='Host to bind the server to')
    parser.add_argument('--port', type=int, default=8000, help='Port to bind the server to')
    parser.add_argument('--log-level', default='info', choices=['debug', 'info', 'warning', 'error'], help='Logging level')
    args = parser.parse_args(argv)
    return ServerOptions(stream=args.stream, host=args.host, port=args.port, log_level=args.log_level)

# Create the MCP server using the OFFICIAL SDK
# Remove stateless_http=True to enable session-based communication
mcp = FastMCP("Starreach")

def run_app():
    options = parse_options(sys.argv[1:])
    server = StarreachServer(mcp)
    if options.stream:
        server.run_streamable(options)
    else:
        server.run_stdio(options)

if __name__ == "__main__":
    run_app()
