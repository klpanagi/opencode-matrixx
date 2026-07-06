"""
CLI entry point for the sensor fusion system.
"""
from src.sensor_node import SensorNode, SensorReading
from src.pipeline import SensorPipeline


def simulate_sensor_data() -> None:
    pipeline = SensorPipeline()
    readings = [
        SensorReading("imu_accel", 9.81, 100.0, 0.99),
        SensorReading("imu_gyro", 0.02, 100.0, 0.85),
        SensorReading("lidar_front", 12.5, 100.0, 0.95),
        SensorReading("radar_left", 45.0, 100.0, 0.60),
    ]
    results = pipeline.process_batch(readings)
    for sensor, value in results.items():
        status = "✓" if value is not None else "✗"
        print(f"  {status} {sensor}: {value}")


if __name__ == "__main__":
    simulate_sensor_data()
