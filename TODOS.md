# TODOS

Deferred work tracked from plan and code reviews. One item per section.

---

## P1 — Test Suite Setup

**What:** Add a test suite covering the critical new codepaths introduced by the CongoFarmers Edition-first plan.

**Why:** The app has zero tests. The leaderboard ranking, CSV export, and faceted filter logic are pure functions that are trivial to test but determine whether a buyer trusts the platform. A wrong ranking could influence a $50K sourcing decision.

**Key tests to write first:**
- Leaderboard sort: participants ranked by `scores.average` desc, name tiebreak
- CSV export: values with commas correctly double-quoted
- Faceted filter: `isBocParticipant` toggle correctly filters
- mailto URL: `encodeURIComponent` prevents URL corruption on special chars in coop name
- Score history tab: empty state when no edition participations exist

**Pros:** Confidence to ship leaderboard. Catches regressions in filter logic. Makes future contributors safer.
**Cons:** None — this is pure value.

**Effort:** Human ~1 day. CC+gstack ~15 min.
**Priority:** P1
**Depends on:** Steps 4-6 must be implemented first (test the real code paths)
**Suggested stack:** vitest + @testing-library/react (already in ecosystem, no new deps needed)

---

## P2 — Bulk Import for BoC Edition Data

**What:** A CSV upload tool in the admin panel that lets Congo Agri Platform staff import an entire Best of Congo edition's results from a spreadsheet.

**Why:** With 20+ cooperatives per edition, manual form entry is 40+ records over 2 editions for historical backfill. Manual entry increases error risk (wrong average, transposed names) and is time-consuming for staff who are not technical.

**How:** Admin uploads a CSV (columns: coopId or coop name, average, qtySubmitted, qtySold, buyers). App shows a preview table. Admin confirms. App writes all participant docs in a single WriteBatch.

**Pros:** Faster backfill. Lower data entry error rate. Scales to future editions.
**Cons:** Requires unambiguous coop identifier in the CSV (coopId preferred, name is ambiguous).

**Effort:** Human ~1 week. CC+gstack ~2 hours.
**Priority:** P2
**Depends on:** Step 4 (admin edition form) must ship first so we understand the data shape

---

## P2 — Mobile Leaderboard Layout

**What:** Make the Best of Congo leaderboard readable on mobile (375px viewport).

**Why:** The design doc's success criteria explicitly include "The Best of Congo leaderboard for any edition loads and is readable on mobile." With 6 columns at 375px, the table overflows.

**Options:**
- Horizontal scroll with sticky rank + coop name columns (simplest)
- Collapsed card view for mobile: one card per coop showing rank, name, score, qty

**Pros:** Meets stated success criterion. Buyers frequently check platforms on mobile.
**Cons:** Extra CSS/layout work, card view requires separate component.

**Effort:** Human ~4 hours. CC+gstack ~30 min.
**Priority:** P2
**Depends on:** Step 6 (leaderboard) must ship first

---

## P3 — Auction Integration for BoC Edition Participants

**What:** Add `auctionStatus: 'pending' | 'active' | 'closed' | null` and `auctionUrl: string` to the EditionParticipant type. Surface as a "Lot available" badge on the leaderboard during active auction periods.

**Why:** The Best of Congo competition includes an auction phase. In 2025, bids reached $8/lb. Making this visible on the platform during auction season turns it into a live sourcing tool, not just a historical reference.

**Pros:** Platform is useful during competition season. Connects buyers to active purchasing opportunity.
**Cons:** Out of v1 scope. Requires coordination with auction platform (external URL).

**Effort:** Human ~4 hours. CC+gstack ~20 min.
**Priority:** P3
**Depends on:** Step 6 (leaderboard) must ship first. Auction integration spec needed.

---

## P3 — `bocScore` Derived Field on Cooperative Doc

**What:** Add a `bocScore?: number` field to the CoffeeCooperative type that is set to the most recent Best of Congo average score when an admin saves an edition result.

**Why:** Currently, `selfReportedCuppingScore` and BoC scores are separate data points. Buyers scanning the directory want to see the competition-verified score at a glance without clicking into the profile.

**How:** When admin saves an edition participant record, update the cooperative doc with `bocScore: scores.average` and `bocEditionYear: year`.

**Pros:** Enables sorting/filtering directory by verified BoC score. Faster buyer scanning.
**Cons:** Dual write (edition participant + cooperative doc). Out-of-sync if admin deletes a participant record.

**Effort:** Human ~3 hours. CC+gstack ~20 min.
**Priority:** P3
**Depends on:** Steps 3-5 must ship first.
