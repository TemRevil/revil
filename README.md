# Revil | Main Profile
![Main Profile](https://img.shields.io/badge/Status-Primary%20Ecosystem-blue?style=for-the-badge&logo=github)
![Version](https://img.shields.io/badge/version-1.0.0-blue.svg?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-green.svg?style=flat-square)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&style=flat-square)

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
- **React 19 & Vite**: Leveraging the latest in front-end performance and concurrent rendering.
- **Real-time Firestore**: Live data synchronization across all devices without page refreshes.
- **Cloud Infrastructure**: Scalable backend logic using Firebase Cloud Functions and secure file handling via Firebase Storage.

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

We maintain high-end reliability and stability across the entire project through automated defenses:
- **Zero-Error Automation**: Every push to the repository runs through aggressive GitHub Action workflows. It strictly tests against `npm run lint` and `npx tsc --noEmit`.
- **Email Red Alerts**: If a syntax error, bad prop, or type issue is ever committed, the deployment instantly aborts to protect production, and GitHub natively emails the owner with a link to the exact line of code failure.
- **Rogue DOM Protection**: The React application runs an aggressive `MutationObserver` on the real DOM. If external browser extensions (e.g., VPNs or adware) attempt to inject malicious `.style` tags or rotating CSS animations over the UI, the engine instantly destroys them to preserve pixel-perfect branding.

---

## 📂 Architecture Overview


```text
src/
├── components/          # React components
│   ├── dashboard/       # Specialized Admin Dashboard modules
│   ├── reactbits/       # Premium UI components (Loaders, etc.)
│   └── M-*.tsx          # Reusable Modals
├── lib/                 # Core engine (Firebase, logic)
├── style.css            # Elite Design System & global utilities
├── App.tsx              # Navigation & Global Logic
└── Algorithm.tsx        # Interaction Tracking Engine
```

---

## 🛠️ Tech Stack

| Domain | Technology |
| :--- | :--- |
| **Framework** | [React 19](https://react.dev/), [Vite 7](https://vitejs.dev/) |
| **Backend** | [Firebase](https://firebase.google.com/) (Firestore, Functions, Storage) |
| **Animation** | [Anime.js](https://animejs.com/), [Framer Motion](https://www.framer.com/motion/) |
| **Icons** | [Lucide React](https://lucide.dev/) |
| **Styling** | Vanilla CSS (Custom Design System), Tailwind Utility Layer |
| **Logic** | TypeScript |

---

## 📜 License

Distributed under the MIT License. See `LICENSE` for more information.

---

Built with precision for the next generation of web presence.
**[Visit Website](https://temrevil.com)** • **Main Portfolio of Mohammed Ahmed**

