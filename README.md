This game takes the form of a web server that supports both an HTTP API using Starlette as well as an Model Context Protocol (MCP) API using FastMCP. A browser UI built on HTML, css, and jquery provides a view into the state of the game, while the MCP API allows a Large Language Model (LLM) to interact with the game to retrive state and take actions. The intent is the player interacts with the came through the LLM rather than through the web UI.

## Game Mechanics

The game is a galaxy search and battle game. The Universe is divided into 10x10 sectors, each represented by a 10x10 grid. The player controls a ship that can warp between sectors and use impulse to move within a sector. Each sector contains 0-7 stars, which are intraversable; navigating into a star ends the player's game. The player begins their journey at Star Central, located at point [4,4:5,5].

Rev 1
Displaying the current sector and surrounding sector, and providing the initial connection through the MCP server is all we need.

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