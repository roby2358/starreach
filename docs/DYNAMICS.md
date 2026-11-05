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

## Key mechanics (one per driver)

| Driver | Key mechanic | Status |
|---|---|---|
| Readable Consequences | Every action returns its events as messages, and the LLM narrates them in naval voice | [D] built |
| Information as Currency | Sectors stay hidden until you scan (`LRS_ENERGY`) or warp in | [D] built |
| Scarcity of Agency | With enemies present, subwarp is capped at `SUBWARP_MAX_STEPS_HOSTILE`, and enemies answer as stardates pass | [D] built, but enemies rarely answer (Q-2) |

## Secondary mechanics and what they feed

| Mechanic | Feeds | Driver |
|---|---|---|
| Single ray rule: stars and ships block movement and fire | Combat positioning, cover | Scarcity of Agency, Readable Consequences |
| Damage falls off steeply with distance (`ENEMY_FIRE_FALLOFF`) | Range as protection | Scarcity of Agency |
| Blast: limited range, energy cost rising with √range | Weapon choice | Scarcity of Agency |
| Torpedo: unlimited range, limited ammo | Weapon choice; the long shot | Scarcity of Agency |
| Enemy density rises with distance from home | Venturing out is a commitment | Escalating Commitment |
| Rare starbases; docking only in a cleared sector | Resupply as a goal you earn | Landmarks, Loss Aversion |
| Starbase hail on arrival | A reason to clear a sector ("needs assistance") | Guardianship (weak) |
| Stardate display, naval decorum | Flavor | Readable Consequences (voice) |

## Gut check

- *Stars block shots and movement.* Intuitive.
- *You can't dock while enemies are in the sector.* Intuitive.
- *Enemies don't react to being shot.* Counter-intuitive. A blast or torpedo takes ≤
  `EVENT_INTERVAL` time, so firing never draws return fire, while moving 3 cells does (Q-2).
  This reads as a bug.
- *Running out of energy still lets you fire once more for free.* Reads as a bug (Q-3).
- *Coming back to a sector re-rolls where everything is.* Surprising; it breaks map memory (Q-5).
- *Hull 0 and nothing happens.* There are no stakes (Q-1).

## Strategies

**Early:** Scan around Star Central, pick a nearby sector with few enemies, and fight from
range with cover.
**Mid:** Push outward along a route of scanned sectors, choosing between blasts (energy)
and torpedoes (ammo), and plan a return to a starbase.
**Late:** Deep sectors with many enemies. Spend torpedoes on targets out of blast range,
and retreat to resupply.

### Recurring tensions
- Blast now at close range (cheap, but you're inside their damage falloff) vs. reposition first (a turn spent and time given to the enemy).
- Spend energy on scanning vs. save it for combat.
- Use a torpedo (scarce) vs. a blast (energy, range-limited).

### Anti-strategies

| Anti-strategy | Mechanical prevention | Status |
|---|---|---|
| Stand still and shoot. Enemies never respond to blasts or torpedoes | None. The clock resets each action and shots take < `EVENT_INTERVAL` | **Unprevented → Q-2** |
| Move 1–2 cells at a time so the enemy clock never fills | None, for the same reason | **Unprevented → Q-2** |
| Fire the last shot with no energy | None. Energy is clamped at 0 and the shot succeeds | **Unprevented → Q-3** |
| Warp out of any losing fight | None. Warping never triggers an enemy turn | **Unprevented → Q-14** |
| Warp out and back to re-roll a bad board | None. Layouts aren't stored | **Unprevented → Q-5** |
| Ignore the hull | None. Hull 0 has no effect | **Unprevented → Q-1** |
| Dock-camp at Star Central | Docking needs a cleared sector, and enemies don't spread between sectors, so camping is safe but wins nothing | Prevented only once Q-1 adds a goal |
| Scan everything | `LRS_ENERGY` per scan; the scan is small next to `SHIP_MAX_ENERGY` | Weak |

## Strategy ↔ mechanic cross-check

- **Mechanics no strategy uses:** ShieldReplenish (a stub, Q-6). The hull can't be repaired
  (Q-7), so preserving it is purely defensive. Enemy advance barely matters with fewer
  than 3 enemies (Q-13).
- **Strategies that rely on missing rules:** "retreat to resupply" assumes a resupply that
  matters (hull repair, Q-7). Every strategy assumes there is a goal to work toward (Q-1).

## Untapped

- **Enemy identity / revenge.** The enemy race names in the code comments could name the
  enemies and give them distinct rules (DYNAMICS candidate, not proposed).
- **Guardianship.** A starbase "under attack" could be a sector you lose if you don't
  answer the hail.
