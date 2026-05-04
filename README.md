# Autonomous Engineering Studio (AES)

Angular 17 studio for the AAVA platform — design, build, and execute AI pipelines with full real-time visibility.

## Quick Start

```bash
npm install
./start.sh          # or: npx ng serve --proxy-config proxy.conf.json
```

Open **http://localhost:4200**, enter your AAVA Personal Access Token, click **Launch Studio**.

> **Important:** Always start with `./start.sh` or `--proxy-config proxy.conf.json`. This proxies `/aava-api/*` → `https://int-ai.aava.ai` to avoid CORS errors in the browser.

## Features

| Module | Route | Description |
|--------|-------|-------------|
| Dashboard | `/studio/dashboard` | Live stats, quick links, starred artifacts |
| Artifact Search | `/studio/search` | All 5 types, most-recent-first, favorites |
| Execute & Watch | `/studio/execute` | Trigger workflows + SSE per-agent progress bars |
| Pipeline Builder | `/studio/builder` | Problem → AI-designed pipeline → auto-built |
| Projects | `/studio/projects` | Organize artifacts into Projects / Use Cases |
| Example Runs | `/studio/examples` | Past executions with full per-agent output |
| AES Assistant | `/studio/assistant` | Chat assistant powered by AAVA Revelio |

## Auth

- Token verified against `GET /agents/user` (known-good endpoint)
- Stored in `sessionStorage` only
- Pass `?token=<PAT>` in the URL for seamless AAVA embed
