//! R-17: stardate display.
use starreach_core::game::format_stardate;

#[test]
fn truncates_pads_and_groups() {
    assert_eq!(format_stardate(1_234_567.9), "01-2345-67");
    assert_eq!(format_stardate(12_345_678.0), "12-3456-78");
    assert_eq!(format_stardate(123_456_789.0), "12-3456-78");
}
