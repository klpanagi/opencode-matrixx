"""
Sensor processing pipeline — creates SensorNode instances and
coordinates multi-sensor fusion across the CPS.
"""
from src.sensor_node import SensorNode, SensorReading


class SensorPipeline:
    """Orchestrates multiple SensorNode instances."""

    def __init__(self):
        # These SensorNode references must all be updated on rename
        self.imu_node = SensorNode("imu_01", threshold=0.5)
        self.lidar_node = SensorNode("lidar_02", threshold=0.7)
        self.radar_node = SensorNode("radar_03", threshold=0.3)

    def process_batch(self, readings: list[SensorReading]) -> dict[str, float | None]:
        results: dict[str, float | None] = {}
        for reading in readings:
            if reading.sensor_id.startswith("imu"):
                self.imu_node.ingest(reading)
            elif reading.sensor_id.startswith("lidar"):
                self.lidar_node.ingest(reading)
            elif reading.sensor_id.startswith("radar"):
                self.radar_node.ingest(reading)
        results["imu"] = self.imu_node.fused_value
        results["lidar"] = self.lidar_node.fused_value
        results["radar"] = self.radar_node.fused_value
        return results

    def reset_all(self) -> None:
        self.imu_node.reset()
        self.lidar_node.reset()
        self.radar_node.reset()
