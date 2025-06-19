from .ship import Ship
from .sector import ActiveSector
from .galaxy import Galaxy
from typing import TypedDict, Tuple, List
import random

class GameState(TypedDict):
    """Immutable data structure representing the current game state"""
    ship_max_hull: int
    ship_hull: int
    ship_yx: Tuple[int, int]
    starbase_yx: Tuple[int, int]
    enemies_yx: List[Tuple[int, int]]
    star_count: int
    base_count: int
    enemy_count: int
    # 2D grid where first index is y, second is x
    map: list[list[str]]

class Game:
    def __init__(self):
        self.galaxy = Galaxy()
        self.ship = Ship()
        self.sector_yx = (4, 4)  # Starting sector coordinates
        self.sector = ActiveSector(stars=4, starbases=1, enemies=0)

    def warp(self, y: int, x: int) -> bool:
        """
        Warp the ship to a new sector at coordinates (y, x).
        Returns True if warp was successful, False otherwise.
        """
        # Validate coordinates are within galaxy bounds
        if not (0 <= y < 10 and 0 <= x < 10):
            return False
            
        # Update sector coordinates
        self.sector_yx = (y, x)
        
        # Get sector data from galaxy
        visible, enemy_count, starbase_count, star_count = self.galaxy.galaxy[y][x]
        
        # Mark sector as visible
        self.galaxy.galaxy[y][x] = (True, enemy_count, starbase_count, star_count)
        
        # Generate new active sector
        self.sector = ActiveSector(stars=star_count, starbases=starbase_count, enemies=enemy_count)
        
        return True

    @property
    def state(self) -> GameState:
        """Get the current game state"""
        return {
            "ship_max_hull": self.ship.max_hull,
            "ship_hull": self.ship.hull,
            "ship_yx": self.sector.ship_yx,
            "starbase_yx": self.sector.starbase_yx,
            "enemies_yx": self.sector.enemies_yx,
            "star_count": self.sector.stars,
            "base_count": self.sector.starbases,
            "enemy_count": self.sector.enemies,
            "map": self.sector.map
        }
