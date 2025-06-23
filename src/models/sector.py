from typing import List, Tuple, Optional
import random
import math

# Rasphyx
# Geakthon
# Deltaclast
# Auvoros
# Raskaos

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

    @staticmethod
    def euclidean_distance(pos1: Tuple[int, int], pos2: Tuple[int, int]) -> float:
        """Calculate the Euclidean distance between two positions"""
        y1, x1 = pos1
        y2, x2 = pos2
        return math.sqrt((y2 - y1)**2 + (x2 - x1)**2)

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

            # Add point to path
            path.append((next_y, next_x))

            # If we hit an obstacle, stop
            if not self._is_valid_position(next_y, next_x):
                break
                
            # If we've reached the destination, stop
            if next_x == x2 and next_y == y2:
                break
        
        return path

    def calculate_movement_path(self, move_path: List[Tuple[int, int]], max_distance: int) -> tuple:
        """
        Calculate the actual movement path and distance based on max_distance limit.
        Returns tuple of (truncated_path, actual_distance).
        """
        # Calculate the full distance (number of sectors traversed)
        # Subtract 1 because we don't count the starting position
        full_distance = len(move_path) - 1
        
        # Limit the actual distance traveled to max_distance
        actual_distance = min(full_distance, max_distance)
        
        # If we're limiting the movement, truncate the path
        # Keep the starting position plus the limited number of moves
        if actual_distance < full_distance:
            truncated_path = move_path[:actual_distance + 1]
        else:
            truncated_path = move_path
        
        return truncated_path, actual_distance

    def subwarp(self, dest_yx: Tuple[int, int], max_distance: int) -> dict:
        """
        Move the ship point by point towards the destination using path.
        Returns a dict with new_ship_yx, distance, and time.
        """
        move_path = self.path(self.ship_yx, dest_yx)
        
        # If the last element in the path isn't valid, remove it
        if move_path and not self._is_valid_position(*move_path[-1]):
            move_path.pop()
            
        # If path is now empty after removing invalid last element
        if not move_path:
            return {
                "new_ship_yx": self.ship_yx,
                "time": 0,
                "path": move_path
            }
            
        # Calculate movement path and distance using the factored method
        truncated_path, actual_distance = self.calculate_movement_path(move_path, max_distance)
        
        # Calculate time (actual_distance * 1)
        time = actual_distance * 1
            
        # Update map and ship position
        self.set_space(self.ship_yx, ".")
        self.ship_yx = truncated_path[-1]
        self.set_space(self.ship_yx, "S")
        
        return {
            "new_ship_yx": self.ship_yx,
            "time": time,
            "path": truncated_path
        }

    def dock(self) -> dict:
        """
        Attempt to dock with a starbase.
        Requirements:
        - Starbase must be in one of the 8 adjacent positions around the ship
        - No enemies in the sector
        Returns dict with success status and time consumed (5)
        """
        # Check if there are enemies in the sector
        if self.enemies > 0:
            return {
                "success": False,
                "error": "Cannot dock while enemies are present in the sector",
                "time": 0
            }
        
        # Check if there's a starbase in the sector
        if self.starbases == 0 or self.starbase_yx is None:
            return {
                "success": False,
                "error": "No starbase present in this sector",
                "time": 0
            }
        
        # Get ship and starbase positions
        ship_y, ship_x = self.ship_yx
        base_y, base_x = self.starbase_yx
        
        # Check if starbase is adjacent to ship (in one of the 8 surrounding positions)
        y_diff = abs(ship_y - base_y)
        x_diff = abs(ship_x - base_x)
        
        if y_diff > 1 or x_diff > 1:
            return {
                "success": False,
                "error": "Starbase is not adjacent to the ship",
                "time": 0
            }
        
        # Docking successful
        return {
            "success": True,
            "message": "Successfully docked with starbase.",
            "time": 5
        }

    def _target_enemy(self, target_yx: Tuple[int, int]) -> dict:
        """
        Target an enemy along the path from ship to target position.
        Returns dict with success status, beam path, and hit enemy position.
        """
        # Calculate the path from ship to target
        beam_path = self.path(self.ship_yx, target_yx)
        
        if not beam_path:
            return {
                "success": False,
                "error": "Invalid target position",
                "path": beam_path,
                "hit_enemy_pos": None
            }
        
        # Find the first enemy in the beam path
        hit_enemy_pos = None
        for pos in beam_path:
            if pos in self.enemies_yx:
                hit_enemy_pos = pos
                break
        
        # If no enemy was hit, return failure
        if hit_enemy_pos is None:
            return {
                "success": False,
                "error": "No enemy in beam path",
                "path": beam_path,
                "hit_enemy_pos": None
            }
        
        return {
            "success": True,
            "path": beam_path,
            "hit_enemy_pos": hit_enemy_pos
        }

    def blast(self, target_yx: Tuple[int, int]) -> dict:
        """
        Fire a blaston beam from the ship to the target position.
        The first enemy in the path is hit and removed from the sector.
        Energy cost scales with the square root of euclidean distance.
        Time scales with the square root of euclidean distance.
        Maximum range: 6 spaces.
        Returns dict with success status, energy cost, and hit enemy position.
        """
        # Calculate euclidean distance from ship to target
        ship_y, ship_x = self.ship_yx
        target_y, target_x = target_yx
        euclidean_distance = math.sqrt((target_y - ship_y)**2 + (target_x - ship_x)**2)
        
        # Check if target is within range (6 spaces maximum)
        if euclidean_distance > 6:
            return {
                "success": False,
                "error": "Target is out of range (maximum 6 spaces)",
                "energy_cost": 0,
                "time": 0,
                "path": []
            }
        
        # Use the factored out targeting logic
        targeting_result = self._target_enemy(target_yx)
        
        if not targeting_result["success"]:
            return {
                "success": False,
                "error": targeting_result["error"],
                "energy_cost": 0,
                "time": 0,
                "path": targeting_result["path"]
            }
        
        hit_enemy_pos = targeting_result["hit_enemy_pos"]
        beam_path = targeting_result["path"]
        
        # Calculate energy cost: 1000 at range 1, scales with square root of distance
        energy_cost = int(1000 * math.sqrt(euclidean_distance))
        
        # Calculate time: proportional to square root of distance
        # At range 1: time = 1, at range 6: time = 3
        # Formula: time = -0.37840 + 1.37840 * (distance**0.5)
        time = int(-0.37840 + 1.37840 * (euclidean_distance ** 0.5))
        
        # Remove the enemy from the sector
        self.set_space(hit_enemy_pos, ".")
        self.enemies_yx.remove(hit_enemy_pos)
        self.enemies -= 1
        
        return {
            "success": True,
            "message": f"Enemy destroyed at position {hit_enemy_pos}",
            "energy_cost": energy_cost,
            "hit_enemy_pos": hit_enemy_pos,
            "time": time
        }

    def torpedo(self, target_yx: Tuple[int, int]) -> dict:
        """
        Fire a quantorpedo from the ship to the target position.
        The first enemy in the path is hit and removed from the sector.
        Energy cost: 100 (flat rate).
        Returns dict with success status, energy cost, and hit enemy position.
        """
        # Use the factored out targeting logic
        targeting_result = self._target_enemy(target_yx)
        
        if not targeting_result["success"]:
            return {
                "success": False,
                "error": targeting_result["error"],
                "energy_cost": 0,
                "time": 0,
                "path": targeting_result["path"]
            }
        
        hit_enemy_pos = targeting_result["hit_enemy_pos"]
        torpedo_path = targeting_result["path"]
        
        # Flat energy cost of 100
        energy_cost = 100
        
        # Remove the enemy from the sector
        self.set_space(hit_enemy_pos, ".")
        self.enemies_yx.remove(hit_enemy_pos)
        self.enemies -= 1
        
        return {
            "success": True,
            "message": f"Enemy destroyed at position {hit_enemy_pos}",
            "energy_cost": energy_cost,
            "hit_enemy_pos": hit_enemy_pos,
            "time": 1
        }
