from .ship import Ship
from .sector import Sector
from typing import TypedDict

class GameState(TypedDict):
    ship_max_hull: int
    ship_hull: int
    ship_x: int
    ship_y: int
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
            "ship_x": self.sector.ship_x,
            "ship_y": self.sector.ship_y,
            "star_count": self.sector.stars,
            "base_count": self.sector.starbases,
            "enemy_count": self.sector.enemies,
            "map": self.sector.map
        }
