// The main viewer (ONTOLOGY "Client contract"): draws the frames that arrive on the game's
// socket. It sends nothing, so it can't change the game.
(function () {
    const GRID_SIZE = 10;
    const RECONNECT_MIN_MS = 1000;
    const RECONNECT_MAX_MS = 15000;
    const GAME_NOT_FOUND_CLOSE = 4404;
    const LOW_GAUGE_FRACTION = 0.25;
    const MAX_GAUGE_SEGMENTS = 20;
    const STAR_RING_RADIUS_PERCENT = 38;
    const STAR_RING_CENTER_PERCENT = 48;
    const RUNG_SEGMENTS = 10;
    /** The page's address ends with this to open with the achievements showing. */
    const RECORD_HASH = "#achievements";

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
    const drawn = { sectors: [], board: [], gauges: {}, goals: {}, marker: null, previous: null, achievements: null };

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

    /** A labelled bar inside `root`: the name, a value beside it, and a segmented track. */
    function buildBar(root, name) {
        const label = element("gauge-label");
        const title = document.createElement("span");
        title.textContent = name;
        const value = document.createElement("span");
        value.className = "gauge-value";
        label.append(title, value);
        const track = element("gauge-track");
        const fill = element("gauge-fill");
        track.append(fill);
        root.append(label, track);
        return { root, value, track, fill };
    }

    function setBar(bar, text, fraction, segments) {
        bar.value.textContent = text;
        bar.fill.style.width = `${fraction * 100}%`;
        bar.track.style.setProperty("--segments", segments);
    }

    function buildGauges() {
        for (const gauge of GAUGES) {
            const root = element("gauge");
            root.dataset.gauge = gauge.value;
            drawn.gauges[gauge.value] = buildBar(root, gauge.label);
            byId("gauges").append(root);
        }
    }

    /** Sets a sector's stars the same way every time, from its coordinates. They keep to a ring
     *  around the cell, so the enemy count in the middle stays readable. */
    function starAt(y, x, index, count) {
        const star = element("dot");
        const angle = ((y * 37 + x * 17 + (index * 360) / count) * Math.PI) / 180;
        star.style.top = `${STAR_RING_CENTER_PERCENT + STAR_RING_RADIUS_PERCENT * Math.sin(angle)}%`;
        star.style.left = `${STAR_RING_CENTER_PERCENT + STAR_RING_RADIUS_PERCENT * Math.cos(angle)}%`;
        return star;
    }

    function sectorLabel(y, x, sector) {
        if (sector === null) {
            return `Sector ${y},${x}: uncharted`;
        }
        return `Sector ${y},${x}: ${sector.enemies} enemies, ${sector.starbases} starbases, ${sector.stars} stars`;
    }

    function drawSectorContents(cell, y, x, sector) {
        const stars = Array.from({ length: sector.stars }, (_, index) => starAt(y, x, index, sector.stars));
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
            const bar = drawn.gauges[gauge.value];
            const fraction = ship[gauge.value] / ship[gauge.max];
            setBar(bar, `${ship[gauge.value]} / ${ship[gauge.max]}`, fraction, Math.min(ship[gauge.max], MAX_GAUGE_SEGMENTS));
            bar.root.classList.toggle("low", fraction < LOW_GAUGE_FRACTION);
            if (previous !== null && ship[gauge.value] < previous.ship[gauge.value]) {
                flash(bar.root, "dropped");
            }
        }
    }

    function note(className, text) {
        const node = document.createElement("span");
        node.className = className;
        node.textContent = text;
        return node;
    }

    function listItem(className) {
        const node = document.createElement("li");
        node.className = className;
        return node;
    }

    /** A goal's row, made the first time the goal is seen. A game keeps its goals. */
    function goalBar(goal) {
        if (!(goal.counter in drawn.goals)) {
            const root = listItem("goal");
            root.dataset.goal = goal.counter;
            drawn.goals[goal.counter] = buildBar(root, goal.label);
            byId("goals").append(root);
        }
        return drawn.goals[goal.counter];
    }

    /** Each goal's count against its amount, with the word for a met one. A goal met since the
     *  last frame flashes once. */
    function drawGoals(goals, previous) {
        goals.forEach((goal, index) => {
            const bar = goalBar(goal);
            setBar(bar, `${goal.count} / ${goal.amount}`, Math.min(goal.count / goal.amount, 1), Math.min(goal.amount, MAX_GAUGE_SEGMENTS));
            if (goal.met) {
                bar.value.prepend(note("goal-met", "Met"));
            }
            bar.root.classList.toggle("met", goal.met);
            if (previous !== null && goal.met && !previous.goals[index].met) {
                flash(bar.root, "reached");
            }
        });
    }

    /** How far a lifetime total has come from the last rung it reached toward the next, 0 to 1. */
    function towardNextRung(achievement) {
        const from = achievement.reached === null ? 0 : achievement.reached;
        return (achievement.total - from) / (achievement.next - from);
    }

    function achievementRow(achievement) {
        const root = listItem("achievement");
        root.dataset.counter = achievement.key;
        setBar(buildBar(root, achievement.label), achievement.total, towardNextRung(achievement), RUNG_SEGMENTS);
        const rungs = element("rungs");
        const reached = achievement.reached === null ? note("rung-none", "No mark yet") : note("rung-reached", `Reached ${achievement.reached}`);
        rungs.append(reached, note("rung-next", `Next ${achievement.next}`));
        root.append(rungs);
        return root;
    }

    /** The last rung each counter had reached in a list of achievements, by counter key. */
    function rungsReached(achievements) {
        return Object.fromEntries(achievements.map((achievement) => [achievement.key, achievement.reached]));
    }

    /** The player's achievements, the counter nearest its next rung first. A counter that has
     *  reached a rung since the last frame flashes once. */
    function drawAchievements(achievements) {
        const nearestFirst = [...achievements].sort((a, b) => towardNextRung(b) - towardNextRung(a));
        const before = drawn.achievements === null ? null : rungsReached(drawn.achievements);
        byId("achievements").replaceChildren(...nearestFirst.map((achievement) => {
            const row = achievementRow(achievement);
            row.classList.toggle("reached", before !== null && achievement.reached !== before[achievement.key]);
            return row;
        }));
        drawn.achievements = achievements;
    }

    function showRecord(open) {
        byId("record").hidden = !open;
        byId("record-toggle").setAttribute("aria-expanded", String(open));
    }

    /** The achievements open and close on the page alone: nothing goes up the socket. */
    function buildRecord() {
        byId("record-toggle").addEventListener("click", () => showRecord(byId("record").hidden));
        byId("record-close").addEventListener("click", () => showRecord(false));
        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
                showRecord(false);
            }
        });
        showRecord(location.hash === RECORD_HASH);
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
        document.body.dataset.status = status;
    }

    /** A warp and an enemy gone from this sector each play once on the hologram. */
    function animateTank(view, previous) {
        if (previous === null) {
            return;
        }
        const [y, x] = view.sector_yx;
        if (y !== previous.sector_yx[0] || x !== previous.sector_yx[1]) {
            flash(byId("tank"), "warping");
        } else if (view.galaxy[y][x].enemies < previous.galaxy[y][x].enemies) {
            flash(byId("tank"), "struck");
        }
    }

    function drawView(view) {
        byId("stardate").textContent = view.stardate;
        byId("sector").textContent = `(${view.sector_yx[0]}, ${view.sector_yx[1]})`;
        drawBoard(view.board);
        animateTank(view, drawn.previous);
        drawGalaxy(view, drawn.previous);
        drawGauges(view.ship, drawn.previous);
        drawGoals(view.goals, drawn.previous);
        drawSurvey(view);
        drawOutcome(view.status);
        drawn.previous = view;
    }

    /** One entry per frame `type` on the socket. */
    const FRAMES = {
        view: (frame) => {
            drawView(frame.view);
            drawAchievements(frame.achievements);
        },
    };

    function setLink(link, notice) {
        document.body.dataset.link = link;
        byId("link").textContent = LINKS[link].text;
        const shown = notice === null ? LINKS[link].notice : notice;
        byId("notice").hidden = shown === null;
        byId("notice-text").textContent = shown;
        byId("home-link").hidden = link !== "absent";
    }

    function connect(view, delay) {
        const scheme = location.protocol === "https:" ? "wss:" : "ws:";
        const socket = new WebSocket(`${scheme}//${location.host}/live/${view}`);
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
            setTimeout(() => connect(view, Math.min(nextDelay * 2, RECONNECT_MAX_MS)), nextDelay);
        };
    }

    function start() {
        buildMaps();
        buildGauges();
        buildRecord();
        const view = new URLSearchParams(location.search).get("view");
        if (view === null) {
            setLink("absent", NO_GAME_NOTICE);
            return;
        }
        setLink("connecting", null);
        connect(view, RECONNECT_MIN_MS);
    }

    start();
})();
