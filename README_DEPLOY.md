# GravityVerse Deployment Guide

This application is engineered as a **100% Pure Frontend Web Application**, designed to be built easily, hosted for free on **GitHub Pages**, and run entirely client-side without requiring any costly external backend servers.

## Instant Deployment to GitHub Pages

Since routing uses `HashRouter` and the AI/network synchronicity runs directly in the user's browser, you can deploy the static site in seconds:

1. **Build the Static Assets**:
   Run the standard production build compiler:
   ```bash
   npm run build
   ```
2. **Deploy the Output**:
   Push/upload the compiled `dist/` directory to your GitHub Pages branch (usually `gh-pages`), or configure a GitHub Action to deploy automatically.

## AI Core Access Model

By transitioning to a serverless frontend, your app is completely protected from backend cost ceilings, key leaks, and server latency:
* **Default Mode**: If a user does not have an API key configured, the interface gently prompts them to link their personal free API key.
* **Master Key Store**: Users can link their secure Gemini API key via the **Neural Core Settings** modal (1-click generation from Google AI Studio).
* **Local Container Locking**: Keys are stored locally in the user's secure browser `localStorage`. They are never transmitted to any third-party hosts or middlemen, guaranteeing 100% data confidentiality and private API rate-limits.

## Key Benefits
1. **Zero Hosting Costs**: Host for free on GitHub Pages, Vercel, or Netlify forever.
2. **Uncapped AI Access**: Direct Google API connection bypasses global server rate limits and server sleep.
3. **Supreme Privacy**: Security-honest design holds user interactions exclusively in their private browser instance and Firebase container.
