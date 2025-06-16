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

    def path(self, x1: int, y1: int, dest_x: int, dest_y: int) -> List[Tuple[int, int]]:
        """
        Calculate the path from (x1,y1) to destination using Bresenham's line algorithm.
        Returns a list of (x, y) tuples representing the points visited.
        """
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

    def subwarp(self, dest_x: int, dest_y: int) -> Tuple[int, int]:
        """
        Move the ship point by point towards the destination using path.
        Returns the final position (x, y) where the ship ended up.
        """
        move_path = self.path(self.ship_x, self.ship_y, dest_x, dest_y)
        if not move_path:
            return self.ship_x, self.ship_y
            
        # Update map and ship position
        self.map[self.ship_y][self.ship_x] = "."
        self.ship_x, self.ship_y = move_path[-1]
        self.map[self.ship_y][self.ship_x] = "S"
        
        return self.ship_x, self.ship_y
