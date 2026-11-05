"""Model generation and combat numbers cited as Evidence in docs/RATIONALE.md.

Usage: python tools/model_balance.py [galaxies]
Modeled only: these are formula/sampling results, not play measurements.
"""
import math
import statistics
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from src.models.galaxy import Galaxy  # noqa: E402


def main(n: int = 2000) -> None:
    enemies, bases, empty = [], [], []
    for _ in range(n):
        cells = [c for row in Galaxy().galaxy for c in row]
        enemies.append(sum(c[1] for c in cells))
        bases.append(sum(c[2] for c in cells))
        empty.append(sum(1 for c in cells if c[1] == 0))
    print(f"galaxies: {n}")
    print(f"enemies/galaxy mean {statistics.mean(enemies):.0f} range {min(enemies)}-{max(enemies)}")
    print(f"starbases/galaxy mean {statistics.mean(bases):.2f}; "
          f"P(Star Central only) {sum(b == 1 for b in bases) / n:.0%}")
    print(f"enemy-free sectors mean {statistics.mean(empty):.0f}")
    for d in (1, math.sqrt(2), 2, 3, 4, 5, 6):
        print(f"range {d:4.2f}: enemy fire {2000 * (1 / d) ** 1.57:5.0f} dmg | "
              f"blast {int(1000 * math.sqrt(d))} energy, time {int(-0.3784 + 1.3784 * d ** 0.5)}")


if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 2000)
