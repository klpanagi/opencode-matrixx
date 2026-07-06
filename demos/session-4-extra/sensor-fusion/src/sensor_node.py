"""
Sensor Fusion Node for CPS — core component that merges
multiple sensor inputs into a unified state estimate.
"""
from dataclasses import dataclass
from typing import List, Optional


@dataclass
class SensorReading:
    sensor_id: str
    value: float
    timestamp: float
    confidence: float


class SensorNode:
    """Merges multiple sensor readings into a fused estimate.

    This is a core CPS component used by the entire system.
    Renaming requires coordinated updates across all references.
    """

    def __init__(self, node_id: str, threshold: float = 0.5):
        self.node_id = node_id
        self.threshold = threshold
        self.readings: List[SensorReading] = []
        self._fused_value: Optional[float] = None

    def ingest(self, reading: SensorReading) -> None:
        self.readings.append(reading)
        self._fuse()

    def _fuse(self) -> None:
        weighted_sum = 0.0
        total_weight = 0.0
        for r in self.readings:
            if r.confidence >= self.threshold:
                weighted_sum += r.value * r.confidence
                total_weight += r.confidence
        self._fused_value = weighted_sum / total_weight if total_weight > 0 else None

    @property
    def fused_value(self) -> Optional[float]:
        return self._fused_value

    def reset(self) -> None:
        self.readings.clear()
        self._fused_value = None
