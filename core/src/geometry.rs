//! Coordinates and distances (ONTOLOGY "Distances").

use crate::constants::SECTOR_SIZE;

/// `(y, x)`: row, then column. Serialized as `[y, x]`.
pub type Yx = (i32, i32);

pub fn euclid(a: Yx, b: Yx) -> f64 {
    let dy = (a.0 - b.0) as f64;
    let dx = (a.1 - b.1) as f64;
    (dy * dy + dx * dx).sqrt()
}

pub fn adjacent(a: Yx, b: Yx) -> bool {
    (a.0 - b.0).abs().max((a.1 - b.1).abs()) <= 1
}

/// True when both parts are in `0..SECTOR_SIZE`. The galaxy has the same size.
pub fn in_bounds(yx: Yx) -> bool {
    (0..SECTOR_SIZE).contains(&yx.0) && (0..SECTOR_SIZE).contains(&yx.1)
}

/// Every cell of a 10×10 grid, in row order.
pub fn all_cells() -> impl Iterator<Item = Yx> {
    (0..SECTOR_SIZE).flat_map(|y| (0..SECTOR_SIZE).map(move |x| (y, x)))
}

pub fn format_yx(yx: Yx) -> String {
    format!("({}, {})", yx.0, yx.1)
}

/// The Bresenham line from `start` toward `dest`, excluding `start`, unbounded: it keeps
/// stepping past `dest` only if the caller keeps pulling.
pub fn bresenham(start: Yx, dest: Yx) -> impl Iterator<Item = Yx> {
    let (dy, dx) = ((dest.0 - start.0).abs(), (dest.1 - start.1).abs());
    let (sy, sx) = ((dest.0 - start.0).signum(), (dest.1 - start.1).signum());
    let mut err = dx - dy;
    let mut cell = start;
    std::iter::from_fn(move || {
        let e2 = 2 * err;
        if e2 > -dy {
            err -= dy;
            cell.1 += sx;
        }
        if e2 < dx {
            err += dx;
            cell.0 += sy;
        }
        Some(cell)
    })
}
