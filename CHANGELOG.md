# Changelog

All notable changes to Cooppro are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [0.1.1.0] - 2026-04-17

### Added
- **Bulk CSV import for Best of Congo edition data** — admins can now drop a CSV file into the BoC Edition admin panel to populate all participant rows at once instead of entering them one by one. Pipe-separated buyer names (`Buyer A|Buyer B`), coopId-or-name resolution, per-row validation with error highlighting, and a downloadable template are included.
- **Industry-grade README** — full documentation covering architecture, data model, auth roles, AI ingestion flow, environment variables, and roadmap.
- **TODOS.md** — structured backlog with P1–P3 items (test suite, mobile leaderboard, auction integration, bocScore derived field).

### Changed
- BoC Edition admin participants panel now shows "Import CSV" alongside "Add participant" for faster bulk data entry.
- CSV drop zone capped at 5 MB and annotated for multi-line cell limitation.
