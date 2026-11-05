from typing import List
from .Event import Event

class EnemyAdvance(Event):
    """Enemy advances towards the ship"""
    
    def can_occur(self, game: 'Game') -> bool:
        return game.sector.enemies > 0
    
    def execute(self, game: 'Game') -> List[str]:
        return []
    
    def execute_one(self, game: 'Game', enemy_pos: tuple) -> List[str]:
        """Execute advance for a specific enemy at given coordinates"""
        ship_pos = game.sector.ship_yx
        
        # Calculate path from enemy to ship
        path = game.sector.path(enemy_pos, ship_pos)
        
        # Move enemy up to 2 spaces along the path
        max_moves = min(2, len(path) - 1)
        new_enemy_pos = path[max_moves]
        
        # Check if the new position is valid and not occupied
        if (game.sector._is_valid_position(*new_enemy_pos) and 
            new_enemy_pos not in game.sector.enemies_yx and
            new_enemy_pos != ship_pos):
            
            # Update the map and enemy position
            game.sector.set_space(enemy_pos, ".")
            game.sector.set_space(new_enemy_pos, "E")
            
            # Update the enemies list
            enemy_index = game.sector.enemies_yx.index(enemy_pos)
            game.sector.enemies_yx[enemy_index] = new_enemy_pos
            
            return [f"Enemy advanced from {enemy_pos} to {new_enemy_pos}"]
        else:
            return ["Enemy attempted to advance but path was blocked"] 