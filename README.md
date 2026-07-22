# Openputman

Postman-like API client for the browser. Use it without an account (collections save in **local storage**), or sign in with GitHub to sync a **private Gist** — no app database.

## Stack

- `client/` — Vite + React + TypeScript
- `server/` — Express + TypeScript (optional OAuth, Gist sync, request proxy)

## Setup

1. (Optional) Create a [GitHub OAuth App](https://github.com/settings/developers) for cloud sync:
   - **Homepage URL:** `http://localhost:5173`
   - **Authorization callback URL:** `http://localhost:4000/auth/github/callback`
2. Copy env file and fill in values if using GitHub:

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

The Vite dev server proxies `/auth` and `/api` to the Express server. Guest mode works without OAuth credentials; **Send** still uses the local proxy.

## Storage

| Mode | Where data lives |
|------|------------------|
| Guest (default) | Browser `localStorage` (`openputman-workspace`) |
| Signed in | Private GitHub Gist described as `openputman-workspace` |

## Export / Load

- **Export all** (top bar) — download the full workspace JSON  
- **Load** (top bar) — restore a previously exported workspace, collection, or request file  
- **Export request** (next to Send) — download only the current request  

## OpenAPI import

Use **OpenAPI** in the collections sidebar to paste JSON/YAML, upload a file, or fetch a URL. Openputman creates a collection from `info.title` and one request per path operation (method, URL, sample headers/body when available). Supports OpenAPI 3.x and Swagger 2.0.

## Scopes (GitHub only)

OAuth requests `read:user` and `gist`.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Run client + server |
| `npm run build` | Build both packages |
| `npm start` | Start built server |
