from .ship import Ship
from .sector import ActiveSector
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
        self.ship = Ship()
        self.sector_yx = (4, 4)  # Starting sector coordinates
        self.galaxy = self._generate_galaxy()
        self.sector = ActiveSector(stars=4, starbases=1, enemies=0)

    def _generate_galaxy(self) -> List[List[Tuple[bool, int, int, int]]]:
        """Generate a 10x10 galaxy grid with random sector data"""
        galaxy = []
        for y in range(10):
            row = []
            for x in range(10):
                # Generate random counts for each sector
                
                if y == 4 and x == 4:
                    visible = True
                    enemy_count = 0
                    starbase_count = 1
                    star_count = 4
                else:
                    visible = False
                    enemy_count = random.randint(0, 9)
                    starbase_count = random.randint(0, 1)
                    star_count = random.randint(2, 8)
                    
                row.append((visible, enemy_count, starbase_count, star_count))
            galaxy.append(row)
        return galaxy

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

    def galaxy_map(self) -> List[List[Tuple[int, int, int]]]:
        """Return the complete 10x10 galaxy map with hidden data for non-visible sectors"""
        result = []
        for y in range(10):
            row = []
            for x in range(10):
                visible, enemy_count, starbase_count, star_count = self.galaxy[y][x]
                if visible:
                    row.append((enemy_count, starbase_count, star_count))
                else:
                    row.append((0, 0, 0))
            result.append(row)
        return result

    def long_range_scan(self) -> List[List[Tuple[int, int, int]]]:
        """
        Return a 3x3 grid around the current sector position.
        Each element is (enemy_count, starbase_count, star_count).
        Marks scanned sectors as visible and returns (0,0,0) for sectors outside the galaxy bounds.
        """
        current_y, current_x = self.sector_yx
        scan_area = []
        
        for y_offset in range(-1, 2):  # -1, 0, 1
            row = []
            for x_offset in range(-1, 2):  # -1, 0, 1
                galaxy_y = current_y + y_offset
                galaxy_x = current_x + x_offset
                
                # Check if position is within galaxy bounds (0-9)
                if 0 <= galaxy_y < 10 and 0 <= galaxy_x < 10:
                    visible, enemy_count, starbase_count, star_count = self.galaxy[galaxy_y][galaxy_x]
                    # Mark this sector as visible since we're scanning it
                    self.galaxy[galaxy_y][galaxy_x] = (True, enemy_count, starbase_count, star_count)
                    row.append((enemy_count, starbase_count, star_count))
                else:
                    # Outside galaxy bounds
                    row.append((0, 0, 0))
            scan_area.append(row)
        
        return scan_area
