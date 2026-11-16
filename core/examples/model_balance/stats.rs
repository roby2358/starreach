//! Summary statistics over a sample.

pub fn percentile(sorted: &[f64], fraction: f64) -> f64 {
    sorted[((sorted.len() - 1) as f64 * fraction).round() as usize]
}

pub fn sorted(values: impl Iterator<Item = f64>) -> Vec<f64> {
    let mut values: Vec<f64> = values.collect();
    values.sort_by(f64::total_cmp);
    values
}

pub fn average(values: &[f64]) -> f64 {
    values.iter().sum::<f64>() / values.len() as f64
}
