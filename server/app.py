from starlette.applications import Starlette
from starlette.responses import JSONResponse
from starlette.routing import Route
from starlette.staticfiles import StaticFiles
from fastmcp import FastMCP
import os
import json
from starlette.middleware.cors import CORSMiddleware

# MCP Server Setup (FastMCP) - Create this first
mcp = FastMCP("Game API")

# Game state storage (in a real app, this would be a database)
game_state = {"state": "initial", "players": [], "score": 0}

@mcp.resource("state://game")
def get_game_state() -> str:
    """Get the current game state"""
    return json.dumps(game_state)

@mcp.resource("state://game/players")
def get_players() -> str:
    """Get the list of players"""
    return json.dumps({"players": game_state["players"]})

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

@mcp.tool()
def add_player(player_name: str) -> str:
    """Add a new player to the game"""
    global game_state
    if player_name not in game_state["players"]:
        game_state["players"].append(player_name)
        return f"Player '{player_name}' added successfully. Current players: {game_state['players']}"
    else:
        return f"Player '{player_name}' already exists in the game"

@mcp.tool()
def update_score(points: int) -> str:
    """Update the game score"""
    global game_state
    game_state["score"] += points
    return f"Score updated by {points} points. Current score: {game_state['score']}"

# HTTP API Setup (Starlette) - Create the main app
async def homepage(request):
    return JSONResponse({"message": "Welcome to the Game API"})

async def health(request):
    return JSONResponse({"status": "ok"})

# Create the MCP ASGI app first - this contains the /mcp endpoint internally
mcp_app = mcp.http_app()

# Create the main Starlette application
app = Starlette(
    routes=[
        Route("/", homepage),
        Route("/health", health)
    ],
    lifespan=mcp_app.lifespan,  # Important: Use MCP app's lifespan
)

# Add CORS middleware to allow all origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files
public_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'public')
if os.path.exists(public_dir):
    app.mount("/static", StaticFiles(directory=public_dir), name="static")

# Mount the MCP server as a sub-application
# The MCP app already has /mcp endpoint built-in, so we mount the whole app
app.mount("/mcp", mcp_app)

def run_app():
    """Main function to run the combined server"""
    print("Starting Starreach combined service application...")
    print("HTTP API available at: http://localhost:8000")
    print("Health check available at: http://localhost:8000/health")
    print("MCP Server available at: http://localhost:8000/mcp/mcp")
    print("Press Ctrl+C to stop the server")

    import uvicorn
    try:
        uvicorn.run(app, host="0.0.0.0", port=8000)
    except KeyboardInterrupt:
        print("\nShutting down server...")

# This allows the file to be run directly as well
if __name__ == "__main__":
    run_app()