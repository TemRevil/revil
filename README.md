# Revil
![Version](https://img.shields.io/badge/version-1.0.0-blue.svg?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-green.svg?style=flat-square)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&style=flat-square)
![Vite](https://img.shields.io/badge/Vite-7-646CFF?logo=vite&style=flat-square)
![Firebase](https://img.shields.io/badge/Firebase-Backend-FFCA28?logo=firebase&style=flat-square)

**Revil** is a premium, ultra-responsive developer portfolio ecosystem designed for high-end digital presence. It consists of a stunning user-facing showcase and a powerful, real-time Administrative Dashboard to manage every facet of a professional career.

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

### Environment Configuration
Create a `.env` file in the root directory and add your Firebase credentials:
```env
VITE_FIREBASE_API_KEY=your_key
VITE_FIREBASE_AUTH_DOMAIN=your_domain
VITE_FIREBASE_PROJECT_ID=your_id
VITE_FIREBASE_STORAGE_BUCKET=your_bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=your_id
VITE_FIREBASE_APP_ID=your_app_id
```

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
**[Visit Website](https://temrevil.com)** • **Developed by Revil**
