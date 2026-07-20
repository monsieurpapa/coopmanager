# EUDR Geolocation-Readiness Agent

Offline tool that turns a Rainforest Alliance Annex S13 registry (`.xlsx`) into
the CongoFarmers EUDR badge data and a buyer-facing compliance document.
Runs entirely on a laptop — no internet, no cloud services, no API keys.

## Setup (once)

```bash
python -m pip install -r requirements.txt
```

## Run

```bash
python eudr_agent.py --input ../../data/registre_2026-06.xlsx \
    --output ../../reports/ --coop-name "Maendeleo"
```

## Outputs

| File | Audience | Contents |
|---|---|---|
| `eudr_compliance.json` | Admin | Badge summary + provenance (file SHA-256, script version) |
| `validation_report.json` | **Admin only** | Per-farm errors/warnings — the re-collection worklist. Contains farm ids and GPS diagnostics; never send to buyers. |
| `buyer_document.geojson` | Buyer (gated) | Data-minimized plot geolocations (farm id, plot id, area, product — **no farmer names/gender/ages**). **gps_ready farms only** — validator-flagged plots never enter the filing document; excluded-farm counts are in the file's `metadata`. |
| `buyer_summary.pdf` | Buyer (gated) | One-page readiness summary, no PII |

## Publishing the badge (admin procedure)

1. Run the script; **hand-check** the numbers in `eudr_compliance.json` against
   the registry (spot-check a few farms).
2. Open the app as admin → EUDR section → paste the `eudrCompliance` object →
   save. The app validates the shape before writing; Firestore rules reject the
   write from any non-admin account.
3. **Email** `buyer_summary.pdf` + `buyer_document.geojson` directly to the
   buyer. Never upload them anywhere public — the GeoJSON contains every plot's
   coordinates.

## What the badge claims (and doesn't)

- **Claims:** every farm plot has a point geolocation with ≥6 decimal
  precision (EUDR Art. 2(28)) and complete registry fields.
- **Does NOT claim:** deforestation-free status. The S13 carries no
  forest-cover data; due diligence stays the operator's obligation.
- Farms over 4 ha require polygon boundaries the S13 cannot hold — they set
  `oversizedFarmsMissingPolygon: true` and appear in the validation report.

## Tests

```bash
python -m pytest tests/ -q
```

Tests run against a synthetic fixture built in `tests/conftest.py`.
**Never** use the real registry (farmer PII) as test data; `data/` and
`reports/` are gitignored for the same reason.
