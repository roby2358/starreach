from typing import Dict, Any, List
from .Event import Event

class EnemyFire(Event):
    """Enemies fire at the ship"""
    
    def can_occur(self, game: 'Game') -> bool:
        return game.sector.enemies > 0
    
    def execute(self, game: 'Game') -> List[str]:
        # Stub implementation
        return ["Enemies fire at your ship"] 