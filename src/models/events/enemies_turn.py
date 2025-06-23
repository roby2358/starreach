from typing import Dict, Any, List
from .Event import Event

class EnemiesTurn(Event):
    """Enemies take their turn"""
    
    def can_occur(self, game: 'Game') -> bool:
        return game.sector.enemies > 0
    
    def execute(self, game: 'Game') -> List[str]:
        # Stub implementation
        return ["Enemies take their turn"] 