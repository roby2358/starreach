# FINAL WORKING SOLUTION - Use the official MCP SDK with proper stateless config
from mcp.server.fastmcp import FastMCP
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route
from starlette.middleware.cors import CORSMiddleware
import uvicorn
import sys
import argparse

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

async def health_check(request: Request) -> JSONResponse:
    return JSONResponse({"status": "ok"})

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

async def get_state(request: Request) -> JSONResponse:
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

def run_stdio():
    """Run the MCP server in stdio mode"""
    print("Starting MCP server in stdio mode...")
    # app = mcp.stdio_app()
    # app.run()
    mcp.run()

def run_streamable():
    """Run the MCP server in streamable HTTP mode"""
    app = mcp.streamable_http_app()

    # Add your custom routes directly to the MCP app
    app.router.routes.insert(0, Route("/health", health_check))
    app.router.routes.insert(0, Route("/config", config_check))
    app.router.routes.insert(0, Route("/state", get_state))

    # Add CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    print("Starting MCP server in HTTP mode...")
    print("Health check available at: http://localhost:8000/health")
    print("Config available at: http://localhost:8000/config")
    print("MCP Server available at: http://localhost:8000/mcp")
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")

def run_app():
    # Parse command line arguments
    parser = argparse.ArgumentParser(description='Run the Starreach MCP server')
    parser.add_argument('--stream', action='store_true', help='Run in streamable HTTP mode instead of stdio')
    args = parser.parse_args()

    if args.stream:
        run_streamable()
    else:
        run_stdio()

if __name__ == "__main__":
    run_app()