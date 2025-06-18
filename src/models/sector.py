from typing import List, Tuple, Optional
import random
from itertools import islice

class ActiveSector:
    def __init__(self, stars: int, starbases: int, enemies: int):
        self.stars = stars
        self.starbases = starbases
        self.enemies = enemies
        # Initialize 10x10 grid with empty spaces
        self.map = [["." for _ in range(10)] for _ in range(10)]
        # Place ship randomly first
        if ship_pos := self._find_valid_position():
            self.ship_yx = ship_pos
            self.set_space(ship_pos, "S")
        # Then place other items
        self.starbase_yx = self._place_items(self.starbases, "B")[0] if self.starbases > 0 else None
        self.enemies_yx = self._place_items(self.enemies, "E")
        self._place_items(self.stars, "*")

    def set_space(self, pos: Tuple[int, int], char: str) -> None:
        """Set a space on the map to the given character."""
        y, x = pos
        self.map[y][x] = char

    @staticmethod
    def _random_position() -> Tuple[int, int]:
        return random.randint(0, 9), random.randint(0, 9)

    def _is_valid_position(self, y: int, x: int) -> bool:
        # Check if position is within bounds
        if not (0 <= y < 10 and 0 <= x < 10):
            return False
        # Check if position is empty
        return self.map[y][x] == "."

    def _find_valid_position(self) -> Optional[Tuple[int, int]]:
        for _ in range(100):  # max attempts
            pos = self._random_position()
            if self._is_valid_position(*pos):
                return pos
        return None

    def _place_items(self, count: int, symbol: str) -> List[Tuple[int, int]]:
        """Place items on the map and return their positions"""
        positions = []
        for _ in range(count):
            if pos := self._find_valid_position():
                self.set_space(pos, symbol)
                positions.append(pos)
        return positions

    def path(self, start_yx: Tuple[int, int], dest_yx: Tuple[int, int]) -> List[Tuple[int, int]]:
        """
        Calculate the path from start_yx to dest_yx using Bresenham's line algorithm.
        Returns a list of (y, x) tuples representing the points visited.
        """
        y1, x1 = start_yx
        dest_y, dest_x = dest_yx
        
        # If destination is the same as start position, return start position
        if dest_x == x1 and dest_y == y1:
            return [(y1, x1)]
            
        # Bresenham's line algorithm
        x2, y2 = dest_x, dest_y
        
        dx = abs(x2 - x1)
        dy = abs(y2 - y1)
        sx = 1 if x1 < x2 else -1
        sy = 1 if y1 < y2 else -1
        err = dx - dy
        
        next_x, next_y = x1, y1
        path = [(y1, x1)]
        
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
            if not self._is_valid_position(next_y, next_x):
                break
                
            # Add point to path
            path.append((next_y, next_x))
            
            # If we've reached the destination, stop
            if next_x == x2 and next_y == y2:
                break
        
        return path

    def subwarp(self, dest_yx: Tuple[int, int]) -> Tuple[int, int]:
        """
        Move the ship point by point towards the destination using path.
        Returns the final position (y, x) where the ship ended up.
        """
        move_path = self.path(self.ship_yx, dest_yx)
        if not move_path:
            return self.ship_yx
            
        # Update map and ship position
        self.set_space(self.ship_yx, ".")
        self.ship_yx = move_path[-1]
        self.set_space(self.ship_yx, "S")
        
        return self.ship_yx
