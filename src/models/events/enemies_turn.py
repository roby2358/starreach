from typing import Dict, Any, List
import random
from .Event import Event
from .enemy_fire import EnemyFire
from .enemy_advance import EnemyAdvance

class EnemiesTurn(Event):
    """Enemies take their turn"""
    
    def can_occur(self, game: 'Game') -> bool:
        return game.sector.enemies > 0
    
    def execute(self, game: 'Game') -> List[str]:
        if game.sector.enemies == 0:
            return []

        # Calculate action distribution: 2/3 fire, 1/3 advance
        enemy_count = game.sector.enemies
        advance_count = int(enemy_count / 3)
        fire_count = enemy_count - advance_count
        
        action_matrix = (
            [('fire', EnemyFire)] * fire_count +
            [('advance', EnemyAdvance)] * advance_count
        )
        random.shuffle(action_matrix)
        
        return [
            message
            for (action_type, action_class), enemy_pos in zip(action_matrix, game.sector.enemies_yx)
            for message in action_class().execute_one(game, enemy_pos)
        ] 