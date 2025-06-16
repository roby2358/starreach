from .ship import Ship
from .sector import Sector

class Game:
    def __init__(self):
        self.ship = Ship()
        self.sector = Sector(stars=4, starbases=1, enemies=0)
