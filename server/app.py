from starlette.applications import Starlette
from starlette.responses import JSONResponse
from starlette.routing import Route, Mount
from starlette.staticfiles import StaticFiles
from fastmcp import FastMCP
import os
import json
from starlette.middleware.cors import CORSMiddleware
import uvicorn

# Create the MCP server with proper configuration
mcp = FastMCP("Game API")

# Game state storage (in a real app, this would be a database)
game_state = {"state": "initial", "score": 0}

@mcp.resource("state://game")
def get_game_state() -> str:
    """Get the current game state map"""
    return json.dumps(game_state)

@mcp.tool()
def update_game_state(new_state: str) -> str:
    """Update the game state"""
    global game_state
    try:
        # Parse the new state
        parsed_state = json.loads(new_state)
        game_state.update(parsed_state)
        return f"Game state updated successfully: {json.dumps(game_state)}"
    except json.JSONDecodeError:
        return f"Error: Invalid JSON format for state update"

# HTTP API Setup (Starlette) - Create the main app
async def health(request):
    return JSONResponse({"status": "ok"})

async def config(request):
    """Config endpoint that some MCP clients might expect"""
    return JSONResponse({
        "name": "Game API",
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

def run_with_starlette():
    """Approach using Starlette integration with CORS support"""
    try:
        # Create the MCP app - this creates the FastMCP ASGI app
        # The MCP endpoint will be available at the path specified (default is /mcp)
        mcp_app = mcp.http_app()
        print(f"Created MCP app: {mcp_app}")
        print(f"MCP app lifespan: {mcp_app.lifespan}")
    except AttributeError as e:
        print(f"Error creating MCP app: {e}")
        return

    # Create routes list
    routes = [
        Route("/health", health),
        Route("/config", config),
        # Mount the MCP app directly at /mcp
        Mount("/mcp", mcp_app),
    ]

    # Add static files if directory exists
    # Serve static files at "/game"
    public_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'public')
    if os.path.exists(public_dir):
        routes.append(Mount("/game", StaticFiles(directory=public_dir, html=True), name="public"))
        print(f"Added static files mount at /game for directory: {public_dir}")

    # Create the main Starlette application
    # CRITICAL: Pass the lifespan from the MCP app to the main app
    app = Starlette(
        routes=routes,
        lifespan=mcp_app.lifespan  # This is crucial for FastMCP to work properly
    )

    # Add CORS middleware to allow all origins (important for web clients)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    try:
        print("Starting server with proper MCP integration...")
        print("Debug: Available routes:")
        for route in routes:
            if hasattr(route, 'path'):
                print(f"  - {route.path}")
            else:
                print(f"  - {route}")
        print(f"MCP Server will be available at: http://localhost:8000/mcp")
        uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
    except KeyboardInterrupt:
        print("\nShutting down server...")

def run_app():
    """Main function to run the combined server"""
    print("Starting Starreach combined service application...")
    print("HTTP API available at: http://localhost:8000")
    print("Health check available at: http://localhost:8000/health")
    print("Config available at: http://localhost:8000/config")
    print("MCP Server available at: http://localhost:8000/mcp")
    print("Static files available at: http://localhost:8000/game")
    print("Press Ctrl+C to stop the server")

    # Since we need custom endpoints AND CORS, we must use the Starlette integration
    run_with_starlette()

# This allows the file to be run directly
if __name__ == "__main__":
    run_app()