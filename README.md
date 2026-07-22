# Openputman

Postman-like API client for the browser. Sign in with GitHub; collections are stored in a **private Gist** in your account — no app database.

## Stack

- `client/` — Vite + React + TypeScript
- `server/` — Express + TypeScript (OAuth, Gist sync, request proxy)

## Setup

1. Create a [GitHub OAuth App](https://github.com/settings/developers):
   - **Homepage URL:** `http://localhost:5173`
   - **Authorization callback URL:** `http://localhost:4000/auth/github/callback`
2. Copy env file and fill in the Client ID / Secret:

```bash
cp .env.example .env
```

3. Install and run:

```bash
npm install
npm run dev
```

- App UI: http://localhost:5173  
- API server: http://localhost:4000  

The Vite dev server proxies `/auth` and `/api` to the Express server. Load env vars for the server from the repo root `.env` (or `server/.env`).

## Scopes

OAuth requests `read:user` and `gist`.

## How storage works

On first login, Openputman creates a private Gist described as `openputman-workspace` containing `openputman-workspace.json`. **Save to GitHub** updates that Gist.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Run client + server |
| `npm run build` | Build both packages |
| `npm start` | Start built server |
