from typing import Dict, Any, List
from .Event import Event

class ShieldReplenish(Event):
    """Shields are replenished"""
    
    def can_occur(self, game: 'Game') -> bool:
        return game.ship.shields < game.ship.max_shields
    
    def execute(self, game: 'Game') -> List[str]:
        # Stub implementation
        return ["Shields are replenished"] 