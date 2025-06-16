from typing import List, Tuple, Optional
import random
from itertools import islice

class Sector:
    def __init__(self, stars: int, starbases: int, enemies: int):
        self.stars = stars
        self.starbases = starbases
        self.enemies = enemies
        # Initialize 10x10 grid with empty spaces
        self.map = [["." for _ in range(10)] for _ in range(10)]
        # Place ship randomly first
        ship_pos = self._find_valid_position()
        if ship_pos:
            self.ship_x, self.ship_y = ship_pos
            self.map[self.ship_y][self.ship_x] = "S"
        # Then place other items
        self._place_items(self.stars, "*")
        self._place_items(self.starbases, "B")

    @staticmethod
    def _random_position() -> Tuple[int, int]:
        return random.randint(0, 9), random.randint(0, 9)

    def _is_valid_position(self, x: int, y: int) -> bool:
        # Check if position is within bounds
        if not (0 <= x < 10 and 0 <= y < 10):
            return False
        # Check if position is empty
        return self.map[y][x] == "."

    def _find_valid_position(self) -> Optional[Tuple[int, int]]:
        for _ in range(100):  # max attempts
            pos = self._random_position()
            if self._is_valid_position(*pos):
                return pos
        return None

    def _place_items(self, count: int, symbol: str):
        for _ in range(count):
            if pos := self._find_valid_position():
                x, y = pos
                self.map[y][x] = symbol
