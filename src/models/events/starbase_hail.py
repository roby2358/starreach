from typing import Dict, Any, List
from .Event import Event

class StarbaseHail(Event):
    """Starbase hails the ship"""
    
    def can_occur(self, game: 'Game') -> bool:
        return game.sector.starbases > 0
    
    def execute(self, game: 'Game') -> List[str]:
        if game.sector.enemies == 0:
            return ["Starbase communication: all clear, approach for docking"] 
        else:
            return ["Starbase communication: under attack, needs assistance"] 