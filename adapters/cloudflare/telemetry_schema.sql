-- Telemetry on Cloudflare (D-53): the tables of the D1 database bound as TELEMETRY. They hold
-- ONTOLOGY's telemetry records: a row of `games` per game record and a row of `events` per event
-- record. The fields that are asked about most are columns; `rest` holds the others as JSON.
-- No column holds a game_id, a view_id or a player id.
--
-- `just cf-d1-local` and `just cf-d1-production` apply this file, and the Worker's tests apply
-- it to their own database. Every statement is safe to run again. There is no migration history:
-- a change to a table that exists is made by hand, and said to the designer.

-- One row per game record, written by new_game. The columns from `outcome` on are NULL until the
-- command that ends the game fills them.
CREATE TABLE IF NOT EXISTS games (
  game_key TEXT PRIMARY KEY,               -- the telemetry game key
  started_unix_seconds INTEGER NOT NULL,
  seed INTEGER NOT NULL,
  rules_version INTEGER NOT NULL,
  player_hash TEXT NOT NULL,
  client_name TEXT,                        -- the McpClient's three parts, each NULL where unknown
  client_version TEXT,
  client_user_agent TEXT,
  outcome TEXT,                            -- 'won' or 'lost'
  ended_by TEXT,                           -- 'galaxy_cleared', 'ship_destroyed' or 'stranded'
  rest TEXT                                -- JSON {"counters": …, "goals": …} of the GameEnd
);

-- Games per day, and per player.
CREATE INDEX IF NOT EXISTS games_by_start ON games (started_unix_seconds);
CREATE INDEX IF NOT EXISTS games_by_player ON games (player_hash);

-- One row per event record: a tool call on a game. The primary key is also the index that joins
-- a game's events to its row of `games`, in `seq` order. It is no foreign key: a game's events
-- are kept whether or not its `games` row was written.
CREATE TABLE IF NOT EXISTS events (
  game_key TEXT NOT NULL,
  seq INTEGER NOT NULL,                    -- from 0 per game, in the order the database got them
  unix_seconds INTEGER NOT NULL,
  tool TEXT NOT NULL,
  accepted INTEGER NOT NULL,               -- 1 or 0
  refusal TEXT,                            -- NULL when accepted
  startick INTEGER NOT NULL,
  ticks INTEGER NOT NULL,
  energy INTEGER NOT NULL,
  shields INTEGER NOT NULL,
  hull INTEGER NOT NULL,
  torpedoes INTEGER NOT NULL,
  damage_taken INTEGER NOT NULL,
  sectors_revealed INTEGER NOT NULL,
  sectors_cleared INTEGER NOT NULL,
  distance REAL,                           -- detail.distance: a subwarp's cells, a warp's sectors
  range REAL,                              -- detail.range: a blast's or a torpedo's
  hit INTEGER,                             -- detail.hit as 1 or 0
  rest TEXT NOT NULL,                      -- JSON {"args": …, "detail": …}, the detail whole
  PRIMARY KEY (game_key, seq)
);

-- Events per day, and per tool.
CREATE INDEX IF NOT EXISTS events_by_time ON events (unix_seconds);
CREATE INDEX IF NOT EXISTS events_by_tool ON events (tool);
