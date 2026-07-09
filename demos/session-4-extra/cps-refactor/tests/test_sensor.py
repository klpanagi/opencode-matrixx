"""Tests for the sensor driver module."""

from src.sensor_driver import SensorNode, SensorReading


class TestSensorNode:
    def test_start_stop(self):
        node = SensorNode("test_node", update_hz=10)
        node.start()
        assert node._running is True
        node.stop()
        assert node._running is False

    def test_read_returns_reading(self):
        node = SensorNode("test_node")
        node.start()
        reading = node.read()
        assert reading is not None
        assert isinstance(reading, SensorReading)
        assert reading.range_m > 0

    def test_statistics_with_readings(self):
        node = SensorNode("test_node")
        node.start()
        for _ in range(3):
            node.read()
        stats = node.statistics()
        assert stats["count"] == 3
        assert stats["mean_range"] > 0
