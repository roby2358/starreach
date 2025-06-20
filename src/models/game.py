from .ship import Ship
from .sector import ActiveSector
from .galaxy import Galaxy
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

class Game:
    def __init__(self):
        self.galaxy = Galaxy()
        self.ship = Ship()
        self.sector_yx = (4, 4)  # Starting sector coordinates
        self.sector = ActiveSector(stars=4, starbases=1, enemies=0)

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
        
        # Update sector coordinates
        self.sector_yx = warp_result["new_sector_yx"]
        
        # Unpack sector data and generate new active sector
        y, x = self.sector_yx
        _, enemy_count, starbase_count, star_count = self.galaxy.galaxy[y][x]
        self.sector = ActiveSector(stars=star_count, starbases=starbase_count, enemies=enemy_count)
        
        return warp_result

    def subwarp(self, y: int, x: int) -> dict:
        """
        Move the ship within the current sector to coordinates (y, x).
        Returns the subwarp result dict from Sector's subwarp method.
        Energy cost: 2 * distance
        """
        # Get the subwarp result from the sector
        subwarp_result = self.sector.subwarp((y, x))
        
        # Calculate and deduct energy cost (2 * distance)
        energy_cost = 2 * subwarp_result["distance"]
        self.ship.energy -= energy_cost
        
        return subwarp_result

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
            "map": map_strings
        }
