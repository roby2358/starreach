# FINAL WORKING SOLUTION - Use the official MCP SDK with proper stateless config
from mcp.server.fastmcp import FastMCP
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route
from starlette.middleware.cors import CORSMiddleware
from starlette.applications import Starlette
from src.models.game import Game, GameState
from typing import TypedDict
import uvicorn
import argparse
import threading
import os
from pathlib import Path

# Create a global game instance
current_game = Game()

# Define project root and public directory paths
PROJECT_ROOT = Path(__file__).parent.parent.parent
PUBLIC_DIR = PROJECT_ROOT / 'public'

class GameState(TypedDict):
    ship_max_hull: int
    ship_hull: int
    ship_x: int
    ship_y: int
    star_count: int
    base_count: int
    enemy_count: int
    map: list[list[str]]

class StarreachServer:
    def __init__(self, mcp_instance: FastMCP):
        self.mcp = mcp_instance
        self.game = current_game  # Use the global game instance
        self.http_app = self._create_http_app()
        self.http_thread = None
        
        # Register MCP tools and resources
        self._register_mcp_handlers()

    def _register_mcp_handlers(self):
        """Register MCP tools and resources"""
        @self.mcp.tool()
        async def echo(message: str) -> str:
            """Echo back the provided message"""
            return f"Echo: {message}"

        @self.mcp.tool()
        async def state() -> GameState:
            """Get the current game state including ship hull information"""
            return current_game.state

        @self.mcp.tool()
        async def subwarp(x: int, y: int) -> dict:
            """Move the ship point by point towards the destination coordinates"""
            final_x, final_y = current_game.sector.subwarp(x, y)
            return {
                "final_x": final_x,
                "final_y": final_y,
                "state": current_game.state
            }

        @self.mcp.resource("test://instructions")
        async def instructions() -> str:
            """Get instructions for displaying the sector"""
            instructions_path = PUBLIC_DIR / 'instructions.txt'
            with open(instructions_path, 'r') as f:
                return f.read().strip()

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
                "prompts": False
            }
        })

    async def get_state(self, request: Request) -> JSONResponse:
        """Return the current game state"""
        return JSONResponse(self.game.state)

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

# Create the MCP server using the OFFICIAL SDK with stateless_http=True
# This is the KEY - stateless_http=True disables session requirements
mcp = FastMCP("Starreach", stateless_http=True)

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