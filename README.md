This game takes the form of a web server that supports both an HTTP API using Starlette as well as an Model Context Protocol (MCP) API using FastMCP. A browser UI built on HTML, css, and jquery provides a view into the state of the game, while the MCP API allows a Large Language Model (LLM) to interact with the game to retrive state and take actions. The intent is the player interacts with the came through the LLM rather than through the web UI.

## Design docs

The game design lives in `docs/`:

- `docs/ONTOLOGY.md`: what exists, the rules, the numbers, and the MCP/HTTP interface (the implementation reference)
- `docs/CRITERIA.md`: how each rule is checked
- `docs/RATIONALE.md`: why each choice was made, and open questions
- `docs/DYNAMICS.md`: why it's fun
- `docs/ARCHITECTURE_LOG.md`: dated history of design changes

## Run in Claude Desktop

Provide the full path to the venv python and the launcher

  "mcpServers": {
    "starreach": {
      "command": "C:/work/starreach/venv/Scripts/python.exe",
      "args": ["C:/work/starreach/starreach.py"]
    }
  }

## How to Launch and View the Game

1. **Set Up the Environment:**
   - Create a virtual environment:
     ```bash
     python -m venv venv
     ```
   - Activate the virtual environment:
     - On Windows:
       ```bash
       venv\Scripts\activate
       ```
     - On macOS/Linux:
       ```bash
       source venv/bin/activate
       ```
   - Install the dependencies:
     ```bash
     pip install -r requirements.txt
     ```

2. **Start the Servers:**
   - Run the following command in the root directory to start both the HTTP and MCP servers:
     ```bash
     python starreach.py
     ```
   - The HTTP server will be available at `http://localhost:8000`, and the MCP server at `http://localhost:8001`.

3. **View the Game UI:**
   - Open your web browser and navigate to `http://localhost:8000/static/index.html`.
   - The game state will be displayed on the page.