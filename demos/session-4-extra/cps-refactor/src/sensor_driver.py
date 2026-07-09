"""ROS-like sensor driver for a simulated LIDAR/camera fusion node."""

import time
import random
from dataclasses import dataclass
from typing import Optional


@dataclass
class SensorReading:
    timestamp: float
    range_m: float
    bearing_rad: float
    confidence: float


class SensorNode:
    """Simulates a multi-modal sensor fusion node for a CPS robot.

    TODO: This class name is ambiguous — it manages sensor fusion, not a single sensor.
    The name should reflect fusion rather than a raw sensor.
    """

    def __init__(self, node_name: str, update_hz: int = 10):
        self.node_name = node_name
        self.update_hz = update_hz
        self._readings: list[SensorReading] = []
        self._running = False

    def start(self) -> None:
        self._running = True
        print(f"[{self.node_name}] Sensor node started at {self.update_hz}Hz")

    def stop(self) -> None:
        self._running = False
        print(f"[{self.node_name}] Sensor node stopped")

    def read(self) -> Optional[SensorReading]:
        if not self._running:
            return None
        reading = SensorReading(
            timestamp=time.time(),
            range_m=random.uniform(0.5, 30.0),
            bearing_rad=random.uniform(-3.14, 3.14),
            confidence=random.uniform(0.7, 1.0),
        )
        self._readings.append(reading)
        return reading

    def latest(self) -> Optional[SensorReading]:
        return self._readings[-1] if self._readings else None

    def statistics(self) -> dict:
        if not self._readings:
            return {"count": 0}
        ranges = [r.range_m for r in self._readings]
        return {
            "count": len(self._readings),
            "mean_range": sum(ranges) / len(ranges),
            "max_range": max(ranges),
        }
