# Revil | Main Profile
![Next.js](https://img.shields.io/badge/Next.js%2016-black?style=flat-square&logo=next.js)
![React](https://img.shields.io/badge/React%2019-%2320232a.svg?style=flat-square&logo=react&logoColor=%2361DAFB)
![Tailwind CSS](https://img.shields.io/badge/Tailwind%204-%2338B2AC.svg?style=flat-square&logo=tailwind-css&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat-square&logo=typescript&logoColor=white)
![Motion](https://img.shields.io/badge/Motion-000000?style=flat-square&logo=framer&logoColor=white)
![Firebase](https://img.shields.io/badge/Firebase-%23039BE5.svg?style=flat-square&logo=firebase)

**Revil** is my **Main Professional Profile** and a premium, ultra-responsive developer portfolio ecosystem. Designed for high-end digital presence, it consists of a stunning user-facing showcase and a powerful, real-time Administrative Dashboard to manage every facet of my professional career as a **Frontend & AI Expert**.

---

##  Core Pillars

###  High-Fidelity UI/UX
Designed with a "Ceramic-Glass" aesthetic, Revil features:
- **Liquid Navigation**: Ultra-smooth page transitions and scroll-aware animations powered by **Anime.js** and **Framer Motion**.
- **Adaptive Precision**: A hand-crafted CSS design system providing a seamless experience from 320px mobile devices to 4K displays.
- **Atmospheric Themes**: Intelligent Dark/Light mode system with deep glassmorphism and animated background blobs.

### ️ The Admin Dashboard (Canary)
A private, real-time command center built for elite project management:
- **Project Orchestrator**: Add, edit, and organize projects with dynamic image cropping and multi-tag filtering.
- **Canary Engine**: A built-in mail inbox for direct client communication and a meeting calendar with **Google Calendar API** synchronization.
- **The "Algorithm"**: Proprietary session tracking that monitors project engagement, stack time, and visitor intent.
- **Link Architect**: Generate trackable custom URLs for specific clients to monitor when they view your portfolio.

###  Technical Excellence
- **React 19 & Next.js 16**: Leveraging the latest in front-end performance, App Router, and server-side capabilities.
- **Robust Security**: Hardened Firestore rules, environment variable isolation, CSP compliance, and secure sanitized SVG rendering.
- **Cloud Infrastructure**: Scalable backend logic using Firebase Cloud Functions, Realtime live data synchronization, and secure file handling via Firebase Storage.

---

##  Experience it Locally

### Prerequisites
- Node.js (v20+)
- Firebase CLI (`npm install -g firebase-tools`)

### Installation
```bash
# Clone the repository
git clone https://github.com/temrevil/red.git

# Install dependencies
npm install

# Configure Firebase - copy the example and fill in your own project's values
cp .env.example .env.local

# Start development server
npm run dev
```

> **Note:** App Check is enforced, so a fresh local run is blocked from reading
> Firestore until you register a debug token. Start the app, copy the token
> printed in the browser console, and add it under
> **Firebase Console → App Check → Apps → Manage debug tokens**.
> See [`.env.example`](.env.example) for every variable and what it does.

###  Run with Docker
You can directly run the application inside an isolated Docker container without needing Node installed locally:
```bash
# Build the Docker image
docker build -t revil-portfolio .

# Run the container on port 3000
docker run -p 3000:3000 revil-portfolio
```

##  Continuous Integration & Security

We maintain high-end reliability and stability across the entire project through automated defenses and strict security policies:
- **Zero-Error Automation**: Every push to the protected `main` branch runs through aggressive GitHub Action workflows. It rigidly tests against `npm run lint`, `npm run build`, and enforces strict TypeScript standards.
- **Data & Configuration Security**: The project utilizes hardened, defense-in-depth Firestore and Storage rules, consolidated real-time listeners, and strict CSP headers. Environment variables are managed securely using `NEXT_PUBLIC_*` prefixes.
- **DOM tamper deterrence**: `ClientProtection` runs a `MutationObserver` on the root nodes that strips injected `<script>`/`<style>` tags and hostile inline styles. It's a best-effort deterrent against console/extension tampering — **not** a security boundary (a hostile extension has full page access regardless). The actual XSS defenses are the strict CSP, `sanitizeSvg()` on any `dangerouslySetInnerHTML`, and the hardened Firestore/Storage rules.
- **Email Red Alerts**: If a syntax error, bad prop, or type issue is ever committed, the deployment instantly aborts to protect production, and GitHub natively emails the owner with a link to the exact line of code failure.

---

##  Architecture Overview


```text
src/
├── app/                 # Next.js App Router (layout, pages, globals.css)
│   └── ClientProtection.tsx # Core DOM shield & security layer
├── components/          # React components
│   ├── dashboard/       # Specialized Admin Dashboard modules
│   └── M-*.tsx          # Reusable Modals
├── hooks/               # Custom React hooks (e.g., useTheme)
├── lib/                 # Core logic (Firebase setup, data structures)
├── utils/               # Global utility functions (e.g., sanitizeSvg)
└── App.tsx              # Main Navigation & Global Application Wrapper
```

### Backend (Firebase Cloud Functions)

The site is a **static export** - there is no Next.js server. Everything dynamic
runs in Cloud Functions, which hold every secret so nothing sensitive reaches the
browser. Functions in `functions/` deploy from this repo:

| Function | Trigger | What it does |
| :--- | :--- | :--- |
| `notifyCanary` | Firestore write on `Settings/Canary` | Emails the owner on a new message/booking, auto-acknowledges the guest, and rebuilds the public busy-slot mirror |
| `sendReceipt` | Callable (admin) | Emails a client receipt built in the dashboard, BCC'ing the owner |
| `sendReply` | Callable (admin) | Sends a branded reply (with attachments) to a contact message |
| `notifyLogin` | Callable | Alerts the owner on a dashboard sign-in |
| `syncSession` | HTTPS | Records the "Algorithm" session analytics |
| `llm` | Callable (admin) | Proxies the dashboard assistant so the provider key stays server-side |
| `mcp` | HTTPS | Remote **MCP server** (OAuth 2.1) letting an AI client read and manage the portfolio, treasury, bookings and receipts |

**`syncMeeting`** is the one exception: it is a callable deployed to the same
Firebase project from a **separate codebase**, so it is not in this repo. It is a
thin App Check-gated proxy that forwards to a Google Apps Script, which owns the
actual Google Calendar event and its Meet link. Both the public booking form and
the dashboard call it, and the MCP booking tools reach the same script so a
cancel or reschedule updates the guest's invite too.

```text
Visitor books  ──►  syncMeeting  ──►  Apps Script  ──►  Google Calendar + Meet
       │                                                        │
       └──►  Settings/Canary  ──►  notifyCanary  ──►  emails + public busy slots
```

### Secrets

No credential is ever committed or shipped to the client. The `NEXT_PUBLIC_*`
values in [`.env.example`](.env.example) are public Firebase identifiers, guarded
by App Check and security rules. Everything genuinely sensitive lives in Google
Secret Manager and is read only inside a function:

```bash
firebase functions:secrets:set SMTP_USER        # owner inbox
firebase functions:secrets:set RESEND_API_KEY   # transactional email relay
firebase functions:secrets:set LLM_API_KEY      # assistant provider key
firebase functions:secrets:set MEETING_SYNC_URL # Apps Script calendar endpoint
```

`MEETING_SYNC_URL` is a credential in its own right: anyone holding that URL can
create, move or cancel events on the owner's calendar, so it is stored as a
secret rather than hardcoded.

> **Deploying functions:** always scope the deploy, because `syncMeeting` lives in
> another codebase and a bare `firebase deploy` would delete it:
> ```bash
> firebase deploy --only functions:mcp,functions:notifyCanary   # etc.
> ```

---

## ️ Tech Stack

| Domain | Technology |
| :--- | :--- |
| **Framework** | [React 19](https://react.dev/), [Next.js 16](https://nextjs.org/) |
| **Backend** | [Firebase](https://firebase.google.com/) (Firestore, Functions, Storage) |
| **Animation** | [Anime.js](https://animejs.com/), [Framer Motion](https://motion.dev/) |
| **Security** | Strict CSP, hardened Firestore/Storage rules, `sanitizeSvg`, DOM tamper-deterrent |
| **Icons** | [Lucide React](https://lucide.dev/) |
| **Styling** | Vanilla CSS (Custom Design System), Tailwind CSS v4 |
| **Logic** | TypeScript |

---

##  License

Distributed under the MIT License. See `LICENSE` for more information.

---

Built with precision for the next generation of web presence.
**[Visit Website](https://temrevil.com)** • **Main Portfolio of Mohammed Ahmed**

