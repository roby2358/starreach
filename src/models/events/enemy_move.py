from typing import Dict, Any
from .Event import Event

class EnemyMove(Event):
    """Enemies move within the sector"""
    
    def can_occur(self, game_state: Dict[str, Any]) -> bool:
        return game_state.get("enemy_count", 0) > 0
    
    def execute(self, game_state: Dict[str, Any]) -> str:
        # Stub implementation
        return "Enemies move within the sector" 