from typing import List
from .Event import Event

class EnemyFire(Event):
    """Enemy fires at the ship"""
    
    def can_occur(self, game: 'Game') -> bool:
        return game.sector.enemies > 0
    
    def execute(self, game: 'Game') -> List[str]:
        return []
    
    def execute_one(self, game: 'Game', enemy_pos: tuple) -> List[str]:
        """Execute fire for a specific enemy at given coordinates"""
        ship_pos = game.sector.ship_yx
        
        # Calculate path from enemy to ship
        path = game.sector.path(enemy_pos, ship_pos)
        
        # Check if path reaches the ship (not empty and last element is ship position)
        if not path or path[-1] != ship_pos:
            return [f"Enemy at {enemy_pos} fires raxxon beam but path is blocked"]
        
        # Calculate Euclidean distance using sector method
        euclidean_distance = game.sector.euclidean_distance(enemy_pos, ship_pos)
        
        # Calculate damage using the formula: 2000 * (1/distance)^1.57
        if euclidean_distance > 0:
            damage = 2000 * (1 / euclidean_distance) ** 1.57
        else:
            damage = 2000  # If distance is 0, full damage
        
        # Apply damage to ship (shields first, then hull)
        damage_dealt = self._apply_damage(game, damage)
        
        return [
            f"Enemy at {enemy_pos} fires raxxon beam! Distance: {euclidean_distance:.2f}, Damage: {damage:.0f}",
            f"Ship takes {damage_dealt:.0f} damage"
        ]
    
    def _apply_damage(self, game: 'Game', damage: float) -> float:
        """Apply damage to ship (shields first, then hull)"""
        damage_remaining = damage
        damage_dealt = 0
        
        if game.ship.shields > 0:
            shield_damage = min(damage_remaining, game.ship.shields)
            game.ship.shields -= shield_damage
            damage_remaining -= shield_damage
            damage_dealt += shield_damage
        
        if damage_remaining > 0 and game.ship.hull > 0:
            hull_damage = min(damage_remaining, game.ship.hull)
            game.ship.hull -= hull_damage
            damage_dealt += hull_damage
        
        return damage_dealt 