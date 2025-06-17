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
        if ship_pos := self._find_valid_position():
            self.ship_xy = ship_pos
            self.set_space(ship_pos, "S")
        # Then place other items
        self._place_items(self.stars, "*")
        self._place_items(self.starbases, "B")
        # Initialize empty lists for starbases and enemies
        self.starbase_xy = None
        self.enemies_xy = []

    def set_space(self, pos: Tuple[int, int], char: str) -> None:
        """Set a space on the map to the given character."""
        x, y = pos
        self.map[y][x] = char

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
                self.set_space(pos, symbol)
                if symbol == "B":
                    self.starbase_xy = pos
                # We'll handle enemies later

    def path(self, start_xy: Tuple[int, int], dest_xy: Tuple[int, int]) -> List[Tuple[int, int]]:
        """
        Calculate the path from start_xy to dest_xy using Bresenham's line algorithm.
        Returns a list of (x, y) tuples representing the points visited.
        """
        x1, y1 = start_xy
        dest_x, dest_y = dest_xy
        
        # If destination is the same as start position, return start position
        if dest_x == x1 and dest_y == y1:
            return [(x1, y1)]
            
        # Bresenham's line algorithm
        x2, y2 = dest_x, dest_y
        
        dx = abs(x2 - x1)
        dy = abs(y2 - y1)
        sx = 1 if x1 < x2 else -1
        sy = 1 if y1 < y2 else -1
        err = dx - dy
        
        next_x, next_y = x1, y1
        path = [(x1, y1)]
        
        while True:
            # Calculate next point using Bresenham's algorithm
            e2 = 2 * err
            if e2 > -dy:
                err -= dy
                next_x += sx
            if e2 < dx:
                err += dx
                next_y += sy
                
            # If we hit an obstacle, stop at previous position
            if not self._is_valid_position(next_x, next_y):
                break
                
            # Add point to path
            path.append((next_x, next_y))
            
            # If we've reached the destination, stop
            if next_x == x2 and next_y == y2:
                break
        
        return path

    def subwarp(self, dest_xy: Tuple[int, int]) -> Tuple[int, int]:
        """
        Move the ship point by point towards the destination using path.
        Returns the final position (x, y) where the ship ended up.
        """
        move_path = self.path(self.ship_xy, dest_xy)
        if not move_path:
            return self.ship_xy
            
        # Update map and ship position
        self.set_space(self.ship_xy, ".")
        self.ship_xy = move_path[-1]
        self.set_space(self.ship_xy, "S")
        
        return self.ship_xy
