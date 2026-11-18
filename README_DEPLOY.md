# GravityVerse – Render Full-Stack Deployment

This project can run as a single Render Web Service. The Express server serves the production Vite build from `dist/` and handles `/api` requests on the same origin.

## Render settings
- Runtime: Node
- Build command: `npm install && npm run build`
- Start command: `npm start`
- Root directory: repository root

Do not set `API_ONLY=true` when deploying the combined frontend and backend. Leave `VITE_API_BASE_URL` empty so browser API requests use the same Render origin.

Configure required service secrets in the Render Environment dashboard. Never commit API keys or Firebase service-account credentials.
