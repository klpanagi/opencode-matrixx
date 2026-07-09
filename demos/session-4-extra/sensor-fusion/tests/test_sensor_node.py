"""Tests for SensorNode fusion logic."""
from src.sensor_node import SensorNode, SensorReading


def test_sensor_node_basic_fusion():
    node = SensorNode("imu_01", threshold=0.5)
    r1 = SensorReading("accel", 9.81, 1000.0, 0.95)
    r2 = SensorReading("gyro", 0.01, 1000.0, 0.80)
    node.ingest(r1)
    node.ingest(r2)
    assert node.fused_value is not None
    assert 5.0 < node.fused_value < 10.0


def test_sensor_node_low_confidence_filtering():
    node = SensorNode("lidar_02", threshold=0.7)
    r1 = SensorReading("lidar", 3.5, 2000.0, 0.99)
    r2 = SensorReading("noisy", 100.0, 2000.0, 0.1)
    node.ingest(r1)
    node.ingest(r2)
    assert node.fused_value == 3.5


def test_sensor_node_reset():
    node = SensorNode("radar_03", threshold=0.5)
    node.ingest(SensorReading("radar", 50.0, 3000.0, 0.9))
    assert node.fused_value is not None
    node.reset()
    assert node.fused_value is None
    assert len(node.readings) == 0
