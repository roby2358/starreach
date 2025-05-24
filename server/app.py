# FINAL WORKING SOLUTION - Use the official MCP SDK with proper stateless config
from mcp.server.fastmcp import FastMCP
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route
from starlette.middleware.cors import CORSMiddleware
import uvicorn

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

def run_app():
    # Get the streamable HTTP app from MCP
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

    print("Starting MCP server...")
    print("Health check available at: http://localhost:8000/health")
    print("Config available at: http://localhost:8000/config")
    print("MCP Server available at: http://localhost:8000/mcp")
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")

if __name__ == "__main__":
    run_app()