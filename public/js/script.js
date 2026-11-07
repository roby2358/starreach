// The main viewer (ONTOLOGY "Client contract"): draws the frames that arrive on the game's
// socket. It sends nothing, so it can't change the game.
(function () {
    const GRID_SIZE = 10;
    const RECONNECT_MIN_MS = 1000;
    const RECONNECT_MAX_MS = 15000;
    const GAME_NOT_FOUND_CLOSE = 4404;
    const LOW_GAUGE_FRACTION = 0.25;

    const GAUGES = [
        { label: "Hull", value: "hull", max: "max_hull" },
        { label: "Shields", value: "shields", max: "max_shields" },
        { label: "Energy", value: "energy", max: "max_energy" },
        { label: "Quantorpedoes", value: "quantorpedoes", max: "max_quantorpedoes" },
    ];

    /** What each character of the board's map draws. An empty cell draws nothing. */
    const OCCUPANTS = {
        ".": { className: null, name: "empty" },
        S: { className: "ship", name: "ship" },
        E: { className: "enemy", name: "enemy" },
        B: { className: "starbase", name: "starbase" },
        "*": { className: "star", name: "star" },
    };

    const OUTCOMES = {
        playing: null,
        won: "Every enemy destroyed. The galaxy is secure.",
        lost: "The ship is lost.",
    };

    const LINKS = {
        connecting: { text: "Hailing", notice: "Hailing the ship..." },
        live: { text: "Live", notice: null },
        lost: { text: "Signal lost", notice: null },
        absent: { text: "No ship", notice: null },
    };

    const NO_GAME_NOTICE = "No ship on this channel. Ask your ship's computer for the main viewer link.";
    const NOT_FOUND_NOTICE = "This ship isn't on record. A local server forgets its games when it restarts, so ask your ship's computer to start a new game.";

    const byId = (id) => document.getElementById(id);
    const drawn = { sectors: [], board: [], gauges: {}, marker: null, previous: null };

    function element(className) {
        const node = document.createElement("div");
        node.className = className;
        return node;
    }

    function axisLabel(text) {
        const node = element("axis");
        node.textContent = text;
        return node;
    }

    /** Fills a map with its axis labels and cells, and returns the cells as `[y][x]`. */
    function buildGrid(map, cellClass) {
        map.append(axisLabel(""));
        for (let x = 0; x < GRID_SIZE; x++) {
            map.append(axisLabel(x));
        }
        return Array.from({ length: GRID_SIZE }, (_, y) => {
            map.append(axisLabel(y));
            const cells = Array.from({ length: GRID_SIZE }, () => element(cellClass));
            map.append(...cells);
            return cells;
        });
    }

    function buildMaps() {
        drawn.board = buildGrid(byId("board"), "cell");
        drawn.sectors = buildGrid(byId("galaxy"), "sector hidden");
        drawn.marker = element("ship-marker");
        drawn.marker.hidden = true;
        byId("galaxy").append(drawn.marker);
    }

    /** A browser restarts a CSS animation when its hidden panel reappears, so a flash that's
     *  still on a cell would replay every time its tab opens. */
    function clearSectorFlashes() {
        for (const cell of drawn.sectors.flat()) {
            cell.classList.remove("revealed", "struck");
        }
    }

    function showTab(chosen) {
        clearSectorFlashes();
        for (const tab of document.querySelectorAll("[role=tab]")) {
            const selected = tab === chosen;
            tab.setAttribute("aria-selected", String(selected));
            byId(tab.getAttribute("aria-controls")).hidden = !selected;
        }
    }

    function buildTabs() {
        for (const tab of document.querySelectorAll("[role=tab]")) {
            tab.addEventListener("click", () => showTab(tab));
        }
    }

    function buildGauges() {
        for (const gauge of GAUGES) {
            const root = element("gauge");
            root.dataset.gauge = gauge.value;
            const label = element("gauge-label");
            const name = document.createElement("span");
            name.textContent = gauge.label;
            const value = document.createElement("span");
            value.className = "gauge-value";
            label.append(name, value);
            const track = element("gauge-track");
            const fill = element("gauge-fill");
            track.append(fill);
            root.append(label, track);
            byId("gauges").append(root);
            drawn.gauges[gauge.value] = { root, value, fill };
        }
    }

    /** Scatters a sector's stars the same way every time, from its coordinates. */
    function starAt(y, x, index) {
        const star = element("dot");
        const spread = (salt) => (y * 37 + x * 17 + index * salt) % 89 + 5;
        star.style.top = `${spread(53)}%`;
        star.style.left = `${spread(29)}%`;
        return star;
    }

    function sectorLabel(y, x, sector) {
        if (sector === null) {
            return `Sector ${y},${x}: uncharted`;
        }
        return `Sector ${y},${x}: ${sector.enemies} enemies, ${sector.starbases} starbases, ${sector.stars} stars`;
    }

    function drawSectorContents(cell, y, x, sector) {
        const stars = Array.from({ length: sector.stars }, (_, index) => starAt(y, x, index));
        cell.replaceChildren(...stars);
        if (sector.starbases > 0) {
            cell.append(element("starbase"));
        }
        if (sector.enemies > 0) {
            const enemies = element("enemies");
            enemies.textContent = sector.enemies;
            cell.append(enemies);
        }
    }

    /** Replays a one-shot animation, even when the class is already there. */
    function flash(node, className) {
        node.classList.remove(className);
        void node.offsetWidth;
        node.classList.add(className);
    }

    function drawSector(y, x, sector, previous) {
        const cell = drawn.sectors[y][x];
        cell.setAttribute("aria-label", sectorLabel(y, x, sector));
        cell.classList.toggle("hidden", sector === null);
        if (sector === null) {
            return;
        }
        drawSectorContents(cell, y, x, sector);
        if (previous === undefined) {
            return;
        }
        if (previous === null) {
            flash(cell, "revealed");
        } else if (sector.enemies < previous.enemies) {
            flash(cell, "struck");
        }
    }

    function drawGalaxy(view, previous) {
        view.galaxy.forEach((row, y) => row.forEach((sector, x) => {
            drawSector(y, x, sector, previous === null ? undefined : previous.galaxy[y][x]);
        }));
        const [y, x] = view.sector_yx;
        drawn.marker.hidden = false;
        drawn.marker.style.top = `${((y + 1) * 100) / (GRID_SIZE + 1)}%`;
        drawn.marker.style.left = `${((x + 1) * 100) / (GRID_SIZE + 1)}%`;
    }

    function drawBoardCell(cell, y, x, occupant) {
        cell.setAttribute("aria-label", `Cell ${y},${x}: ${occupant.name}`);
        cell.replaceChildren(...(occupant.className === null ? [] : [element(occupant.className)]));
    }

    function drawBoard(board) {
        board.forEach((row, y) => [...row].forEach((character, x) => {
            drawBoardCell(drawn.board[y][x], y, x, OCCUPANTS[character]);
        }));
    }

    function drawGauges(ship, previous) {
        for (const gauge of GAUGES) {
            const { root, value, fill } = drawn.gauges[gauge.value];
            const fraction = ship[gauge.value] / ship[gauge.max];
            value.textContent = `${ship[gauge.value]} / ${ship[gauge.max]}`;
            fill.style.width = `${fraction * 100}%`;
            root.classList.toggle("low", fraction < LOW_GAUGE_FRACTION);
            if (previous !== null && ship[gauge.value] < previous.ship[gauge.value]) {
                flash(root, "dropped");
            }
        }
    }

    function drawSurvey(view) {
        const charted = view.galaxy.flat().filter((sector) => sector !== null);
        const total = (field) => charted.reduce((sum, sector) => sum + sector[field], 0);
        byId("charted").textContent = `${charted.length} / ${GRID_SIZE * GRID_SIZE}`;
        byId("sighted").textContent = total("enemies");
        byId("bases").textContent = total("starbases");
    }

    function drawOutcome(status) {
        const outcome = byId("outcome");
        outcome.hidden = OUTCOMES[status] === null;
        outcome.textContent = OUTCOMES[status];
        outcome.className = `outcome ${status}`;
    }

    function drawView(view) {
        byId("stardate").textContent = view.stardate;
        byId("sector").textContent = `(${view.sector_yx[0]}, ${view.sector_yx[1]})`;
        drawBoard(view.board);
        drawGalaxy(view, drawn.previous);
        drawGauges(view.ship, drawn.previous);
        drawSurvey(view);
        drawOutcome(view.status);
        drawn.previous = view;
    }

    /** One entry per frame `type` on the socket. */
    const FRAMES = { view: (frame) => drawView(frame.view) };

    function setLink(link, notice) {
        document.body.dataset.link = link;
        byId("link").textContent = LINKS[link].text;
        const shown = notice === null ? LINKS[link].notice : notice;
        byId("notice").hidden = shown === null;
        byId("notice").textContent = shown;
    }

    function connect(gameId, delay) {
        const scheme = location.protocol === "https:" ? "wss:" : "ws:";
        const socket = new WebSocket(`${scheme}//${location.host}/live/${gameId}`);
        let nextDelay = delay;
        socket.onmessage = (message) => {
            const frame = JSON.parse(message.data);
            nextDelay = RECONNECT_MIN_MS;
            setLink("live", null);
            FRAMES[frame.type](frame);
        };
        socket.onclose = (closed) => {
            if (closed.code === GAME_NOT_FOUND_CLOSE) {
                setLink("absent", NOT_FOUND_NOTICE);
                return;
            }
            setLink(drawn.previous === null ? "connecting" : "lost", null);
            setTimeout(() => connect(gameId, Math.min(nextDelay * 2, RECONNECT_MAX_MS)), nextDelay);
        };
    }

    function start() {
        buildMaps();
        buildTabs();
        buildGauges();
        const gameId = new URLSearchParams(location.search).get("game");
        if (gameId === null) {
            setLink("absent", NO_GAME_NOTICE);
            return;
        }
        setLink("connecting", null);
        connect(gameId, RECONNECT_MIN_MS);
    }

    start();
})();
