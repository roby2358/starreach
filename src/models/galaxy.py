from typing import List, Tuple, Optional
import random

class Galaxy:
    def __init__(self):
        self.galaxy = self._generate_galaxy()

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

    def warp(self, y: int, x: int, current_sector_yx: Tuple[int, int]) -> dict:
        """
        Warp to a new sector at coordinates (y, x).
        Returns a dict with new_sector_yx, distance, and time.
        If coordinates are invalid, returns original position with 0 distance and time.
        """
        # Validate coordinates are within galaxy bounds
        if not (0 <= y < 10 and 0 <= x < 10):
            return {
                "new_sector_yx": current_sector_yx,
                "distance": 0,
                "time": 0.0
            }
            
        # Get sector data from galaxy and mark sector as visible
        _, enemy_count, starbase_count, star_count = self.galaxy[y][x]
        self.galaxy[y][x] = (True, enemy_count, starbase_count, star_count)
        
        # Calculate Euclidean distance between current and target sectors
        current_y, current_x = current_sector_yx
        euclidean_distance = ((y - current_y) ** 2 + (x - current_x) ** 2) ** 0.5
        
        # Calculate distance (Euclidean distance * 10 rounded to int)
        distance = int(euclidean_distance * 10)
        
        # Calculate time (distance * 0.01)
        time = distance * 0.01
        
        return {
            "new_sector_yx": (y, x),
            "distance": distance,
            "time": time
        }

    def galaxy_map(self) -> List[str]:
        """Return the complete 10x10 galaxy map with hidden data for non-visible sectors"""
        result = []
        for y in range(10):
            row_string = ""
            for x in range(10):
                visible, enemy_count, starbase_count, star_count = self.galaxy[y][x]
                if visible:
                    row_string += f"{enemy_count}|{starbase_count}|{star_count}"
                else:
                    row_string += "....."
                # Add space between sectors (except for the last one)
                if x < 9:
                    row_string += " "
            result.append(row_string)
        return result

    def long_range_scan(self, sector_yx: Tuple[int, int]) -> List[str]:
        """
        Return a 3x3 grid around the current sector position.
        Each element is (enemy_count, starbase_count, star_count).
        Marks scanned sectors as visible and returns (0,0,0) for sectors outside the galaxy bounds.
        """
        current_y, current_x = sector_yx
        scan_area = []
        
        for y_offset in range(-1, 2):  # -1, 0, 1
            row_string = ""
            for x_offset in range(-1, 2):  # -1, 0, 1
                galaxy_y = current_y + y_offset
                galaxy_x = current_x + x_offset
                
                # Check if position is within galaxy bounds (0-9)
                if 0 <= galaxy_y < 10 and 0 <= galaxy_x < 10:
                    visible, enemy_count, starbase_count, star_count = self.galaxy[galaxy_y][galaxy_x]
                    # Mark this sector as visible since we're scanning it
                    self.galaxy[galaxy_y][galaxy_x] = (True, enemy_count, starbase_count, star_count)
                    row_string += f"{enemy_count}|{starbase_count}|{star_count}"
                else:
                    # Outside galaxy bounds
                    row_string += "....."
                # Add space between sectors (except for the last one)
                if x_offset < 1:
                    row_string += " "
            scan_area.append(row_string)
        
        return scan_area 

    def update_sector_data(self, sector_yx: Tuple[int, int], enemies: int, starbases: int, stars: int) -> None:
        """
        Update the galaxy data for a specific sector with current counts.
        Marks the sector as visible and updates enemy, starbase, and star counts.
        """
        sector_y, sector_x = sector_yx
        if 0 <= sector_y < 10 and 0 <= sector_x < 10:
            self.galaxy[sector_y][sector_x] = (True, enemies, starbases, stars) 