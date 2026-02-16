# WadsMedia

Manage your Sonarr and Radarr media libraries through Telegram or SMS. Send a message, get things done -- no app to install, no UI to learn.

WadsMedia connects your phone to your media servers via an LLM-powered conversational interface. Search for movies and shows, add them to your library, check download progress, discover new content, and receive notifications when media is ready -- all through natural language.

## Features

- **Search** -- Find movies and TV shows by title. Results show year, overview, poster art, and whether it's already in your library.
- **Add media** -- Add movies and shows to your download list with sensible defaults. Quality profile and download path are applied automatically.
- **Remove media** -- Remove movies or shows with confirmation before anything is deleted (admin only).
- **Download status** -- Check what's currently downloading with progress percentages and time estimates.
- **Upcoming schedule** -- View upcoming episode air dates and movie releases in formatted tables.
- **Discovery** -- Find media by genre, actor, year, or language via TMDB. Library status shown for each result.
- **Plex integration** -- Check what's in your Plex library, view watch history via Tautulli.
- **Web search** -- Describe a movie vaguely ("that one where the guy relives the same day") and the bot finds it.
- **Proactive notifications** -- Optionally get notified when downloads finish or new episodes are grabbed (requires Sonarr/Radarr webhook setup -- see [Setting Up Proactive Notifications](#setting-up-proactive-notifications)).
- **Conversational context** -- Say "add that one" or "the second one" and the app understands what you mean.
- **User management** -- Admin approve/block users, whitelist phone numbers, per-user conversation history.
- **Admin dashboard** -- Web-based admin panel for user management and audit logs.

## Messaging Channels

WadsMedia supports two messaging providers. You can use one or both:

| Channel | Requirements | Features |
|---------|-------------|----------|
| **Telegram** (recommended) | Bot token from @BotFather | Rich formatting, poster images, inline buttons, group chats |
| **SMS/MMS** | Twilio account + phone number | Plain text, poster via MMS, works on any phone |

Neither is required -- configure whichever you want to use.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose
- An OpenAI-compatible LLM API (OpenAI, Ollama, LM Studio, etc.) -- model must support function/tool calling
- [Sonarr](https://sonarr.tv/) and/or [Radarr](https://radarr.video/) instances
- **For Telegram:** A bot token from [@BotFather](https://t.me/BotFather) and a publicly accessible URL for webhooks
- **For SMS:** A [Twilio](https://www.twilio.com/) account with an SMS-capable phone number

## Quick Start

### 1. Clone and configure

```bash
git clone https://github.com/yourusername/wadsmedia.git
cd wadsmedia
cp .env.example .env
```

Edit `.env` with your configuration (see [Configuration](#configuration) below).

### 2. Start with Docker Compose

```bash
docker compose up -d
```

The app starts on port 3000. Verify it's running:

```bash
curl http://localhost:3000/health
```

You should see a JSON response with `"status": "ok"`.

### 3. Configure your messaging channel

#### Telegram (recommended)

1. Message [@BotFather](https://t.me/BotFather) on Telegram to create a bot and get your token
2. Set `TELEGRAM_BOT_TOKEN` in your `.env`
3. Set `TELEGRAM_WEBHOOK_URL` to your public URL (e.g., `https://yourdomain.com`)
4. The webhook is registered automatically on startup at `/webhook/telegram`
5. Message your bot on Telegram -- the admin user is seeded automatically

#### SMS via Twilio

1. Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_PHONE_NUMBER` in your `.env`
2. In your [Twilio Console](https://console.twilio.com/), go to **Phone Numbers** > **Active Numbers**
3. Under **Messaging Configuration**, set the webhook URL to `https://your-domain.com/webhook/twilio` (POST)
4. Text your Twilio number -- the admin phone is auto-approved

If developing locally, use ngrok or Cloudflare Tunnel to expose your local server:

```bash
ngrok http 3000
```

### 4. Send a message

Once configured, try:
- "Search for Inception"
- "What's airing this week?"
- "Add Breaking Bad"
- "What's downloading?"
- "Recommend some sci-fi movies"

## Configuration

All configuration is via environment variables. Create a `.env` file from the example:

```bash
cp .env.example .env
```

### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `ADMIN_PHONE` | Admin user's phone number (E.164 format) | `+15551234567` |
| `LLM_API_KEY` | API key for your LLM provider | `sk-xxxxxxxxxxxxxxxx` |

### LLM Provider

| Variable | Default | Description |
|----------|---------|-------------|
| `LLM_BASE_URL` | `https://api.openai.com/v1` | Base URL for the LLM API |
| `LLM_MODEL` | `gpt-4o` | Model name to use |
| `LLM_API_KEY` | -- | API key (set to `not-needed` for local models) |

WadsMedia works with any OpenAI-compatible API. To use a local model:

**Ollama:**
```env
LLM_BASE_URL=http://host.docker.internal:11434/v1
LLM_MODEL=llama3.1
LLM_API_KEY=not-needed
```

**LM Studio:**
```env
LLM_BASE_URL=http://host.docker.internal:1234/v1
LLM_MODEL=local-model
LLM_API_KEY=not-needed
```

> Note: The model must support function/tool calling for WadsMedia to work correctly. Many local models do not support this reliably.

### Telegram

| Variable | Description | Example |
|----------|-------------|---------|
| `TELEGRAM_BOT_TOKEN` | Bot token from @BotFather | `1234567890:ABCdefGHIjklMNOpqrsTUVwxyz` |
| `TELEGRAM_WEBHOOK_URL` | Public base URL for webhook registration | `https://yourdomain.com` |
| `TELEGRAM_WEBHOOK_SECRET` | Secret for webhook validation (auto-generated if not set) | `my-secret` |
| `ADMIN_TELEGRAM_CHAT_ID` | Admin's Telegram chat ID (for notifications) | `123456789` |

### SMS (Twilio)

| Variable | Description | Example |
|----------|-------------|---------|
| `TWILIO_ACCOUNT_SID` | Twilio account SID | `ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| `TWILIO_AUTH_TOKEN` | Twilio auth token | `xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| `TWILIO_PHONE_NUMBER` | Your Twilio phone number (E.164 format) | `+15559876543` |

### Media Servers

| Variable | Description | Example |
|----------|-------------|---------|
| `SONARR_URL` | Sonarr base URL | `http://sonarr:8989` |
| `SONARR_API_KEY` | Sonarr API key (Settings > General) | `xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| `RADARR_URL` | Radarr base URL | `http://radarr:7878` |
| `RADARR_API_KEY` | Radarr API key (Settings > General) | `xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |

Both are optional -- you can run with just Sonarr (TV only) or just Radarr (movies only).

### Optional Integrations

| Variable | Description | Example |
|----------|-------------|---------|
| `PLEX_URL` | Plex server URL | `http://plex:32400` |
| `PLEX_TOKEN` | Plex authentication token | `xxxxxxxxxxxxxxxx` |
| `TAUTULLI_URL` | Tautulli URL (for watch history) | `http://tautulli:8181` |
| `TAUTULLI_API_KEY` | Tautulli API key | `xxxxxxxxxxxxxxxx` |
| `TMDB_ACCESS_TOKEN` | TMDB API token (for discovery/recommendations) | `eyJhbGci...` |
| `BRAVE_API_KEY` | Brave Search API key (for web search fallback) | `BSA...` |

### Users

| Variable | Description | Example |
|----------|-------------|---------|
| `ADMIN_PHONE` | Admin phone number (required) | `+15551234567` |
| `PHONE_WHITELIST` | Comma-separated pre-approved phone numbers | `+15551234567,+15559876543` |

### Admin Dashboard

| Variable | Description | Example |
|----------|-------------|---------|
| `ADMIN_PASSWORD` | Password for the web admin panel | `my-secure-password` |
| `ADMIN_SESSION_SECRET` | Session encryption key (min 32 chars) | `xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |

Access the admin dashboard at `http://your-host:3000/admin`.

### Notifications

| Variable | Default | Description |
|----------|---------|-------------|
| `NOTIFICATION_SECRET` | -- | Shared secret for Sonarr/Radarr webhook authentication |

### Server

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP port |
| `HOST` | `0.0.0.0` | Bind address |
| `NODE_ENV` | `production` | `development` for pretty logs |
| `DATABASE_PATH` | `/data/wadsmedia.db` | SQLite database file path |
| `TZ` | System default | Timezone for schedule display (e.g., `America/Vancouver`) |

## Setting Up Proactive Notifications

WadsMedia can notify you when downloads finish or episodes are grabbed. This requires configuring Sonarr and Radarr to send webhook events to WadsMedia.

### 1. Generate a shared secret

```bash
openssl rand -hex 32
```

Add the output to your `.env` as `NOTIFICATION_SECRET` and restart WadsMedia.

### 2. Configure Sonarr

1. Open Sonarr > **Settings** > **Connect**
2. Click **+** > **Webhook**
3. Configure:
   - **Name**: WadsMedia
   - **Notification Triggers**: Check **On Grab** and **On Import**
   - **URL**: `http://<wadsmedia-host>:3000/webhook/sonarr?token=<your-secret>`
   - **Method**: POST
4. Click **Test** to verify, then **Save**

### 3. Configure Radarr

1. Open Radarr > **Settings** > **Connect**
2. Click **+** > **Webhook**
3. Configure:
   - **Name**: WadsMedia
   - **Notification Triggers**: Check **On Grab** and **On Import**
   - **URL**: `http://<wadsmedia-host>:3000/webhook/radarr?token=<your-secret>`
   - **Method**: POST
4. Click **Test** to verify, then **Save**

### Notification examples

When events occur, all active users receive a notification:

- `Downloaded: Breaking Bad S01E01 - Pilot`
- `Grabbing: The Dark Knight (2008)`
- `Upgraded: Game of Thrones S08E06 - The Iron Throne`

## Docker Compose with Sonarr and Radarr

If you want to run everything together:

```yaml
services:
  wadsmedia:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - wadsmedia-data:/data
    env_file:
      - .env
    environment:
      NODE_ENV: production
      DATABASE_PATH: /data/wadsmedia.db
      SONARR_URL: http://sonarr:8989
      RADARR_URL: http://radarr:7878
    restart: unless-stopped
    depends_on:
      - sonarr
      - radarr

  sonarr:
    image: linuxserver/sonarr
    ports:
      - "8989:8989"
    volumes:
      - sonarr-config:/config
      - media:/tv
    environment:
      PUID: 1000
      PGID: 1000
      TZ: America/New_York
    restart: unless-stopped

  radarr:
    image: linuxserver/radarr
    ports:
      - "7878:7878"
    volumes:
      - radarr-config:/config
      - media:/movies
    environment:
      PUID: 1000
      PGID: 1000
      TZ: America/New_York
    restart: unless-stopped

volumes:
  wadsmedia-data:
  sonarr-config:
  radarr-config:
  media:
```

## Development

### Local setup

```bash
npm install
cp .env.example .env
# Edit .env with your values, set NODE_ENV=development
```

### Run in development mode

```bash
npm run dev
```

This uses `tsx watch` for auto-reloading on file changes, with pretty-printed logs.

### Build

```bash
npm run build    # Compile TypeScript to dist/
npm start        # Run compiled output
```

### Lint and format

```bash
npm run check       # Check for issues
npm run check:fix   # Auto-fix issues
```

### Database

The SQLite database is created automatically on first run with all migrations applied. For development:

```bash
npm run db:generate   # Generate migration from schema changes
npm run db:studio     # Open Drizzle Studio (database browser)
```

## Architecture

```
Telegram / SMS
      |
      v
  Webhooks  ──>  WadsMedia  ──>  Sonarr / Radarr
                     |                Plex / Tautulli
                     v                TMDB / Brave Search
               OpenAI-compatible LLM
```

**Tech stack:**
- Node.js 22 + TypeScript (strict ESM)
- Fastify 5 with Pino structured logging
- SQLite via better-sqlite3 + Drizzle ORM
- OpenAI SDK v6 (any compatible provider)
- grammY for Telegram Bot API
- Twilio SDK for SMS/MMS
- Docker multi-stage build

**Key design decisions:**
- Webhook responds immediately, then processes the LLM conversation asynchronously to avoid timeout limits.
- Tool calling uses a bounded loop (max 10 iterations) with automatic confirmation interception for destructive operations.
- Conversation history uses a sliding window (last 20 messages) that preserves tool call pairs atomically.
- Telegram messages use code-level formatting (bold titles, aligned tables in `<pre>` blocks) since LLMs are unreliable at producing consistent formatting.
- SMS messages are stripped to plain text via a system prompt addendum.
- Notifications use template strings instead of LLM for speed, cost, and predictability.
- All media server operations degrade gracefully -- the app runs fine with only some integrations configured.

## Troubleshooting

**App won't start**
- Check `docker compose logs wadsmedia` for configuration errors
- Ensure `ADMIN_PHONE` is set (it's the only truly required variable)

**Telegram messages aren't received**
- Verify your bot token with `curl https://api.telegram.org/bot<TOKEN>/getMe`
- Check that `TELEGRAM_WEBHOOK_URL` is publicly accessible
- Check logs for webhook registration: `docker compose logs wadsmedia | grep -i telegram`

**SMS messages aren't received**
- Verify your Twilio webhook URL points to `/webhook/twilio`
- Check that the URL is publicly accessible
- Verify `TWILIO_AUTH_TOKEN` matches your Twilio account

**LLM doesn't respond**
- Check that `LLM_API_KEY` and `LLM_BASE_URL` are set
- Verify the model supports function/tool calling
- Check logs for API errors: `docker compose logs wadsmedia | grep -i llm`

**Sonarr/Radarr not connecting**
- Verify the URL is reachable from WadsMedia's network (use Docker service names if on the same Compose network)
- Check API keys in Sonarr/Radarr under Settings > General
- The app logs connection status on startup

**Notifications not arriving**
- Verify Sonarr/Radarr webhooks are configured and the test button succeeds
- Check the `?token=` parameter matches your `NOTIFICATION_SECRET`

## License

MIT
