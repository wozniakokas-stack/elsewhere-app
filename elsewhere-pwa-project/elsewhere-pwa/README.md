# ELSEWHERE — Alternative Story Maker

A responsive, installable Progressive Web App with a historical archive aesthetic, account system, saved story library, and OpenAI-powered story generation.

## Requirements

- Node.js 20+
- An OpenAI API key for AI story generation
- HTTPS in production (required for PWA installation and service workers; localhost is fine for development)

## Run locally

```bash
cp .env.example .env
# Edit .env and set SESSION_SECRET and OPENAI_API_KEY
npm install
npm start
```

Open `http://localhost:3000`.

## Install on PC or Android

1. Deploy the app to a domain served over HTTPS.
2. Open the site in Chrome or Edge.
3. On desktop, choose the install icon in the address bar or browser menu → **Install ELSEWHERE**.
4. On Android, open the site in Chrome → menu → **Install app** or **Add to Home screen**.

The service worker caches the application shell for offline loading. Account, library, and AI features require a connection.

## Configuration

- `OPENAI_API_KEY`: server-side API key. Never put this key in browser code.
- `OPENAI_MODEL`: model used by the generation endpoint (default `gpt-4.1-mini`).
- `SESSION_SECRET`: use a long, random secret in production.
- `PORT`: server port (default `3000`).
- `APP_ORIGIN`: reserved for deployment configuration.

## Features

- Responsive desktop, tablet, and mobile interface
- Installable PWA manifest, app icons, and service worker
- Account registration, sign-in, and sign-out
- SQLite-backed user accounts and saved manuscripts
- AI story generation through a server-side OpenAI API call
- Universe presets: Original history, Marvel-inspired universe, World War I, World War II, and speculative World War III
- Copy, save, reopen, and delete manuscripts

## Production checklist

This is a deployable starter project, but review these items before a public launch:

- Serve behind HTTPS and a reverse proxy.
- Set `NODE_ENV=production`, a strong `SESSION_SECRET`, and secure cookie settings.
- Replace Express's default in-memory session store with a persistent store (for example, SQLite or Redis) before running multiple instances or relying on sessions across restarts.
- Add CSRF protection and email verification/password reset if public account registration is enabled.
- Add privacy policy, terms, data-retention policy, abuse reporting, and age-appropriate safeguards.
- Configure backups for `elsewhere.sqlite`, monitoring, and API usage limits/budget alerts.
- Review model availability and pricing for your OpenAI account.

## Notes

The Marvel option is a fan-fiction-inspired setting and is not affiliated with or endorsed by Marvel. Historical settings are fictional alternate-history explorations, not factual claims. The project does not bundle an OpenAI API key; generation remains disabled until you configure one.
