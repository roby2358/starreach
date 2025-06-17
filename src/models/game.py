from .ship import Ship
from .sector import Sector
from typing import TypedDict, Tuple, List

class GameState(TypedDict):
    ship_max_hull: int
    ship_hull: int
    ship_xy: Tuple[int, int]
    starbase_xy: Tuple[int, int] | None
    enemies_xy: List[Tuple[int, int]]
    star_count: int
    base_count: int
    enemy_count: int
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
            "ship_xy": self.sector.ship_xy,
            "starbase_xy": self.sector.starbase_xy,
            "enemies_xy": self.sector.enemies_xy,
            "star_count": self.sector.stars,
            "base_count": self.sector.starbases,
            "enemy_count": self.sector.enemies,
            "map": self.sector.map
        }
