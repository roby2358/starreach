from typing import Dict, Any
from .Event import Event

class StarbaseHail(Event):
    """Starbase hails the ship"""
    
    def can_occur(self, game_state: Dict[str, Any]) -> bool:
        return game_state.get("base_count", 0) > 0 and game_state.get("enemy_count", 0) == 0
    
    def execute(self, game_state: Dict[str, Any]) -> str:
        # Stub implementation
        return "Starbase hails your ship" 