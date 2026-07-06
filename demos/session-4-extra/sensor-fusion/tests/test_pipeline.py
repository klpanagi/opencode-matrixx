"""Tests for the sensor processing pipeline."""
from src.sensor_node import SensorReading
from src.pipeline import SensorPipeline


def test_pipeline_routes_readings_correctly():
    pipeline = SensorPipeline()
    readings = [
        SensorReading("imu_accel", 9.81, 100.0, 0.99),
        SensorReading("lidar_front", 12.5, 100.0, 0.95),
        SensorReading("radar_left", 45.0, 100.0, 0.60),
    ]
    results = pipeline.process_batch(readings)
    assert results["imu"] is not None
    assert results["lidar"] is not None
    assert results["radar"] is not None


def test_pipeline_reset_clears_all_nodes():
    pipeline = SensorPipeline()
    pipeline.reset_all()
    assert pipeline.imu_node.fused_value is None
    assert pipeline.lidar_node.fused_value is None
    assert pipeline.radar_node.fused_value is None
