# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # Install dependencies
npm run dev          # Start dev server on port 3000
npm run build        # Production build
npm run lint         # Type-check (tsc --noEmit)
npm run clean        # Remove dist/
npm run test:rules   # Full vitest suite inside the Firestore emulator (needs Java 21+)
```

**Python tool tests:** `cd tools/eudr && python -m pytest tests/ -q`

**Environment setup:** Copy `.env.example` to `.env.local` and set `GEMINI_API_KEY`.

## Architecture

This is a single-page React + Vite + TypeScript app — a Coffee Cooperative directory and analytics platform called "Cooppro."

### Key files

- **`src/App.tsx`** — Monolithic file containing all UI components, React contexts, Zod schemas, Firestore logic, and application state. There are no separate component files.
- **`src/types.ts`** — `CoffeeCooperative` interface + `MOCK_COOPERATIVES` array (seed/fallback data for local development).
- **`src/firebase.ts`** — Firebase app init; exports `db` (Firestore) and `auth`.
- **`src/services/geminiService.ts`** — Calls Gemini AI (`gemini-3-flash-preview`) to parse uploaded PDF/image documents into structured cooperative data.
- **`firestore.rules`** — Security rules with three roles: `admin`, `coop_manager`, `user`. The `eudrCompliance` map on cooperatives is admin-only on both create and update; the client-side mirror is `EudrComplianceSchema` in `src/schemas.ts` — keep both in sync.
- **`src/lib/staging.ts`** — Typed field allowlist applied when an admin approves a staged cooperative (approval writes run as admin, so this is the trust boundary for AI-parsed data).
- **`tools/eudr/`** — Offline Python scorer: RA S13 registry (.xlsx) → EUDR geolocation-readiness badge JSON + data-minimized buyer documents. Real registries (farmer PII) live in gitignored `data/`; tests use a synthetic fixture only.
- **`tests/`** — Vitest suites; `firestore-rules.test.ts` runs against the Firestore emulator via `npm run test:rules`.

### Firestore data model

Three collections (schema defined in `firebase-blueprint.json`):

| Collection | Description |
|---|---|
| `/users/{userId}` | User profiles with `role` and optional `cooperativeId` |
| `/cooperatives/{coopId}` | Live cooperative profiles (publicly readable) |
| `/staging_cooperatives/{stagingId}` | AI-parsed cooperatives awaiting admin approval |

### Auth & roles

- Google Sign-In via `signInWithPopup`.
- **Admin**: hardcoded email `dieudonneishara@gmail.com` in `firestore.rules`, OR any user with `role == 'admin'` in their `/users` doc.
- **coop_manager**: can create/update/delete their own cooperative; uploads go to `staging_cooperatives` for admin review.
- **user**: read-only.

### AI document ingestion flow

1. User uploads a PDF or image via `react-dropzone`.
2. File is base64-encoded and sent to `geminiService.parseCooperativeProfile()`.
3. Gemini returns structured JSON matching `CoffeeCooperative` schema.
4. Admin reviews the parsed data in the "AI Staging Area" view and publishes to `/cooperatives`.

### UI structure (all in App.tsx)

- **Directory view** — searchable/filterable cooperative cards.
- **Detail view** — radar chart (sensory profile), bar/line charts (production history), member demographics.
- **Comparison Engine** — side-by-side matrix of up to 4 cooperatives across selectable metrics.
- **Analytics view** — aggregate charts via Recharts.
- **Coop Portal** — `coop_manager` self-service profile editor with `react-hook-form` + Zod validation.
- **AI Staging Area** — admin-only review queue for AI-parsed cooperatives.
- **Localization** — bilingual EN/FR via a `translations` object and `LanguageContext`; toggle in the navbar.

### Styling

Tailwind CSS v4 via `@tailwindcss/vite` plugin (no `tailwind.config` file needed). The `cn()` utility in `src/lib/utils.ts` combines `clsx` and `tailwind-merge`.

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Growth/customer acquisition, GTM, launch strategy, marketing → invoke growth-playbook
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
- Save progress, checkpoint, resume → invoke checkpoint
- Code quality, health check → invoke health
