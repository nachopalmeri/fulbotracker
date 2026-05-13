# FulboTracker

A clean, responsive football match tracker for friends who want to log matches, split pitch costs, create tournaments and view standings — with optional cloud sync.

## Features
- Match logging: date, location, goals, result (win/draw/loss)
- Cost sharing: percentage-based (100/70/50/30) with auto-calculation
- Tournaments: offline/online, invite via code, join with your name
- Standings: per-player stats sortable by Points, Wins, Goals, or Spend; last 5 results chips
- Prize pool: optional prize for the most wins (shown on tournament card and table)
- Edit/Delete matches with confirmation dialogs
- Charts: doughnut (results) and line (goals history) using Chart.js
- Cloud sync: Firebase Firestore for online tournaments and shared matches
- Authentication: email/password with Firebase Authentication
- Analytics: Firebase Analytics (optional)
- Responsive UI: Tailwind CSS + SweetAlert2 interactions

## Tech Stack
- HTML, CSS (Tailwind), JavaScript
- Firebase (Firestore, Auth, Analytics)
- Chart.js

## Project Structure
- `index.html` — UI layout, modals, and script loading
- `script.js` — core logic (matches, tournaments, sorting, sync, charts)
- `styles.css` — custom styles and polish
- `config.js` — centralized Firebase config to avoid user setup
- `vercel.json` — SPA rewrites for Vercel deployments

## Getting Started
1. Clone the repository.
2. Option A: open `index.html` directly in a modern browser.
3. Option B: serve locally with any static server (e.g., `python -m http.server` or your preferred tool).

### Firebase Configuration (Optional but recommended for online mode)
- This project reads credentials from `config.js`. Non-secret config values are already supported by Firebase.
- Replace the object in `config.js` with your own Firebase web app config if you want to use your project.
- Enable:
  - Authentication → Email/Password
  - Firestore Database
  - Add your production domain (e.g., Vercel URL) under Authentication → Settings → Authorized domains

### Suggested Firestore Rules
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isSignedIn() { return request.auth != null; }

    match /matches/{id} {
      allow read, write: if isSignedIn();
    }
    match /tournaments/{id} {
      allow read: if true;         // public read for discovery
      allow write: if isSignedIn(); // create/join/update requires auth
    }
  }
}
```

## Deployment (Vercel)
1. Push the repository to GitHub.
2. Create a project on [Vercel](https://vercel.com) and import the repo.
3. Deploy with defaults (this repo includes `vercel.json` for SPA rewrites).
4. If using Firebase, add your Vercel domain under Authorized domains in Firebase Authentication.

## Usage
- Register matches from the “Registrar” view.
- Create tournaments (optionally online) and share the invite code.
- Friends join via “Unirse” with the code and their name; standings update automatically.
- Use the sort control in the tournament table to order by Points/Wins/Goals/Spend.
- If a prize pool is set, it is displayed and awarded to the player with the most wins.

## Portfolio Notes
- Professional UI and UX: clean cards, modals, alerts, and charts.
- Fully functional without backend setup (local mode); cloud mode available with Firebase.
- Clear separation of concerns and modular logic suitable for expansion.
- Built with AI-assisted development and manual review, focused on turning a real-life use case into a working product.

## Status

Portfolio project / functional prototype.
