import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from eudr_agent import (  # noqa: E402
    decimal_places, ingest, normalize_id, parse_coord, run, validate,
)


# ---------------------------------------------------------------- unit: helpers

@pytest.mark.parametrize("raw,expected", [
    ("-2.1998402", 7),          # string, 7 decimals — the real file's shape
    ("28.865850", 6),           # trailing zero in text still counts as entered
    ("-2.1999", 4),             # below the floor
    ("2", 0),                   # integer text
    (None, 0),
    ("", 0),
    ("-2,1998402", 7),          # French decimal comma
    (-2.1998402, 7),            # float fallback via repr
    ("abc", 0),                 # garbage
])
def test_decimal_places(raw, expected):
    assert decimal_places(raw) == expected


@pytest.mark.parametrize("raw,expected", [
    ("KB - AM-1", "KB-AM-1"),
    ("  KB-AM-2 ", "KB-AM-2"),
    ("KB -AM- 3", "KB-AM-3"),
    (None, ""),
])
def test_normalize_id(raw, expected):
    assert normalize_id(raw) == expected


def test_parse_coord():
    assert parse_coord("-2.1998402") == pytest.approx(-2.1998402)
    assert parse_coord("28,86") == pytest.approx(28.86)
    assert parse_coord("n/a") is None
    assert parse_coord(None) is None


# ---------------------------------------------------------------- ingest

def test_ingest_joins_three_sheets(s13_file):
    farms = {f.farm_id: f for f in ingest(s13_file)}
    assert len(farms) == 6
    f1 = farms["TF-AA-1"]
    assert f1.village == "Kabamba"
    assert f1.operator_name == "Alice Test"
    assert f1.product == "Café"
    assert f1.harvest_kg == pytest.approx(228)
    assert len(f1.units) == 1
    assert farms["TF-AA-6"].units and len(farms["TF-AA-6"].units) == 2


def test_ingest_missing_sheet_raises(tmp_path):
    import openpyxl
    wb = openpyxl.Workbook()
    wb.active.title = "wrong"
    path = tmp_path / "bad.xlsx"
    wb.save(path)
    with pytest.raises(ValueError, match="Sheet starting with"):
        ingest(path)


# ---------------------------------------------------------------- validate

@pytest.fixture
def validated(s13_file):
    farms = ingest(s13_file)
    validate(farms)
    return {f.farm_id: f for f in farms}


def test_clean_farm_passes(validated):
    f = validated["TF-AA-1"]
    assert f.compliant and f.gps_ready and not f.warnings


def test_short_precision_is_gps_error(validated):
    f = validated["TF-AA-2"]
    assert not f.gps_ready
    assert any("precision below EUDR" in e for e in f.errors)


def test_missing_coordinate_is_gps_error(validated):
    f = validated["TF-AA-3"]
    assert not f.gps_ready
    assert any("missing or unparseable" in e for e in f.errors)


def test_over_4ha_flags_polygon_warning_not_gps_error(validated):
    f = validated["TF-AA-4"]
    assert f.gps_ready                      # point itself is fine
    assert any("POLYGON" in w for w in f.warnings)


def test_duplicate_coordinates_warn(validated):
    f = validated["TF-AA-5"]
    assert any("duplicates coordinates" in w for w in f.warnings)


def test_missing_inspection_is_data_error(validated):
    f = validated["TF-AA-6"]
    assert any("inspection record incomplete" in e for e in f.errors)
    assert f.gps_ready                      # GPS itself is clean


# ---------------------------------------------------------------- end-to-end run

@pytest.fixture
def outputs(s13_file, tmp_path):
    out = tmp_path / "reports"
    summary = run(s13_file, out, coop_name="TestCoop", product="Coffee (Arabica)")
    return summary, out


def test_summary_shape_and_score(outputs, s13_file):
    summary, _ = outputs
    c = summary["eudrCompliance"]
    # Compliant farms: AA-1, AA-4, AA-5 (warnings don't fail). AA-2/AA-3/AA-6 error.
    assert c["totalFarms"] == 6
    assert c["farmsWithGps"] == 4           # AA-1, AA-4, AA-5, AA-6
    assert c["scorePercent"] == 50.0
    assert c["oversizedFarmsMissingPolygon"] is True
    assert c["sourceFileName"] == s13_file.name
    assert len(c["sourceFileHash"]) == 64
    assert c["scriptVersion"]
    assert c["computedAt"].endswith("Z")


def test_all_output_files_written(outputs):
    _, out = outputs
    for name in ("eudr_compliance.json", "validation_report.json",
                 "buyer_document.geojson", "buyer_summary.pdf"):
        assert (out / name).exists(), name


def test_buyer_geojson_is_data_minimized(outputs):
    _, out = outputs
    doc = json.loads((out / "buyer_document.geojson").read_text(encoding="utf-8"))
    assert doc["type"] == "FeatureCollection"
    # gps_ready farms only: AA-1, AA-4, AA-5, AA-6 x2 = 5 features
    assert len(doc["features"]) == 5
    banned = {"operator_name", "gender", "birth_year", "name", "village"}
    for feature in doc["features"]:
        props = feature["properties"]
        assert not banned & set(props), f"PII leaked into buyer doc: {props}"
        # Farmer names must never appear even under allowed keys
        assert "Alice" not in json.dumps(props) and "Test" not in props.get("ProducerName", "")
        lon, lat = feature["geometry"]["coordinates"]
        assert -180 <= lon <= 180 and -90 <= lat <= 90


def test_buyer_geojson_excludes_non_gps_ready_farms(outputs):
    # This file feeds a legal filing: plots the validator flagged (AA-2 short
    # precision, AA-3 missing coordinate) must never reach TRACES via us.
    _, out = outputs
    doc = json.loads((out / "buyer_document.geojson").read_text(encoding="utf-8"))
    included = {f["properties"]["ProducerName"] for f in doc["features"]}
    assert included == {"TF-AA-1", "TF-AA-4", "TF-AA-5", "TF-AA-6"}
    assert doc["metadata"]["farmsIncluded"] == 4
    assert doc["metadata"]["farmsExcludedNotGpsReady"] == 2


def test_validation_report_flags_only_problem_farms(outputs):
    _, out = outputs
    report = json.loads((out / "validation_report.json").read_text(encoding="utf-8"))
    flagged = {f["farm_id"] for f in report["farms"]}
    assert "TF-AA-1" not in flagged         # clean farm stays out of the report
    assert {"TF-AA-2", "TF-AA-3", "TF-AA-4", "TF-AA-5", "TF-AA-6"} <= flagged
