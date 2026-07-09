"""Navigation controller that reads sensor fusion and drives actuators."""

from src.sensor_driver import SensorNode


class NavigationController:
    """Reads sensor fusion data and computes actuator commands."""

    def __init__(self, sensor: SensorNode):
        self._sensor = sensor

    def step(self) -> dict:
        reading = self._sensor.read()
        if reading is None:
            return {"action": "stop", "reason": "no_sensor_data"}
        if reading.confidence < 0.8:
            return {"action": "slow_down", "reason": "low_confidence"}
        if reading.range_m < 1.0:
            return {"action": "emergency_stop", "reason": "obstacle_imminent"}
        return {"action": "continue", "throttle": 0.5}
