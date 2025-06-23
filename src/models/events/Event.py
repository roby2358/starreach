from abc import ABC, abstractmethod
from typing import Dict, Any, List

class Event(ABC):
    """Base class for all game events"""
    
    @abstractmethod
    def can_occur(self, game: 'Game') -> bool:
        """Check if this event can occur given the current game state"""
        pass
    
    @abstractmethod
    def execute(self, game: 'Game') -> List[str]:
        """Execute the event and return a list of event messages"""
        pass 