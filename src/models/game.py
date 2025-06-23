from .ship import Ship
from .sector import ActiveSector
from .galaxy import Galaxy
from .events import StarbaseHail, ShieldReplenish, EnemyMove, EnemyFire, EnemyAdvance
from typing import TypedDict, Tuple, List
import random

class GameState(TypedDict):
    """Immutable data structure representing the current game state"""
    ship_max_hull: int
    ship_hull: int
    ship_max_shields: int
    ship_shields: int
    ship_energy: int
    ship_quantorpedoes: int
    ship_yx: Tuple[int, int]
    starbase_yx: Tuple[int, int]
    enemies_yx: List[Tuple[int, int]]
    star_count: int
    base_count: int
    enemy_count: int
    # List of strings where each string represents a row of the sector map
    map: list[str]
    stardate: str

class Game:
    def __init__(self):
        self.galaxy = Galaxy()
        self.ship = Ship()
        self.sector_yx = (4, 4)  # Starting sector coordinates
        self.sector = ActiveSector(stars=4, starbases=1, enemies=0)
        # Initialize stardate between 1000000 and 2000000
        self.stardate = random.randint(1000000, 2000000)
        # Event system
        self.stardate_event_types = [StarbaseHail(), ShieldReplenish(), EnemyMove(),
                             EnemyFire(), EnemyAdvance()]
        self.warp_event_types = []

    def _format_stardate(self) -> str:
        """Format stardate as 99-9999-99, truncating all values to int"""
        stardate_str = str(int(self.stardate))
        # Pad with zeros if needed
        stardate_str = stardate_str.zfill(8)
        # Take only the first 8 digits if longer
        stardate_str = stardate_str[:8]
        # Format as 99-9999-99
        return f"{stardate_str[:2]}-{stardate_str[2:6]}-{stardate_str[6:8]}"

    def _add_time(self, time_value: float) -> None:
        """Add time value to stardate"""
        self.stardate += time_value

    def _stardate_events(self) -> list:
        """Check if this is the 3rd stardate increment and generate events if needed"""
        # Check every 3rd stardate increment
        events = []
        if self.stardate % 3 == 0:
            for event_type in self.stardate_event_types:
                if event_type.can_occur(self.state):
                    events.append(event_type.execute(self.state))
        return events

    def _warp_events(self) -> list:
        """Generate events specific to warping into a new sector"""
        events = []
        for event_type in self.warp_event_types:
            if event_type.can_occur(self.state):
                events.append(event_type.execute(self.state))
        return events

    def warp(self, y: int, x: int) -> dict:
        """
        Warp the ship to a new sector at coordinates (y, x).
        Returns the warp result dict from Galaxy's warp method.
        Energy cost: 10 * distance
        """
        # Use galaxy's warp method with current sector coordinates
        warp_result = self.galaxy.warp(y, x, self.sector_yx)
        
        # Check if warp was successful (distance > 0 means we actually moved)
        if warp_result["distance"] == 0:
            return warp_result
            
        # Calculate and deduct energy cost (10 * distance)
        energy_cost = 10 * warp_result["distance"]
        self.ship.energy -= energy_cost
        
        # Add time to stardate
        self._add_time(warp_result["time"])
        
        # Check for events
        self._warp_events()
        
        # Update sector coordinates
        self.sector_yx = warp_result["new_sector_yx"]
        
        # Unpack sector data and generate new active sector
        y, x = self.sector_yx
        _, enemy_count, starbase_count, star_count = self.galaxy.galaxy[y][x]
        self.sector = ActiveSector(stars=star_count, starbases=starbase_count, enemies=enemy_count)
        
        # Add events to response
        warp_result["events"] = self._warp_events()
        
        return warp_result

    def subwarp(self, y: int, x: int) -> dict:
        """
        Move the ship within the current sector to coordinates (y, x).
        Returns the subwarp result dict from Sector's subwarp method.
        Energy cost: 2 * distance
        Max distance: 3 if enemies present, 10 otherwise
        """
        # Determine max distance based on enemy presence
        max_distance = 3 if self.sector.enemies > 0 else 10
        
        # Get the subwarp result from the sector
        subwarp_result = self.sector.subwarp((y, x), max_distance)
        
        # Calculate distance from path length (subtract 1 for starting position)
        distance = len(subwarp_result["path"]) - 1 if subwarp_result["path"] else 0
        
        # Calculate and deduct energy cost (2 * distance)
        energy_cost = 2 * distance
        self.ship.energy -= energy_cost
        
        # Add time to stardate
        self._add_time(subwarp_result["time"])
        
        # Check for events
        self._stardate_events()
        
        # Add events to response
        subwarp_result["events"] = self._stardate_events()
        
        return subwarp_result

    def dock(self) -> dict:
        """
        Attempt to dock with a starbase.
        Requirements:
        - Starbase must be in one of the 8 adjacent positions around the ship
        - No enemies in the sector
        Returns dict with success status and time consumed (0.5)
        """
        # Get the dock result from the sector
        dock_result = self.sector.dock()
        
        # If docking was successful, repair ship and add time to stardate
        if dock_result["success"]:
            self.ship.shields = self.ship.max_shields
            self.ship.energy = self.ship.max_energy
            self.ship.quantorpedoes = self.ship.max_quantorpedoes
            dock_result["message"] = "Successfully docked with starbase. Ship recharged."
            
            # Add time to stardate
            self._add_time(dock_result["time"])
        
        # Check for events
        self._stardate_events()
        
        # Add events to response
        dock_result["events"] = self._stardate_events()
        
        return dock_result

    def long_range_scan(self) -> dict:
        """
        Perform a long range scan of the 3x3 area around the current sector.
        Returns the scan result from Galaxy's long_range_scan method.
        Energy cost: 100
        """
        # Check if ship has enough energy
        if self.ship.energy < 100:
            return {
                "error": "Insufficient energy",
                "required_energy": 100,
                "current_energy": self.ship.energy
            }
        
        # Deduct energy cost
        self.ship.energy -= 100
        
        # Perform the scan using galaxy's long_range_scan method
        scan_result = self.galaxy.long_range_scan(self.sector_yx)
        
        # Check for events
        self._stardate_events()
        
        return {
            "scan": scan_result,
            "energy_cost": 100,
            "remaining_energy": self.ship.energy,
            "events": self._stardate_events()
        }

    def blast(self, y: int, x: int) -> dict:
        """
        Fire a blaston beam at the specified coordinates (y, x).
        The first enemy in the beam path is hit and destroyed.
        Energy cost scales with the square root of euclidean distance.
        Returns the blast result from Sector's blast method.
        """
        # Get the blast result from the sector
        blast_result = self.sector.blast((y, x))
        
        # If blast was successful, deduct energy cost, add time to stardate, and update galaxy enemy count
        if blast_result["success"]:
            energy_cost = blast_result["energy_cost"]
            
            # Check if ship has enough energy
            if self.ship.energy < energy_cost:
                # Set energy to 0 instead of failing
                self.ship.energy = 0
                blast_result["remaining_energy"] = self.ship.energy
            else:
                # Deduct energy cost
                self.ship.energy -= energy_cost
                blast_result["remaining_energy"] = self.ship.energy
            
            # Add time to stardate
            self._add_time(blast_result["time"])
            
            # Update galaxy enemy count for this sector
            self.galaxy.update_sector_data(self.sector_yx, self.sector.enemies, self.sector.starbases, self.sector.stars)
        
        # Check for events
        self._stardate_events()
        
        # Add events to response
        blast_result["events"] = self._stardate_events()
        
        return blast_result

    def torpedo(self, y: int, x: int) -> dict:
        """
        Fire a quantorpedo at the specified coordinates (y, x).
        The first enemy in the torpedo path is hit and destroyed.
        Consumes one quantorpedo from the ship and 100 energy.
        Returns the torpedo result from Sector's torpedo method.
        """
        # Check if ship has quantorpedoes
        if self.ship.quantorpedoes <= 0:
            return {
                "success": False,
                "error": "No quantorpedoes remaining",
                "time": 0
            }
        
        # Get the torpedo result from the sector
        torpedo_result = self.sector.torpedo((y, x))
        
        # If torpedo was successful, consume one quantorpedo, deduct energy cost, add time to stardate, and update galaxy enemy count
        if torpedo_result["success"]:
            # Consume one quantorpedo
            self.ship.quantorpedoes -= 1
            torpedo_result["remaining_quantorpedoes"] = self.ship.quantorpedoes
            
            # Deduct energy cost
            energy_cost = torpedo_result["energy_cost"]
            if self.ship.energy < energy_cost:
                # Set energy to 0 instead of failing
                self.ship.energy = 0
                torpedo_result["remaining_energy"] = self.ship.energy
            else:
                # Deduct energy cost
                self.ship.energy -= energy_cost
                torpedo_result["remaining_energy"] = self.ship.energy
            
            # Add time to stardate
            self._add_time(torpedo_result["time"])
            
            # Update galaxy enemy count for this sector
            self.galaxy.update_sector_data(self.sector_yx, self.sector.enemies, self.sector.starbases, self.sector.stars)
        
        # Check for events
        self._stardate_events()
        
        # Add events to response
        torpedo_result["events"] = self._stardate_events()
        
        return torpedo_result

    @property
    def state(self) -> GameState:
        """Get the current game state"""
        # Convert 2D map to list of strings
        map_strings = [''.join(row) for row in self.sector.map]
        
        return {
            "ship_max_hull": self.ship.max_hull,
            "ship_hull": self.ship.hull,
            "ship_max_shields": self.ship.max_shields,
            "ship_shields": self.ship.shields,
            "ship_energy": self.ship.energy,
            "ship_quantorpedoes": self.ship.quantorpedoes,
            "ship_yx": self.sector.ship_yx,
            "starbase_yx": self.sector.starbase_yx,
            "enemies_yx": self.sector.enemies_yx,
            "star_count": self.sector.stars,
            "base_count": self.sector.starbases,
            "enemy_count": self.sector.enemies,
            "map": map_strings,
            "stardate": self._format_stardate()
        }
