//! The ladder of a counter's lifetime total (ONTOLOGY "Ladder", D-44).
//!
//! A rung is `scale × {1, 2, 5} × 10^n`: with scale 10 the rungs are 10, 20, 50, 100, 200…
//! The scale is the counter's own, from the counter table.

use serde::Serialize;

const RUNG_STEPS: [u64; 3] = [1, 2, 5];

/// Where a total stands on a ladder: the last rung it reached, if any, and the next one.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
pub struct Standing {
    pub reached: Option<u64>,
    pub next: u64,
}

/// The ladder's rungs in rising order, ending where the next would not fit in a u64.
fn rungs(scale: u32) -> impl Iterator<Item = u64> {
    let scale = scale as u64;
    (0u32..).map_while(move |index| {
        let decade = 10u64.checked_pow(index / 3)?;
        scale.checked_mul(RUNG_STEPS[(index % 3) as usize])?.checked_mul(decade)
    })
}

/// The rungs a total passed or landed on in going from `before` to `after`, in rising order.
pub fn rungs_crossed(scale: u32, before: u64, after: u64) -> Vec<u64> {
    rungs(scale).skip_while(|&rung| rung <= before).take_while(|&rung| rung <= after).collect()
}

/// The last rung at or below `total` and the first above it. A ladder is practically endless:
/// past its last u64 rung, `next` stays on that rung.
pub fn standing(scale: u32, total: u64) -> Standing {
    let reached = rungs(scale).take_while(|&rung| rung <= total).last();
    let next = rungs(scale).find(|&rung| rung > total).or(reached).expect("a ladder has a first rung");
    Standing { reached, next }
}
