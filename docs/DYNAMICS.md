# Starreach — Dynamics

Why Starreach is fun, and how its mechanics are supposed to produce that. Constants are
referred to by name. Everything here is **[P]** (Claude's reading of the shipped design)
unless tagged **[D]**. Numbers are **[T]**.

## Theme

**A lone captain at the edge of the known galaxy, giving orders to a crew who answer
back.** The feeling is commanding the ship, not piloting it. You decide, the crew carries
it out and reports, and the galaxy gets more dangerous the farther you go from home.

## Drivers

1. **Readable Consequences, told by the crew.** Every result comes back as a crew report:
   who fired, from where, how much damage got through, what blocked the shot. The LLM turns
   mechanics into narration (G-1, F-command).
2. **Information as Currency.** The galaxy is fogged. Scans and warps buy knowledge, and
   knowledge decides where to go next (F-discovery).
3. **Scarcity of Agency in combat.** Inside a hostile sector you move in short hops and
   every shot spends something. Whether you engage, reposition, or leave is the decision
   (F-danger, G-4).

Supporting: **Landmarks as Anchors / Home Base.** Star Central and the rare starbases are
where you come back to resupply.

Supporting: **Accumulation.** Each game sets three small objectives, and ordinary play adds up
toward them.

## Key mechanics (one per driver)

| Driver | Key mechanic | Status |
|---|---|---|
| Readable Consequences | Every action returns its events as messages, and the LLM narrates them in naval voice | [D] built |
| Information as Currency | Sectors stay hidden until you scan (`LRS_ENERGY`) or warp in | [D] built |
| Scarcity of Agency | With enemies present, subwarp is capped at `SUBWARP_MAX_STEPS_HOSTILE`, and enemies answer as stardates add up | [D] built in the Rust core |

## Secondary mechanics and what they feed

| Mechanic | Feeds | Driver |
|---|---|---|
| Single ray rule: stars and ships block movement and fire | Combat positioning, cover | Scarcity of Agency, Readable Consequences |
| Damage stays high to `ENEMY_FIRE_NEAR_RANGE`, then falls off exponentially to `ENEMY_FIRE_FAR` | Range as protection | Scarcity of Agency |
| Blast: limited range, energy cost rising with √range, kill chance falling with range | Weapon choice; the gamble of a long shot | Scarcity of Agency, Near Miss |
| Enemy fire damage varies within a band | "Can I take one more volley?" | Variable Reinforcement |
| Torpedo: unlimited range, limited ammo | Weapon choice; the long shot | Scarcity of Agency |
| Enemy density rises with distance from home | Venturing out is a commitment | Escalating Commitment |
| Rare starbases; docking only in a cleared sector; docking repairs the hull | Resupply as a goal you earn | Landmarks, Loss Aversion |
| Shields recharge from energy, cheaply, and to full on a warp | Fighting drains the tank twice; a ship arrives ready | Scarcity of Agency |
| Every action must be paid for | Running dry far from home is a real danger | Loss Aversion, Escalating Commitment |
| Hull 0 or being stranded away from a starbase loses; clearing the galaxy wins; a starbase rescues a stranded ship | Stakes, a reason to push outward, and starbases as refuges | Loss Aversion, Escalating Commitment, Landmarks |
| Starbase hail on arrival | A reason to clear a sector ("needs assistance") | Guardianship (weak) |
| Three goals per game from Star Central, each an amount of one counter (`GOALS_PER_GAME`), with a message when one is met [D] | Something to build toward and finish in a game that may never be won; a nudge toward a part of play this game (dock, scan, torpedo) | Accumulation and Windfall; Readable Consequences (Star Central says when) |
| Stardate display, naval decorum | Flavor | Readable Consequences (voice) |

## Gut check

- *Stars block shots and movement.* Intuitive.
- *You can't dock while enemies are in the sector.* Intuitive.
- *Enemies answer when time passes, whatever you did with it.* Intuitive.
- *You can't fire or fly on an empty tank.* Intuitive.
- *Enemies get a parting shot when you warp out.* Intuitive.
- *Coming back to a sector, the stars are where you left them, but enemies are back at
  their posts.* Mostly intuitive; the reset of enemy positions may surprise.
- *Docking repairs the hull.* Intuitive.
- *Star Central sets objectives at the start and signals when one is met.* Intuitive. An
  objective as small as one dock is met almost at once, which may read as no objective at all.

## Strategies

**Early:** Scan around Star Central, pick a nearby sector with few enemies, and fight from
range with cover.
**Mid:** Push outward along a route of scanned sectors, choosing between blasts (energy)
and torpedoes (ammo), and plan a return to a starbase.
**Late:** Deep sectors with many enemies. Spend torpedoes on targets out of blast range,
and retreat to resupply.

**Throughout:** the three goals tilt these choices: a goal on torpedoes fired or docks makes
the scarce option worth taking sooner.

### Recurring tensions
- Blast now at close range (cheap, but you're inside their damage falloff) vs. reposition first (a turn spent and time given to the enemy).
- Spend energy on scanning vs. save it for combat.
- Use a torpedo (scarce) vs. a blast (energy, range-limited).

### Anti-strategies

| Anti-strategy | Mechanical prevention | Status |
|---|---|---|
| Stand still and shoot. Enemies never respond to blasts or torpedoes | The enemy clock accumulates (D-10), so shots bring the next enemy turn closer | Prevented |
| Move 1–2 cells at a time so the enemy clock never fills | Same: time adds up across actions (D-10) | Prevented |
| Fire the last shot with no energy | An action you can't afford is refused (D-24) | Prevented |
| Warp out of any losing fight | Enemies get a turn before the warp (D-25) | Prevented; escape is costly, not blocked |
| Warp out and back to re-roll a bad board | Sector layouts regenerate from the seed (D-26) | Prevented |
| Ignore the hull | Hull 0 loses the game (D-23) | Prevented |
| Dock-camp at Star Central | Docking needs a cleared sector; camping wins nothing, because winning means clearing the galaxy (D-23) | Prevented |
| Farm a goal with a cheap action, such as scanning in place | None wanted: a met goal earns a message and nothing else (D-47), and each scan still costs `LRS_ENERGY` | Accepted |
| Scan everything | `LRS_ENERGY` per scan; the scan is small next to `SHIP_MAX_ENERGY` | Weak |

## Strategy ↔ mechanic cross-check

- **Mechanics no strategy uses:** none known. The goals (D-47) are used throughout: they add
  no rule of play, only an aim. Shield recharge (D-27) and hull repair
  (D-7) feed "retreat to resupply"; per-enemy advance (D-10) lets small groups close in.
- **Strategies that rely on missing rules:** none known. Running dry far from a starbase
  loses the game (D-30), so "plan a return to a starbase" is enforced.

## Untapped

- **Enemy identity / revenge.** The enemy race names in the code comments could name the
  enemies and give them distinct rules (DYNAMICS candidate, not proposed).
- **Guardianship.** A starbase "under attack" could be a sector you lose if you don't
  answer the hail.
