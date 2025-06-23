from typing import Dict, Any, List
from .Event import Event

class EnemyAdvance(Event):
    """Enemies advance towards the ship"""
    
    def can_occur(self, game: 'Game') -> bool:
        return game.sector.enemies > 0
    
    def execute(self, game: 'Game') -> List[str]:
        # Stub implementation
        return ["Enemies advance towards your ship"] 