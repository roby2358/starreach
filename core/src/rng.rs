//! Deterministic random streams (ONTOLOGY "Random streams", D-28).
//!
//! SplitMix64: one u64 of state, so a stream fits in the Game and survives a JSON round
//! trip. The state is serialized as a decimal string, because JavaScript numbers lose
//! precision above 2^53.

use serde::{Deserialize, Deserializer, Serialize, Serializer};

use crate::geometry::Yx;

const GOLDEN_GAMMA: u64 = 0x9E37_79B9_7F4A_7C15;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Rng {
    state: u64,
}

impl Rng {
    /// The game stream, seeded from the game's seed.
    pub fn seeded(seed: u32) -> Rng {
        Rng { state: seed as u64 }
    }

    /// A sector stream: depends only on the seed and the sector.
    pub fn for_sector(seed: u32, sector_yx: Yx) -> Rng {
        let index = (sector_yx.0 * 10 + sector_yx.1 + 1) as u64;
        let mut mixer = Rng { state: ((seed as u64) << 32) ^ index.wrapping_mul(GOLDEN_GAMMA) };
        Rng { state: mixer.next_u64() }
    }

    pub fn next_u64(&mut self) -> u64 {
        self.state = self.state.wrapping_add(GOLDEN_GAMMA);
        let mut z = self.state;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }

    /// Uniform in [0, 1).
    pub fn unit(&mut self) -> f64 {
        (self.next_u64() >> 11) as f64 / (1u64 << 53) as f64
    }

    /// Uniform integer in the inclusive range `(lo, hi)`.
    pub fn int_in(&mut self, range: (i32, i32)) -> i32 {
        let (lo, hi) = range;
        let span = (hi - lo + 1) as u64;
        lo + (self.next_u64() % span) as i32
    }

    /// Uniform index in `0..len`. `len` must be positive.
    pub fn index(&mut self, len: usize) -> usize {
        (self.next_u64() % len as u64) as usize
    }

    pub fn chance(&mut self, probability: f64) -> bool {
        self.unit() < probability
    }
}

impl Serialize for Rng {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.state.to_string())
    }
}

impl<'de> Deserialize<'de> for Rng {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Rng, D::Error> {
        let text = String::deserialize(deserializer)?;
        let state = text.parse::<u64>().map_err(serde::de::Error::custom)?;
        Ok(Rng { state })
    }
}
