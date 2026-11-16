//! Whole games played by the scripted captain: per game, the counts the core keeps, how long the
//! game ran and how it ended; and the counter table's `scale` and `goal_ceiling` that the rule
//! of D-43 gives from them.

use starreach_core::constants::STARTICKS_PER_STARDATE;
use starreach_core::{counter_table, new_game, CounterRow, Game, Status};

use crate::battle::START_UNIX_SECONDS;
use crate::captain::captain_step;
use crate::stats::{average, percentile, sorted};

/// A game stops after this many commands, so a captain who can't finish can't hang the run.
const GAME_COMMAND_CAP: u32 = 5000;
/// The ladder units a counter's `scale` is chosen from, largest first.
const SCALES: [u32; 4] = [1000, 100, 10, 1];
/// A counter's `scale` is at most the median per game divided by this, so a typical game climbs
/// about ten units of the ladder or more.
const UNITS_PER_MEDIAN_GAME: f64 = 10.0;
/// The share of games that should reach a counter's `goal_ceiling` is 1 minus this.
const GOAL_CEILING_FRACTION: f64 = 0.25;

struct Played {
    game: Game,
    commands: u32,
}

/// The scripted captain plays the game of `seed` until it ends, the captain can do nothing, or
/// the command cap.
fn play(seed: u32) -> Played {
    let mut game = new_game(seed, START_UNIX_SECONDS);
    let mut commands = 0;
    while commands < GAME_COMMAND_CAP && game.status == Status::Playing {
        match captain_step(&game) {
            Some(next) => game = next,
            None => break,
        }
        commands += 1;
    }
    Played { game, commands }
}

/// How a game ended, by its status and counters.
const ENDINGS: [(&str, fn(&Game) -> bool); 4] = [
    ("won", |g| g.status == Status::Won),
    ("ship destroyed", |g| g.status == Status::Lost && g.counters.times_stranded == 0),
    ("stranded", |g| g.counters.times_stranded > 0),
    ("script gave up", |g| g.status == Status::Playing),
];

fn print_endings(played: &[Played]) {
    for (name, ended) in ENDINGS {
        let games: Vec<&Played> = played.iter().filter(|p| ended(&p.game)).collect();
        if games.is_empty() {
            println!("ended {name}: 0.0%");
            continue;
        }
        let commands = sorted(games.iter().map(|p| f64::from(p.commands)));
        println!(
            "ended {name}: {:.1}% | commands median {:.0}, p10 {:.0}, p90 {:.0}",
            100.0 * games.len() as f64 / played.len() as f64,
            percentile(&commands, 0.5),
            percentile(&commands, 0.1),
            percentile(&commands, 0.9)
        );
    }
}

/// One measure's values over the games, sorted.
struct Sample {
    sorted: Vec<f64>,
}

impl Sample {
    fn of(values: impl Iterator<Item = f64>) -> Sample {
        Sample { sorted: sorted(values) }
    }

    fn at(&self, fraction: f64) -> f64 {
        percentile(&self.sorted, fraction)
    }

    fn share_at_least_one(&self) -> f64 {
        self.sorted.iter().filter(|&&v| v >= 1.0).count() as f64 / self.sorted.len() as f64
    }

    fn summary(&self) -> String {
        format!(
            "{:9.1} {:7.0} {:7.0} {:7.0} {:7.0} {:5.0}%",
            average(&self.sorted),
            self.at(0.1),
            self.at(GOAL_CEILING_FRACTION),
            self.at(0.5),
            self.at(0.9),
            100.0 * self.share_at_least_one()
        )
    }
}

/// The ladder's unit: the largest of `SCALES` at most a tenth of the median per game, 1 below
/// them all.
fn scale_for(median: f64) -> u32 {
    let tenth = median / UNITS_PER_MEDIAN_GAME;
    SCALES.into_iter().find(|&scale| f64::from(scale) <= tenth).unwrap_or(1)
}

/// The most a goal may ask: what three games in four reach. 0, so never offered, when the
/// counter may not be a goal or that amount is below one unit of its ladder.
fn goal_ceiling_for(row: &CounterRow, sample: &Sample, scale: u32) -> u32 {
    let reached = sample.at(GOAL_CEILING_FRACTION) as u32;
    match row.may_be_goal && reached >= scale {
        true => reached,
        false => 0,
    }
}

/// Each game's counters as the core reports them in its state, keyed as the counter table is.
fn reported_counters(played: &[Played]) -> Vec<serde_json::Value> {
    played
        .iter()
        .map(|p| serde_json::to_value(p.game.state().counters).expect("counters always serialize"))
        .collect()
}

fn print_counter_row(row: &CounterRow, sample: &Sample) {
    let scale = scale_for(sample.at(0.5));
    let goal_ceiling = goal_ceiling_for(row, sample, scale);
    let differs = match (scale, goal_ceiling) == (row.scale, row.goal_ceiling) {
        true => "",
        false => "  <- differs from the rule",
    };
    println!(
        "{:22} {} | rule: scale {scale:4}, goal_ceiling {goal_ceiling:4} | table: scale {:4}, goal_ceiling {:4}{differs}",
        row.key,
        sample.summary(),
        row.scale,
        row.goal_ceiling
    );
}

/// N seeded games: how they ended, how long they ran, and each counter per game, with the
/// `scale` and `goal_ceiling` the rule gives beside the ones the core's table holds.
pub fn print_games(n: u32) {
    let played: Vec<Played> = (0..n).map(play).collect();
    let start = new_game(0, START_UNIX_SECONDS).startick;
    println!("whole games: {n}, scripted captain, seeds 0..{n}, command cap {GAME_COMMAND_CAP}");
    print_endings(&played);
    println!("{:22} {:>9} {:>7} {:>7} {:>7} {:>7} {:>6}", "per game", "mean", "p10", "p25", "median", "p90", ">=1");
    let stardates = Sample::of(played.iter().map(|p| (p.game.startick - start) as f64 / STARTICKS_PER_STARDATE as f64));
    println!("{:22} {}", "stardates", stardates.summary());
    println!("{:22} {}", "commands", Sample::of(played.iter().map(|p| f64::from(p.commands))).summary());
    let counters = reported_counters(&played);
    for row in counter_table() {
        let values = counters.iter().map(|c| c[row.key].as_f64().expect("the table's keys are counters"));
        print_counter_row(row, &Sample::of(values));
    }
}
