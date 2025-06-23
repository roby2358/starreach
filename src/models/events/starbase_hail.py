from typing import Dict, Any, List
from .Event import Event

class StarbaseHail(Event):
    """Starbase hails the ship"""
    
    def can_occur(self, game: 'Game') -> bool:
        return game.sector.starbases > 0
    
    def execute(self, game: 'Game') -> List[str]:
        if game.sector.enemies == 0:
            return ["Starbase hails your ship"] 
        else:
            return ["Starbase under attack, requests assistance"] 