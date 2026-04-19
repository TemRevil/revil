# Revil | Main Profile
![Next.js](https://img.shields.io/badge/Next.js%2015-black?style=flat-square&logo=next.js)
![React](https://img.shields.io/badge/React%2019-%2320232a.svg?style=flat-square&logo=react&logoColor=%2361DAFB)
![Tailwind CSS](https://img.shields.io/badge/Tailwind%204-%2338B2AC.svg?style=flat-square&logo=tailwind-css&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat-square&logo=typescript&logoColor=white)
![Motion](https://img.shields.io/badge/Motion-000000?style=flat-square&logo=framer&logoColor=white)
![Firebase](https://img.shields.io/badge/Firebase-%23039BE5.svg?style=flat-square&logo=firebase)

**Revil** is my **Main Professional Profile** and a premium, ultra-responsive developer portfolio ecosystem. Designed for high-end digital presence, it consists of a stunning user-facing showcase and a powerful, real-time Administrative Dashboard to manage every facet of my professional career as a **Frontend & AI Expert**.

---

## ✨ Core Pillars

### 🎨 High-Fidelity UI/UX
Designed with a "Ceramic-Glass" aesthetic, Revil features:
- **Liquid Navigation**: Ultra-smooth page transitions and scroll-aware animations powered by **Anime.js** and **Framer Motion**.
- **Adaptive Precision**: A hand-crafted CSS design system providing a seamless experience from 320px mobile devices to 4K displays.
- **Atmospheric Themes**: Intelligent Dark/Light mode system with deep glassmorphism and animated background blobs.

### 🛡️ The Admin Dashboard (Canary)
A private, real-time command center built for elite project management:
- **Project Orchestrator**: Add, edit, and organize projects with dynamic image cropping and multi-tag filtering.
- **Canary Engine**: A built-in mail inbox for direct client communication and a meeting calendar with **Google Calendar API** synchronization.
- **The "Algorithm"**: Proprietary session tracking that monitors project engagement, stack time, and visitor intent.
- **Link Architect**: Generate trackable custom URLs for specific clients to monitor when they view your portfolio.

### ⚡ Technical Excellence
- **React 19 & Next.js 15**: Leveraging the latest in front-end performance, App Router, and server-side capabilities.
- **Robust Security**: Hardened Firestore rules, environment variable isolation, CSP compliance, and secure sanitized SVG rendering.
- **Cloud Infrastructure**: Scalable backend logic using Firebase Cloud Functions, Realtime live data synchronization, and secure file handling via Firebase Storage.

---

## 🚀 Experience it Locally

### Prerequisites
- Node.js (v18+)
- Firebase CLI (`npm install -g firebase-tools`)

### Installation
```bash
# Clone the repository
git clone https://github.com/temrevil/red.git

# Install dependencies
npm install

# Start development server
npm run dev
```

### 🐳 Run with Docker
You can directly run the application inside an isolated Docker container without needing Node installed locally:
```bash
# Build the Docker image
docker build -t revil-portfolio .

# Run the container on port 3000
docker run -p 3000:3000 revil-portfolio
```

## 🤖 Continuous Integration & Security

We maintain high-end reliability and stability across the entire project through automated defenses and strict security policies:
- **Zero-Error Automation**: Every push to the protected `main` branch runs through aggressive GitHub Action workflows. It rigidly tests against `npm run lint`, `npm run build`, and enforces strict TypeScript standards.
- **Data & Configuration Security**: The project utilizes hardened, defense-in-depth Firestore and Storage rules, consolidated real-time listeners, and strict CSP headers. Environment variables are managed securely using `NEXT_PUBLIC_*` prefixes.
- **Rogue DOM Protection**: The React application runs `ClientProtection`, an aggressive `MutationObserver` on the real DOM. It shields against malicious external browser extensions, strictly sanitizes HTML/SVG injections via `sanitizeSvg()`, and destroys unauthorized style injections.
- **Email Red Alerts**: If a syntax error, bad prop, or type issue is ever committed, the deployment instantly aborts to protect production, and GitHub natively emails the owner with a link to the exact line of code failure.

---

## 📂 Architecture Overview


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

---

## 🛠️ Tech Stack

| Domain | Technology |
| :--- | :--- |
| **Framework** | [React 19](https://react.dev/), [Next.js 15](https://nextjs.org/) |
| **Backend** | [Firebase](https://firebase.google.com/) (Firestore, Functions, Storage) |
| **Animation** | [Anime.js](https://animejs.com/), [Framer Motion](https://motion.dev/) |
| **Security** | ClientProtection DOM Shield, Hardened Rules, strict CSP |
| **Icons** | [Lucide React](https://lucide.dev/) |
| **Styling** | Vanilla CSS (Custom Design System), Tailwind CSS v4 |
| **Logic** | TypeScript |

---

## 📜 License

Distributed under the MIT License. See `LICENSE` for more information.

---

Built with precision for the next generation of web presence.
**[Visit Website](https://temrevil.com)** • **Main Portfolio of Mohammed Ahmed**

