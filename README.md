# Portfolio Project

A modern, responsive portfolio website built with React and Vite.

## Quick Start

### Development
```bash
npm run dev
```
This will start the development server at `http://localhost:5173/`

### Build
```bash
npm run build
```
This will create an optimized production build in the `dist` folder.

### Preview Build
```bash
npm run preview
```

## Tech Stack

- **React 19.2.0** - UI library
- **Vite 7.2.4** - Build tool and dev server
- **CSS** - Styling with reusable design system
- **Firebase** - Hosting and backend services (ready to configure)

## CSS Design System

The project includes a comprehensive CSS design system located in `src/index.css` with:

- **Root Variables**: Colors, typography, spacing, shadows, transitions
- **Typography Utilities**: Headings, text sizes, font weights, text colors
- **Background Utilities**: Solid colors, gradients, glassmorphism
- **Layout Utilities**: Flexbox, grid, spacing, containers
- **Component Base Styles**: Buttons, cards, inputs
- **Animations**: Fade in, slide up, slide down, scale in
- **Dark Mode Support**: Built-in dark theme via `[data-theme="dark"]`

### Using the Design System

```jsx
// Example button
<button className="btn btn-primary btn-lg">Click Me</button>

// Example card with glassmorphism
<div className="card-glass">
  <h3 className="heading-3">Title</h3>
  <p className="text-secondary">Description</p>
</div>

// Example layout
<div className="container">
  <div className="flex items-center justify-between gap-4">
    <div>Content</div>
  </div>
</div>
```

## Firebase Setup

Firebase CLI is installed globally. To configure Firebase for this project:

1. Login to Firebase:
```bash
firebase login
```

2. Initialize Firebase in the project:
```bash
firebase init
```

3. Select the services you want (Hosting, Firestore, Functions, etc.)

4. Deploy to Firebase:
```bash
firebase deploy
```

## Project Structure

```
revil/
├── public/          # Static assets
├── src/
│   ├── assets/      # Images, fonts, etc.
│   ├── App.jsx      # Main App component
│   ├── App.css      # App-specific styles
│   ├── index.css    # Design system & global styles
│   └── main.jsx     # Entry point
├── index.html       # HTML template
├── package.json     # Dependencies
└── vite.config.js   # Vite configuration
```

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

## Next Steps

The foundation is set up! You can now start building your portfolio:

1. Customize the design system colors and fonts in `src/index.css`
2. Create components for your portfolio sections
3. Build pages (Home, About, Projects, Contact, etc.)
4. Add content and assets
5. Configure Firebase for hosting/backend
6. Deploy your portfolio

---

Built with ❤️ using React + Vite
