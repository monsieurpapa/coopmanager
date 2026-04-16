<div align="center">
  <img width="1200" height="475" alt="Cooppro Banner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
  <h1>Cooppro</h1>
  <p><strong>Coffee Cooperative Directory & Analytics Platform</strong></p>
  <p>
    A data-rich web platform for discovering, comparing, and managing African coffee cooperative profiles — with AI-assisted document ingestion and a Best of Congo competition leaderboard.
  </p>
  <p>
    <img src="https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=white" alt="React 19" />
    <img src="https://img.shields.io/badge/TypeScript-5.8-3178c6?logo=typescript&logoColor=white" alt="TypeScript" />
    <img src="https://img.shields.io/badge/Firebase-12-ffca28?logo=firebase&logoColor=black" alt="Firebase" />
    <img src="https://img.shields.io/badge/Vite-6-646cff?logo=vite&logoColor=white" alt="Vite" />
    <img src="https://img.shields.io/badge/Tailwind_CSS-4-06b6d4?logo=tailwindcss&logoColor=white" alt="Tailwind CSS" />
  </p>
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
- [Authentication & Roles](#authentication--roles)
- [AI Document Ingestion](#ai-document-ingestion)
- [Environment Variables](#environment-variables)
- [Roadmap](#roadmap)

---

## Overview

Cooppro is a single-page application built for the coffee sourcing community in Central Africa. It gives buyers, traders, and cooperative managers a single place to:

- **Browse** a searchable, filterable directory of coffee cooperatives
- **Compare** up to four cooperatives side-by-side across quality, production, and social metrics
- **Explore** the Best of Congo competition leaderboard with per-edition scores and buyer results
- **Manage** a cooperative profile via a self-service portal, including AI-assisted PDF upload
- **Analyse** aggregate sector trends through interactive charts

The platform is bilingual (English / French) and is backed by Firebase for real-time data and Google Sign-In for authentication.

---

## Features

| Area | Capability |
|---|---|
| **Directory** | Full-text search, faceted filters (country, certification, commodity, BoC participation) |
| **Detail View** | Radar chart (sensory profile), production history bar/line charts, member demographics |
| **Comparison Engine** | Side-by-side matrix of up to 4 cooperatives across selectable metrics |
| **Best of Congo** | Per-edition leaderboard ranked by cupping score; buyer logos; CSV export |
| **Analytics** | Aggregate sector charts — production trends, certification distribution, gender ratio |
| **Coop Portal** | `coop_manager` self-service profile editor with form validation (react-hook-form + Zod) |
| **AI Ingestion** | Upload a PDF or image; Gemini AI parses it into structured cooperative data for admin review |
| **Admin Panel** | Review and publish AI-staged cooperatives; manage edition results |
| **Localisation** | Full EN/FR toggle via React context; all UI strings translated |
| **CSV Export** | Export directory, analytics, and leaderboard data to CSV |

---

## Tech Stack

| Layer | Technology |
|---|---|
| UI framework | React 19 |
| Language | TypeScript 5.8 |
| Build tool | Vite 6 |
| Styling | Tailwind CSS v4 (via `@tailwindcss/vite` — no config file needed) |
| Animation | Motion (Framer Motion v12) |
| Charts | Recharts 3 |
| Forms | react-hook-form + Zod 4 |
| Icons | Lucide React |
| Notifications | react-hot-toast |
| Auth & Database | Firebase 12 (Firestore + Google Sign-In) |
| AI | Google Gemini (`gemini-2.5-flash-preview`) via `@google/genai` |
| File upload | react-dropzone |

---

## Getting Started

### Prerequisites

- **Node.js** ≥ 18
- A **Firebase project** with Firestore and Google Sign-In enabled
- A **Gemini API key** (Google AI Studio)

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/your-org/cooppro.git
cd cooppro

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env.local
# Edit .env.local — see Environment Variables section below
```

### Running locally

```bash
npm run dev        # Dev server on http://localhost:3000
```

### Other commands

```bash
npm run build      # Production build → dist/
npm run preview    # Preview the production build
npm run lint       # TypeScript type-check (tsc --noEmit)
npm run clean      # Remove dist/
```

---

## Project Structure

```
cooppro/
├── src/
│   ├── App.tsx                  # Main application — all views, contexts, Firestore logic
│   ├── main.tsx                 # React entry point
│   ├── index.css                # Global styles + Tailwind imports
│   ├── types.ts                 # CoffeeCooperative interface + MOCK_COOPERATIVES seed data
│   ├── schemas.ts               # Zod schemas for form validation (CooperativeSchema)
│   ├── firebase.ts              # Firebase app init; exports db and auth
│   ├── ErrorBoundary.tsx        # Top-level React error boundary
│   ├── contexts/
│   │   └── language.tsx         # LanguageContext, useTranslation hook, LanguageSwitcher, translations
│   ├── lib/
│   │   ├── utils.ts             # cn() — clsx + tailwind-merge helper
│   │   ├── firestore-utils.ts   # handleFirestoreError, OperationType helpers
│   │   └── image-utils.ts       # Logo/image fallback constants and onError handlers
│   └── services/
│       └── geminiService.ts     # parseCooperativeProfile() — Gemini PDF/image → structured JSON
├── firestore.rules              # Firestore security rules
├── firebase-blueprint.json      # Firestore schema reference (entities + collection paths)
├── firebase-applet-config.json  # Firebase project config (non-secret)
├── metadata.json                # App display name and permissions metadata
├── vite.config.ts               # Vite config with React and Tailwind plugins
├── tsconfig.json                # TypeScript config
└── .env.local                   # Runtime secrets (gitignored)
```

> **Note:** The application is intentionally structured as a single large `App.tsx` file containing all views, contexts, and Firestore logic. This is a deliberate architectural choice for this project stage — there are no separate component files.

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│                   Browser (SPA)                  │
│                                                  │
│  LanguageContext (EN/FR)                         │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │Directory │  │Analytics │  │Coop Portal    │  │
│  │+ Filters │  │+ Charts  │  │+ AI Upload    │  │
│  └──────────┘  └──────────┘  └───────────────┘  │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │Detail    │  │Compare   │  │Admin Panel    │  │
│  │+ Radar   │  │Engine    │  │+ Staging Area │  │
│  └──────────┘  └──────────┘  └───────────────┘  │
└──────────────────────┬──────────────────────────┘
                       │
          ┌────────────┴────────────┐
          │                         │
   Firebase Auth              Cloud Firestore
   (Google Sign-In)           (real-time sync)
                                    │
                          ┌─────────┴─────────┐
                     /cooperatives    /staging_cooperatives
                     /users           /bestofcongo_editions
                                           └── /participants
```

### Data flow — AI ingestion

```
User uploads PDF/image
        │
        ▼
react-dropzone → base64 encode
        │
        ▼
geminiService.parseCooperativeProfile()
  └── Gemini API (gemini-2.5-flash-preview)
        │
        ▼
Structured JSON (CoffeeCooperative shape)
        │
        ▼
Write to /staging_cooperatives/{id}  (status: "pending")
        │
        ▼
Admin reviews in "AI Staging Area"
        │
   approve / reject
        │
        ▼
Publish to /cooperatives/{id}   (live directory)
```

---

## Data Model

Defined in [`firebase-blueprint.json`](./firebase-blueprint.json) and enforced by [`firestore.rules`](./firestore.rules).

### Collections

| Collection path | Description |
|---|---|
| `/users/{userId}` | User profiles with role and optional `cooperativeId` |
| `/cooperatives/{coopId}` | Live cooperative profiles (publicly readable) |
| `/staging_cooperatives/{stagingId}` | AI-parsed cooperatives awaiting admin approval |
| `/bestofcongo_editions/{year}` | Best of Congo competition editions |
| `/bestofcongo_editions/{year}/participants/{coopId}` | Per-cooperative results for one edition |

### Cooperative document (key fields)

| Field | Type | Description |
|---|---|---|
| `name` | string | Cooperative name |
| `country` | string | Country of operation |
| `region` | string | Sub-national region |
| `established` | integer | Year founded |
| `members` | integer | Total member count |
| `menMembers` / `womenMembers` / `youthMembers` | integer | Demographic breakdown |
| `altitudeRange` | integer[] | `[min, max]` metres above sea level |
| `varieties` | string[] | Coffee varieties grown |
| `processingMethods` | string[] | e.g. `["Washed", "Natural"]` |
| `certifications` | string[] | Fairtrade, Bio-NOP, RainForest Alliance, etc. |
| `annualProduction` | number | Metric tonnes per year |
| `selfReportedCuppingScore` | number | SCA cupping score (0–100) |
| `commodity` | `"coffee"` \| `"cocoa"` | Primary commodity |
| `isBocParticipant` | boolean | Best of Congo participant flag |
| `sustainabilityFocus` | string[] | Sustainability initiatives |
| `areaHa` | number | Farm area in hectares |
| `households` | integer | Number of farming households |

---

## Authentication & Roles

Authentication uses **Google Sign-In** via Firebase `signInWithPopup`.

| Role | How assigned | Permissions |
|---|---|---|
| **admin** | Hardcoded email `dieudonneishara@gmail.com` **or** `role == 'admin'` in `/users` doc | Full read/write across all collections; approve/reject staged cooperatives; manage BoC editions |
| **coop_manager** | `role == 'coop_manager'` + `cooperativeId` set in `/users` doc | Create and update their own cooperative; submit documents to staging |
| **user** | Any authenticated Google account | Read cooperatives and BoC data; read their own user profile |
| *(unauthenticated)* | — | Read `/cooperatives` and `/bestofcongo_editions` (public) |

Role escalation (e.g. setting `role: 'admin'`) is blocked by Firestore rules — users cannot modify their own `role` or `email` fields.

---

## AI Document Ingestion

`src/services/geminiService.ts` exports `parseCooperativeProfile(file: File): Promise<Partial<CoffeeCooperative>>`.

- Accepts **PDF** or **image** files (PNG, JPEG, WebP).
- Encodes the file as base64 and sends it to Gemini with a structured prompt describing the target JSON schema.
- Returns a partial `CoffeeCooperative` object — fields Gemini cannot confidently extract are omitted.
- The result is written to `/staging_cooperatives` with `status: "pending"` for admin review before it becomes visible in the live directory.

---

## Environment Variables

Copy `.env.example` to `.env.local` and fill in the values below. None of these values are committed to source control.

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | Yes | Google AI Studio API key for document parsing |
| `VITE_FIREBASE_API_KEY` | Yes | Firebase project API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Yes | Firebase auth domain |
| `VITE_FIREBASE_PROJECT_ID` | Yes | Firestore project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | Yes | Firebase storage bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Yes | Firebase messaging sender ID |
| `VITE_FIREBASE_APP_ID` | Yes | Firebase app ID |

> All `VITE_` prefixed variables are inlined by Vite at build time and will be visible in the client bundle. Do not store server-side secrets with the `VITE_` prefix.

---

## Roadmap

Tracked in [`TODOS.md`](./TODOS.md).

| Priority | Item |
|---|---|
| P1 | **Test suite** — vitest + @testing-library/react covering leaderboard ranking, CSV export, faceted filters, and score history |
| P2 | **Bulk CSV import** for Best of Congo edition data (admin panel) |
| P2 | **Mobile leaderboard layout** — sticky rank/name columns or collapsed card view at 375 px |
| P3 | **Auction integration** — `auctionStatus` + `auctionUrl` on edition participants; "Lot available" badge during auction season |
| P3 | **`bocScore` derived field** — propagate latest BoC average to cooperative doc for directory sorting |

---

<div align="center">
  <sub>Built with React, Firebase, and Gemini AI &mdash; for the coffee communities of Central Africa.</sub>
</div>
