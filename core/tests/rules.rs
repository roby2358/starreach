//! Every rule test, one module per file under `R-n/`. The coverage test checks this list.

mod helpers;

#[path = "R-1/galaxy_generation.rs"]
mod r_1_galaxy_generation;

#[path = "R-2/sector_instantiation.rs"]
mod r_2_sector_instantiation;

#[path = "R-3/ray.rs"]
mod r_3_ray;

#[path = "R-4/warp.rs"]
mod r_4_warp;

#[path = "R-5/subwarp.rs"]
mod r_5_subwarp;

#[path = "R-6/dock.rs"]
mod r_6_dock;

#[path = "R-7/long_range_scan.rs"]
mod r_7_long_range_scan;

#[path = "R-8/galaxy_map.rs"]
mod r_8_galaxy_map;

#[path = "R-9/blast.rs"]
mod r_9_blast;

#[path = "R-10/torpedo.rs"]
mod r_10_torpedo;

#[path = "R-11/stardate_events.rs"]
mod r_11_stardate_events;

#[path = "R-12/enemies_turn.rs"]
mod r_12_enemies_turn;

#[path = "R-13/enemy_advance.rs"]
mod r_13_enemy_advance;

#[path = "R-14/enemy_fire.rs"]
mod r_14_enemy_fire;

#[path = "R-15/shield_replenish.rs"]
mod r_15_shield_replenish;

#[path = "R-16/starbase_hail.rs"]
mod r_16_starbase_hail;

#[path = "R-17/stardate_display.rs"]
mod r_17_stardate_display;

#[path = "R-19/invariants.rs"]
mod r_19_invariants;

#[path = "R-20/determinism.rs"]
mod r_20_determinism;

#[path = "R-22/galaxy_record_follows_kills.rs"]
mod r_22_galaxy_record_follows_kills;

#[path = "R-23/game_end.rs"]
mod r_23_game_end;

#[path = "R-24/sector_persistence.rs"]
mod r_24_sector_persistence;

#[path = "R-25/result_shape.rs"]
mod r_25_result_shape;

#[path = "R-26/emergency_energy.rs"]
mod r_26_emergency_energy;
