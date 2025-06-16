from fastmcp import FastMCP

mcp = FastMCP()

@mcp.route("/state")
async def get_state():
    # Placeholder for game state retrieval
    return {"state": "initial"}

if __name__ == "__main__":
    mcp.run(host="0.0.0.0", port=8001) 