// The main viewer (ONTOLOGY "Client contract"): draws the frames that arrive on the game's
// socket. It sends nothing, so it can't change the game.
(function () {
    const GALAXY_SIZE = 10;
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
    const drawn = { cells: [], gauges: {}, marker: null, previous: null };

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

    function buildGalaxy() {
        const galaxy = byId("galaxy");
        galaxy.append(axisLabel(""));
        for (let x = 0; x < GALAXY_SIZE; x++) {
            galaxy.append(axisLabel(x));
        }
        for (let y = 0; y < GALAXY_SIZE; y++) {
            galaxy.append(axisLabel(y));
            drawn.cells.push([]);
            for (let x = 0; x < GALAXY_SIZE; x++) {
                const cell = element("sector hidden");
                drawn.cells[y].push(cell);
                galaxy.append(cell);
            }
        }
        drawn.marker = element("ship-marker");
        drawn.marker.hidden = true;
        galaxy.append(drawn.marker);
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
        const star = element("star");
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
        const cell = drawn.cells[y][x];
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
        drawn.marker.style.top = `${((y + 1) * 100) / (GALAXY_SIZE + 1)}%`;
        drawn.marker.style.left = `${((x + 1) * 100) / (GALAXY_SIZE + 1)}%`;
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
        byId("charted").textContent = `${charted.length} / ${GALAXY_SIZE * GALAXY_SIZE}`;
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
        buildGalaxy();
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
