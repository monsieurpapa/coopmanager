# Changelog

All notable changes to this project are documented in this file.
Format: [Keep a Changelog](https://keepachangelog.com/) with 4-digit versions (MAJOR.MINOR.PATCH.MICRO).

## [0.1.0.0] - 2026-07-06

### Added
- EUDR geolocation-readiness badge on cooperative profiles (public share page and in-app detail view), with legally scoped wording in English and French: it attests plot geolocation readiness only (EUDR Art. 2(28)), never deforestation-free status. Cooperatives without data show no badge.
- Admin EUDR publish box in the staging area: paste the scorer output, get it validated (shape, hash, score bounds, cooperative-name match) and published live — no deploy needed.
- Offline EUDR scoring tool (`tools/eudr`) that reads a Rainforest Alliance S13 registry, validates plot GPS precision (≥6 decimals on the raw cell text), and emits the badge summary plus data-minimized buyer documents (GeoJSON + PDF) with no farmer PII.
- Buyers can now submit sample requests: the `leads` collection accepts the public request form (previously every submission was silently rejected by security rules).
- Test infrastructure: vitest + Firestore-emulator rules tests (35 tests) and a pytest suite for the scorer (46 tests).

### Changed
- Firestore rules: `eudrCompliance` is admin-only on both create and update; cooperative managers keep full editing of their profiles, and full-form saves that resubmit the unchanged badge data still work.
- Staging approval now passes AI-parsed data through a typed allowlist before publishing, so a poisoned upload can neither inject admin-only fields nor crash public profiles with wrong-typed values.

### Fixed
- Readiness score is floored, not rounded, so the green "Ready" badge can only appear when every farm is compliant (99.96% no longer displays as 100%).
- Badge caption no longer mislabels the overall readiness score as the share of geolocation-ready farms; both figures now carry their own label.
- Registry ingestion survives ragged spreadsheet rows and coordinate formats like `+1.234567` / `.123456`, and releases the workbook file handle on Windows.
