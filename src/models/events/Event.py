from abc import ABC, abstractmethod
from typing import Dict, Any

class Event(ABC):
    """Base class for all game events"""
    
    @abstractmethod
    def can_occur(self, game_state: Dict[str, Any]) -> bool:
        """Check if this event can occur given the current game state"""
        pass
    
    @abstractmethod
    def execute(self, game_state: Dict[str, Any]) -> str:
        """Execute the event and return the event message"""
        pass 