<div align="center">
  <img width="1200" height="475" alt="CoopManager Banner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
  <h1>CoopManager</h1>
  <p>A bilingual (EN/FR) coffee cooperative directory and analytics platform for Central African supply chains.</p>

  ![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue?logo=typescript)
  ![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)
  ![Firebase](https://img.shields.io/badge/Firebase-12-FFCA28?logo=firebase)
  ![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite)
  ![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-38BDF8?logo=tailwindcss)
  ![License](https://img.shields.io/badge/license-MIT-green)
</div>

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Architecture](#architecture)
- [Data Model](#data-model)
- [Auth & Roles](#auth--roles)
- [AI Document Ingestion](#ai-document-ingestion)
- [Environment Variables](#environment-variables)
- [Available Scripts](#available-scripts)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

CoopManager is a full-stack web application for discovering, comparing, and managing coffee cooperatives across DR Congo and East Africa. It combines a public-facing directory with a secure admin panel for data management, AI-powered document ingestion, and competition tracking for the Best of Congo cupping program.

Built for buyers, agronomists, and cooperative managers who need authoritative data without the spreadsheet chaos.

---

## Features

| Feature | Description |
|---|---|
| **Cooperative Directory** | Searchable, filterable card grid with real-time Firestore sync |
| **Detail View** | Sensory radar chart, production history, member demographics, certifications |
| **Comparison Engine** | Side-by-side matrix of up to 4 cooperatives across any metric |
| **Analytics Dashboard** | Aggregate charts: production by region, cupping score distributions |
| **Best of Congo Leaderboard** | Per-edition competition results with buyer info and CSV export |
| **Coop Portal** | Self-service profile editor for cooperative managers (react-hook-form + Zod) |
| **AI Staging Area** | Admin review queue for Gemini-parsed cooperative profiles from PDF/image uploads |
| **Bulk CSV Import** | Admin can import Best of Congo participant data from a spreadsheet |
| **Bilingual UI** | Full EN/FR localization via context-driven translation system |
| **Role-based Access** | Three-tier RBAC enforced in both React and Firestore Security Rules |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 19 + Vite 6 |
| Language | TypeScript 5.8 |
| Styling | Tailwind CSS v4 (`@tailwindcss/vite` — no config file) |
| Database | Firebase Firestore (real-time listener) |
| Auth | Firebase Auth (Google Sign-In) |
| AI | Google Gemini (`gemini-2.5-flash-preview`) via `@google/genai` |
| Forms | react-hook-form + Zod |
| Charts | Recharts |
| File Upload | react-dropzone |
| Notifications | react-hot-toast |
| Utilities | clsx + tailwind-merge via `cn()` |

---

## Getting Started

### Prerequisites

- **Node.js** >= 18
- A **Firebase project** with Firestore and Google Auth enabled
- A **Gemini API key** from [Google AI Studio](https://aistudio.google.com/)

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/your-org/coopmanager.git
cd coopmanager

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env.local
# Edit .env.local — see Environment Variables section below
```

### Running Locally

```bash
npm run dev
```

App runs on `http://localhost:3000`. Firestore reads fall back to `MOCK_COOPERATIVES` in `src/types.ts` if the database is empty.

### Deploy to Firebase Hosting

```bash
npm run build
firebase deploy
```

---

## Project Structure

```
coopmanager/
├── public/                    # Static assets
├── src/
│   ├── App.tsx                # Monolithic app — all components, contexts, Firestore logic
│   ├── types.ts               # CoffeeCooperative interface + MOCK_COOPERATIVES seed data
│   ├── firebase.ts            # Firebase app init; exports db and auth
│   ├── schemas.ts             # Zod CooperativeSchema for portal validation
│   ├── contexts/
│   │   └── language.tsx       # LanguageContext, useTranslation, LanguageSwitcher, translations
│   ├── lib/
│   │   ├── utils.ts           # cn() utility (clsx + tailwind-merge)
│   │   ├── firestore-utils.ts # Firestore read/write helpers
│   │   └── image-utils.ts     # Logo fallback helpers
│   └── services/
│       └── geminiService.ts   # Gemini PDF/image → structured JSON parser
├── firebase-blueprint.json    # Firestore schema reference
├── firestore.rules            # Security rules
├── .env.example               # Environment variable template
└── CLAUDE.md                  # AI coding assistant guidance
```

> **Note:** `App.tsx` is intentionally monolithic. All UI components live there — no separate component files. This is a deliberate architectural choice for this stage of the project.

---

## Architecture

### Component Map

```
App
├── LanguageContext (EN/FR)
├── AuthContext (Firebase user + role)
├── Navbar
│   ├── LanguageSwitcher
│   └── AuthButton
├── DirectoryView
│   ├── SearchBar + FacetedSidebar
│   └── CooperativeCard[]
│       └── → CooperativeDetailView (modal)
│           ├── SensoryRadarChart
│           ├── ProductionHistoryChart
│           └── MemberDemographicsChart
├── ComparisonEngine
├── AnalyticsView
├── BestOfCongoLeaderboard
│   └── BocEditionAdmin (admin only)
│       └── BocCsvImportModal
├── CoopPortal (coop_manager + admin)
└── AiStagingArea (admin only)
```

### AI Document Ingestion Flow

```
User uploads PDF/image
       │
       ▼
react-dropzone captures file
       │
       ▼
FileReader → base64 encode
       │
       ▼
geminiService.parseCooperativeProfile()
  └── Gemini API (gemini-2.5-flash-preview)
  └── Prompt: extract cooperative data → JSON
       │
       ▼
Parsed JSON → /staging_cooperatives/{id}
  status: "pending"
       │
       ▼
Admin reviews in AI Staging Area
  [Approve] ──→ write to /cooperatives/{id}
  [Reject]  ──→ update status: "rejected"
```

---

## Data Model

Firestore collections (full schema in `firebase-blueprint.json`):

| Collection | Description | Access |
|---|---|---|
| `/users/{userId}` | User profiles with `role` and optional `cooperativeId` | Owner + admin |
| `/cooperatives/{coopId}` | Live cooperative profiles | Public read; admin/manager write |
| `/staging_cooperatives/{stagingId}` | AI-parsed cooperatives pending review | Admin only |
| `/bestofcongo_editions/{year}` | Annual competition metadata | Public read; admin write |
| `/bestofcongo_editions/{year}/participants/{coopId}` | Per-cooperative results | Public read; admin write |

### Cooperative Fields

| Field | Type | Notes |
|---|---|---|
| `name` | string | Required |
| `country` | string | Required |
| `region` | string | Required |
| `members` | integer | Required |
| `menMembers` / `womenMembers` / `youthMembers` | integer | Optional breakdown |
| `established` | integer | Year founded |
| `altitudeRange` | `[number, number]` | Min/max masl |
| `varieties` | string[] | e.g. `["Bourbon", "Heirloom"]` |
| `processingMethods` | string[] | e.g. `["Fully Washed"]` |
| `certifications` | string[] | e.g. `["Fairtrade", "Organic"]` |
| `annualProduction` | number | Tonnes |
| `selfReportedCuppingScore` | number | 0–100 |
| `commodity` | `"coffee" \| "cocoa"` | Defaults to `"coffee"` |
| `isBocParticipant` | boolean | Best of Congo flag |
| `sustainabilityFocus` | string[] | Focus areas |
| `areaHa` / `treeCount` / `households` | number | Farm metrics |
| `imageUrl` / `logoUrl` | string | Media URLs |
| `lastUpdated` | datetime | ISO 8601 |

### EditionParticipant Fields

| Field | Type | Notes |
|---|---|---|
| `coopId` | string | Matches `/cooperatives` doc ID |
| `qtySubmitted` | number | Kg submitted |
| `scores.average` | number | Admin-entered cupping score |
| `qtySold` | number | Kg sold at auction |
| `buyers` | `{ name: string; logoUrl?: string }[]` | Buyer list |

---

## Auth & Roles

| Role | How Assigned | Permissions |
|---|---|---|
| `admin` | Hardcoded email in `firestore.rules` OR `role == 'admin'` in `/users` doc | Full read/write on all collections |
| `coop_manager` | `role` field in `/users` doc + `cooperativeId` link | Create/update/delete their own cooperative; upload to staging |
| `user` | Default for any authenticated user | Read-only |

Sign-in is via Google (`signInWithPopup`). On first login a `/users/{uid}` document is created with `role: "user"`.

To promote a user to `admin` or `coop_manager`, update their `/users/{uid}` document in the Firebase console.

---

## AI Document Ingestion

`src/services/geminiService.ts` sends a base64-encoded PDF or image to Gemini with a structured prompt asking it to extract cooperative data as JSON matching `CoffeeCooperative`.

The returned JSON is validated client-side and written to `/staging_cooperatives` with `status: "pending"`. Admins review in the AI Staging Area and either publish to `/cooperatives` or reject.

Supported upload formats: PDF, PNG, JPG, WEBP. Max file size: 10MB.

---

## Environment Variables

Copy `.env.example` to `.env.local` and fill in:

| Variable | Description |
|---|---|
| `VITE_FIREBASE_API_KEY` | Firebase project API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase auth domain |
| `VITE_FIREBASE_PROJECT_ID` | Firestore project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase storage bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase messaging sender ID |
| `VITE_FIREBASE_APP_ID` | Firebase app ID |
| `GEMINI_API_KEY` | Google Gemini API key (server-side only) |

> **Security:** Never commit `.env.local`. Firebase API keys are safe to expose client-side (they're scoped by Security Rules), but the Gemini key should stay server-side.

---

## Available Scripts

```bash
npm run dev        # Start Vite dev server on port 3000 (hot reload)
npm run build      # Production build → dist/
npm run lint       # TypeScript type-check (tsc --noEmit)
npm run clean      # Remove dist/
```

---

## Roadmap

| Priority | Feature | Status |
|---|---|---|
| P0 | Directory, detail view, comparison engine | Done |
| P0 | Firebase auth + Firestore sync | Done |
| P0 | Bilingual EN/FR UI | Done |
| P1 | AI document ingestion + staging area | Done |
| P1 | Coop Portal (manager self-service) | Done |
| P1 | Best of Congo leaderboard + CSV export | Done |
| P2 | Bulk CSV import for BoC edition data | Done |
| P2 | How It Works modal | Done |
| P3 | Manager dashboard with production history editor | Planned |
| P3 | Buyer-facing discovery features | Planned |
| P3 | Mobile-responsive layout audit | Planned |

---

## Contributing

1. Fork the repository and create a feature branch: `git checkout -b feat/your-feature`
2. Make your changes. Run `npm run lint` to check for type errors.
3. Test locally with `npm run dev`.
4. Open a pull request against `main` with a clear description of what changed and why.

Please keep commits scoped and descriptive. Follow the existing commit convention: `feat(scope): description`.

---

## License

MIT License. See [LICENSE](LICENSE) for details.
