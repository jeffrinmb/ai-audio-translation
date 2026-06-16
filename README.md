# AI Conference Translation Platform

Real-time AI-powered conference translation. A speaker speaks English; audiences instantly hear live translated audio and captions in Hindi, French, Arabic, or Japanese.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         LiveKit Cloud Room                          │
│                                                                     │
│  Speaker ──── audio_en ────────────────────────────────────────┐   │
│                                                                 │   │
│  Worker  ── subscribes to audio_en                             │   │
│          ── Gemini Live (×4 sessions)                          │   │
│          ── publishes: audio_hi, audio_fr, audio_ar, audio_ja  │   │
│          ── publishes: caption_hi, caption_fr, caption_ar,     │   │
│                        caption_ja (data tracks)                │   │
│                                                                 │   │
│  Audience ── subscribes to audio_{lang} + caption_{lang} ◄─────┘   │
└─────────────────────────────────────────────────────────────────────┘

Backend (NestJS :4000)  ←──── REST ────→  Frontend (Next.js :3000)
Worker  (NestJS :4001)  ←── polls /api/events/all every 10s
```

### Services
| Service | Port | Role |
|---------|------|------|
| `backend` | 4000 | REST API — event lifecycle, LiveKit token generation |
| `worker`  | 4001 | Translation — subscribes to English, runs Gemini Live, publishes translated audio/captions |
| `frontend`| 3000 | Speaker dashboard + Audience viewer (Next.js) |

---

## Prerequisites

- Node.js ≥ 20
- npm ≥ 10 (workspaces support)
- [LiveKit Cloud](https://cloud.livekit.io) project (free tier works)
- [Google Gemini API key](https://aistudio.google.com/app/apikey) with access to `gemini-2.0-flash-live-001`
- Docker + Docker Compose (for containerised deployment)

---

## Local Development Setup

### 1. Clone & install

```bash
git clone <repo-url>
cd ai-audio-translation
npm install          # installs all workspaces
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and fill in:

```env
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=APIxxxxxxxxxxxxx
LIVEKIT_API_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxx
GEMINI_API_KEY=AIzaSyxxxxxxxxxxxxxxxxxxxxxxxxxx
NEXT_PUBLIC_BACKEND_URL=http://localhost:4000
NEXT_PUBLIC_LIVEKIT_URL=wss://your-project.livekit.cloud
```

### 3. Run each service in a separate terminal

**Terminal 1 — Backend**
```bash
cd packages/backend
npm run dev
# Listening on http://localhost:4000/api
```

**Terminal 2 — Worker**
```bash
cd packages/worker
npm run dev
# Listening on http://localhost:4001
# Polls backend every 10s for active events
```

**Terminal 3 — Frontend**
```bash
cd packages/frontend
npm run dev
# Open http://localhost:3000
```

---

## Docker Deployment

```bash
# Build and start all three services
docker compose --env-file .env up --build

# In background
docker compose --env-file .env up --build -d

# View logs
docker compose logs -f

# Stop
docker compose down
```

> **Important**: `NEXT_PUBLIC_BACKEND_URL` must be the URL **accessible from the browser**,
> not the Docker internal network address.
> For production, point it to your reverse-proxy URL (e.g. `https://api.yourdomain.com`).

---

## Usage

### Speaker Flow

1. Open `http://localhost:3000/speaker`
2. Click **Create Event** → an event code and QR code are generated
3. Share the QR code / event code with your audience
4. Click **Start Session** → allow microphone access
5. Speak in English — the worker automatically translates in real time
6. Select a caption language to see live captions on your screen
7. Click **End Session** when done

### Audience Flow

1. Scan the QR code **or** open `http://localhost:3000/join`
2. Enter the event code → click **Join Session**
3. Tap **Enable Audio** (required by browsers)
4. Select your preferred language
5. Listen to translated audio and read live captions

---

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/events` | Create event — returns `{eventCode, roomName, speakerToken, ...}` |
| `GET`  | `/api/events/:code` | Get event metadata |
| `GET`  | `/api/events/:code/audience-token` | Issue audience LiveKit token |
| `GET`  | `/api/events/:code/speaker-token` | Issue speaker LiveKit token |
| `GET`  | `/api/events/all` | List all active events (used by worker) |
| `DELETE` | `/api/events/:code` | End/delete event |

---

## LiveKit Track Naming

| Track | Kind | Published by |
|-------|------|--------------|
| `audio_en` | Audio | Speaker browser |
| `audio_hi` | Data (binary PCM) | Worker |
| `audio_fr` | Data (binary PCM) | Worker |
| `audio_ar` | Data (binary PCM) | Worker |
| `audio_ja` | Data (binary PCM) | Worker |
| `caption_en` | — | (English captions from `audio_en` transcript, future) |
| `caption_hi` | Data (JSON) | Worker |
| `caption_fr` | Data (JSON) | Worker |
| `caption_ar` | Data (JSON) | Worker |
| `caption_ja` | Data (JSON) | Worker |

---

## Project Structure

```
ai-audio-translation/
├── .env.example
├── .gitignore
├── docker-compose.yml
├── package.json                        # npm workspaces root
├── README.md
└── packages/
    ├── backend/                        # NestJS REST API
    │   ├── Dockerfile
    │   ├── nest-cli.json
    │   ├── package.json
    │   ├── tsconfig.json
    │   └── src/
    │       ├── main.ts
    │       ├── app.module.ts
    │       ├── events/
    │       │   ├── event.interface.ts
    │       │   ├── events.controller.ts
    │       │   ├── events.module.ts
    │       │   └── events.service.ts
    │       └── livekit/
    │           ├── livekit.module.ts
    │           └── livekit.service.ts
    │
    ├── worker/                         # Translation worker
    │   ├── Dockerfile
    │   ├── nest-cli.json
    │   ├── package.json
    │   ├── tsconfig.json
    │   └── src/
    │       ├── main.ts
    │       ├── app.module.ts
    │       └── translation/
    │           ├── gemini-live.client.ts    # Gemini Live WebSocket client
    │           ├── language-worker.ts       # Per-language Gemini session
    │           ├── room-session.ts          # LiveKit room + 4 language workers
    │           ├── translation.module.ts
    │           └── translation.service.ts  # Event poller + session orchestrator
    │
    └── frontend/                       # Next.js App Router
        ├── Dockerfile
        ├── next.config.ts
        ├── package.json
        ├── postcss.config.js
        ├── tailwind.config.ts
        ├── tsconfig.json
        └── src/
            ├── app/
            │   ├── globals.css
            │   ├── layout.tsx
            │   ├── page.tsx                  # Landing page
            │   ├── speaker/
            │   │   └── page.tsx              # Speaker dashboard
            │   ├── join/
            │   │   └── page.tsx              # Audience join page
            │   └── event/[eventCode]/
            │       └── page.tsx              # Audience event page
            ├── components/
            │   ├── CaptionPanel.tsx
            │   └── LanguageSelector.tsx
            ├── hooks/
            │   ├── useCaptions.ts
            │   └── useAudioPlayer.ts
            └── lib/
                ├── api.ts
                └── constants.ts
```

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Mic permission denied | Allow microphone in browser settings, reload |
| No translated audio | Verify worker is running and `GEMINI_API_KEY` is valid |
| `Event not found` on join | Ensure the backend is running and the code is correct |
| LiveKit connection fails | Verify `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` |
| Worker can't reach backend | In Docker: `BACKEND_URL=http://backend:4000`, locally: `http://localhost:4000` |
| Gemini session drops | Worker auto-reconnects with 3s back-off |
