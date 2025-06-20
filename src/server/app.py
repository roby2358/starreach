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
import threading
from pathlib import Path
from typing import Dict, Optional, List, Tuple
import uuid
from datetime import datetime

class GameSession:
    def __init__(self, session_id: str):
        self.session_id = session_id
        self.game = Game()
        self.players = set()  # Track connected players
        self.created_at = datetime.now()

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
            session.players.add(session_id)
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
            return {"scan": session.game.galaxy.long_range_scan(session.game.sector_yx)}

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
    def _print_endpoints():
        """Print available HTTP endpoints"""
        print("HTTP endpoints available at: http://localhost:8000")
        print("Health check: http://localhost:8000/health")
        print("Config: http://localhost:8000/config")
        print("State: http://localhost:8000/state")

    def run_http_server(self):
        """Run the HTTP server in the current thread"""
        self._print_endpoints()
        uvicorn.run(self.http_app, host="0.0.0.0", port=8000, log_level="info")

    def start_http_server_thread(self):
        """Start the HTTP server in a background thread"""
        self._print_endpoints()
        self.http_thread = threading.Thread(target=self.run_http_server, daemon=True)
        self.http_thread.start()

    def run_streamable(self):
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
        
        uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")

    def run_stdio(self):
        """Run the MCP server in stdio mode with HTTP endpoints"""
        print("Starting MCP server in stdio mode with HTTP endpoints...")
        self.start_http_server_thread()
        self.mcp.run()

# Create the MCP server using the OFFICIAL SDK
# Remove stateless_http=True to enable session-based communication
mcp = FastMCP("Starreach")

def run_app():
    # Parse command line arguments
    parser = argparse.ArgumentParser(description='Run the Starreach MCP server')
    parser.add_argument('--stream', action='store_true', help='Run in streamable HTTP mode instead of stdio')
    parser.add_argument('--host', default='0.0.0.0', help='Host to bind the server to')
    parser.add_argument('--port', type=int, default=8000, help='Port to bind the server to')
    parser.add_argument('--log-level', default='info', choices=['debug', 'info', 'warning', 'error'], help='Logging level')
    args = parser.parse_args()

    server = StarreachServer(mcp)
    if args.stream:
        server.run_streamable()
    else:
        server.run_stdio()

if __name__ == "__main__":
    run_app()