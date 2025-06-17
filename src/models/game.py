from .ship import Ship
from .sector import Sector
from typing import TypedDict, Tuple, List

class GameState(TypedDict):
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
        self.sector = Sector(stars=4, starbases=1, enemies=0)

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
