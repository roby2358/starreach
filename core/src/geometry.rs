//! Coordinates and distances (ONTOLOGY "Distances").

use serde::{Deserialize, Serialize};

use crate::constants::SECTOR_SIZE;

/// A coordinate, of a sector in the galaxy or of a cell in a sector (D-50): `x` is the column,
/// left to right, and `y` the row, top to bottom. It is built, written and serialized x first:
/// `xy(x, y)`, `(x, y)`, `[x, y]`. The code reads the parts by name, so this type is the one
/// place the order is set. Grids are stored as rows of columns: a lookup is `grid[xy.y][xy.x]`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(from = "(i32, i32)", into = "(i32, i32)")]
pub struct Xy {
    pub x: i32,
    pub y: i32,
}

pub const fn xy(x: i32, y: i32) -> Xy {
    Xy { x, y }
}

impl From<(i32, i32)> for Xy {
    fn from((x, y): (i32, i32)) -> Xy {
        Xy { x, y }
    }
}

impl From<Xy> for (i32, i32) {
    fn from(xy: Xy) -> (i32, i32) {
        (xy.x, xy.y)
    }
}

impl Xy {
    /// The coordinate `dx` columns and `dy` rows away.
    pub fn offset(self, dx: i32, dy: i32) -> Xy {
        Xy { x: self.x + dx, y: self.y + dy }
    }
}

pub fn euclid(a: Xy, b: Xy) -> f64 {
    let dx = (a.x - b.x) as f64;
    let dy = (a.y - b.y) as f64;
    (dy * dy + dx * dx).sqrt()
}

pub fn adjacent(a: Xy, b: Xy) -> bool {
    (a.x - b.x).abs().max((a.y - b.y).abs()) <= 1
}

/// True when both parts are in `0..SECTOR_SIZE`. The galaxy has the same size.
pub fn in_bounds(xy: Xy) -> bool {
    (0..SECTOR_SIZE).contains(&xy.x) && (0..SECTOR_SIZE).contains(&xy.y)
}

/// Every cell of a 10×10 grid, in row order: along the top row, then each row below.
pub fn all_cells() -> impl Iterator<Item = Xy> {
    (0..SECTOR_SIZE).flat_map(|y| (0..SECTOR_SIZE).map(move |x| Xy { x, y }))
}

pub fn format_xy(xy: Xy) -> String {
    format!("({}, {})", xy.x, xy.y)
}

/// The Bresenham line from `start` toward `dest`, excluding `start`, unbounded: it keeps
/// stepping past `dest` only if the caller keeps pulling.
pub fn bresenham(start: Xy, dest: Xy) -> impl Iterator<Item = Xy> {
    let (dx, dy) = ((dest.x - start.x).abs(), (dest.y - start.y).abs());
    let (sx, sy) = ((dest.x - start.x).signum(), (dest.y - start.y).signum());
    let mut err = dx - dy;
    let mut cell = start;
    std::iter::from_fn(move || {
        let e2 = 2 * err;
        if e2 > -dy {
            err -= dy;
            cell.x += sx;
        }
        if e2 < dx {
            err += dx;
            cell.y += sy;
        }
        Some(cell)
    })
}

/// Exponential decay from `near` at range `start` to `far` at range `end`: the value is
/// multiplied by the same ratio for each cell between them. Callers clamp outside that span.
pub fn exp_falloff(range: f64, start: f64, end: f64, near: f64, far: f64) -> f64 {
    near * (far / near).powf((range - start) / (end - start))
}
