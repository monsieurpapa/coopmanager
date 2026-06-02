# TODOS

## Lead Management Admin View (P2)

**What:** A "Leads" tab in the admin area showing all sample requests submitted via the
public profile's "Request Sample" form.

**Why:** Leads are currently written to `/leads` in Firestore but there's no UI to see
them. Congo Agri Platform staff need to triage inbound buyer interest without opening
the Firestore console.

**Pros:** Closes the loop on the Request Sample feature — it's not fully useful until
staff can see who submitted what. Also enables basic lead tracking (new / contacted /
converted).

**Cons:** Another admin-only screen; adds complexity to an already-large App.tsx.

**Context:** `/leads` collection was added in the Origin Profile PR. Firestore rule
allows admin read. The lead document shape is: `coopId`, `coopName`, `buyerName`,
`company`, `country`, `interest` (sample/contract/info), `quantityKg`, `message`,
`createdAt`, `status` (default: 'new').

**Effort:** S (human: ~2h / CC: ~15min)

**Depends on:** Origin Profile PR shipped (done).

---

## Social Meta Tags for Profile Pages (P2)

**What:** `og:title`, `og:description`, `og:image` meta tags so that when a profile
URL is shared on WhatsApp, LinkedIn, or email, it renders a rich preview with the
cooperative's name, region, and hero image.

**Why:** Right now the share link shows a plain URL. A rich preview with an image and
the coop's name makes the link feel trustworthy and professional — critical for a
first-impression touchpoint with buyers.

**Pros:** Zero friction for the sharer; high-trust signal for the receiver.

**Cons:** Firebase Hosting serves a static SPA — meta tags need to be injected
dynamically per coop. This requires either: (a) server-side rendering, (b) a
Firebase Hosting rewrite to a Cloud Function that injects the tags, or (c)
pre-rendering at build time (impractical for a dynamic dataset). Option (b) is the
right path: a minimal Cloud Function that fetches the cooperative from Firestore and
returns HTML with the correct og: tags before redirecting to the SPA.

**Context:** The profile URL pattern is `/#/coop/[id]`. The Cloud Function would
intercept requests matching `/#/coop/*`, look up the coop, inject og: tags, then
redirect to the SPA.

**Effort:** M (human: ~3h / CC: ~20min)

**Depends on:** Firebase Functions setup (not currently in the project).
