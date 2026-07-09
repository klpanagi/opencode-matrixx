"""Analyze CPS sensor log for intermittent dropout patterns."""

import csv
from collections import defaultdict
from typing import TextIO


def parse_log(file: TextIO) -> list[dict]:
    reader = csv.DictReader(file)
    return [row for row in reader]


def find_dropouts(rows: list[dict]) -> list[dict]:
    return [r for r in rows if r["EVENT"] == "DROPOUT"]


def find_low_confidence(rows: list[dict], threshold: float = 0.5) -> list[dict]:
    return [
        r for r in rows
        if r["EVENT"] == "FUSION" and float(r["VALUE"].split("=")[1]) < threshold
    ]


def group_by_node(rows: list[dict]) -> dict[str, list[dict]]:
    groups: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        groups[r["NODE"]].append(r)
    return dict(groups)


if __name__ == "__main__":
    with open("sensor_log.txt") as f:
        rows = parse_log(f)

    dropouts = find_dropouts(rows)
    low_conf = find_low_confidence(rows)

    print(f"Total events: {len(rows)}")
    print(f"Dropouts: {len(dropouts)}")
    for d in dropouts:
        print(f"  {d['TIMESTAMP']} - {d['NODE']}: {d['VALUE']}")

    print(f"\nLow-confidence events: {len(low_conf)}")
    for lc in low_conf:
        print(f"  {lc['TIMESTAMP']} - confidence={lc['VALUE']}")
