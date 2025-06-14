# FINAL WORKING SOLUTION - Use the official MCP SDK with proper stateless config
from mcp.server.fastmcp import FastMCP
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route
from starlette.middleware.cors import CORSMiddleware
from starlette.applications import Starlette
import uvicorn
import sys
import argparse
import threading

class StarreachServer:
    def __init__(self, mcp_instance: FastMCP):
        self.mcp = mcp_instance
        self.http_app = self._create_http_app()
        self.http_thread = None

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

    async def health_check(self, request: Request) -> JSONResponse:
        return JSONResponse({"status": "ok"})

    async def config_check(self, request: Request) -> JSONResponse:
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
        """Return arbitrary game state"""
        game_state = {
            "player": {
                "name": "StarReach Commander",
                "level": 42,
                "health": 100,
                "position": {"x": 150, "y": 200, "z": 50}
            },
            "ship": {
                "name": "USS Enterprise",
                "hull_integrity": 95,
                "shields": 80,
                "fuel": 75
            },
            "mission": {
                "current": "Explore Nebula X-7",
                "status": "in_progress",
                "objectives_complete": 3,
                "objectives_total": 7
            },
            "timestamp": "2024-12-20T15:30:45Z",
            "game_time": "Day 15, Hour 22"
        }
        return JSONResponse(game_state)

    def _print_endpoints(self):
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
        
        # Add our routes to the MCP app
        for route in self.http_app.routes:
            app.router.routes.insert(0, route)
        
        # Add CORS middleware
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

@mcp.tool()
async def echo(message: str) -> str:
    """Echo back the provided message"""
    return f"Echo: {message}"

@mcp.resource("test://example")
async def get_example_resource() -> str:
    """Get an example resource"""
    return "This is an example resource"

def run_app():
    # Parse command line arguments
    parser = argparse.ArgumentParser(description='Run the Starreach MCP server')
    parser.add_argument('--stream', action='store_true', help='Run in streamable HTTP mode instead of stdio')
    args = parser.parse_args()

    server = StarreachServer(mcp)
    if args.stream:
        server.run_streamable()
    else:
        server.run_stdio()

if __name__ == "__main__":
    run_app()