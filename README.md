# WadsMedia

Manage your Sonarr and Radarr media libraries through text messages. Send an SMS, get things done -- no app to install, no UI to learn.

WadsMedia connects your phone to your media servers via an LLM-powered conversational interface. Search for movies and shows, add them to your library, check download progress, and receive notifications when media is ready -- all through natural language text messages.

## Features

- **Search** -- Find movies and TV shows by title. Results show year, overview, and whether it's already in your library.
- **Add media** -- Add movies and shows to your download list with sensible defaults. Quality profile and download path are applied automatically.
- **Remove media** -- Remove movies or shows with confirmation before anything is deleted.
- **Download status** -- Check what's currently downloading with progress percentages and time estimates.
- **Upcoming schedule** -- View upcoming episode air dates and movie releases.
- **Proactive notifications** -- Get texted automatically when downloads finish or new episodes are grabbed.
- **Conversational context** -- Say "add that one" or "the second one" and the app understands what you mean.
- **User management** -- Whitelist phone numbers, onboard new users through conversation, and keep each user's history isolated.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose
- A [Twilio](https://www.twilio.com/) account with an SMS-capable phone number
- An OpenAI-compatible LLM API (OpenAI, Ollama, LM Studio, etc.)
- [Sonarr](https://sonarr.tv/) and/or [Radarr](https://radarr.video/) instances
- A publicly accessible URL for Twilio webhooks (use [ngrok](https://ngrok.com/) for local development)

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

### 3. Configure Twilio webhook

In your [Twilio Console](https://console.twilio.com/):

1. Go to **Phone Numbers** > **Manage** > **Active Numbers**
2. Select your phone number
3. Under **Messaging Configuration**, set:
   - **When a message comes in**: Webhook
   - **URL**: `https://your-domain.com/webhook/twilio`
   - **HTTP Method**: POST

If developing locally, use ngrok to expose your local server:

```bash
ngrok http 3000
```

Then use the ngrok HTTPS URL as your webhook URL (e.g., `https://abc123.ngrok.io/webhook/twilio`).

### 4. Send a text

Text your Twilio number. If your phone is the admin number, you'll be active immediately. Otherwise, the onboarding flow will ask for your name and notify the admin for approval.

Once active, try:
- "Search for Inception"
- "What's airing this week?"
- "Add Breaking Bad"
- "What's downloading?"

## Configuration

All configuration is via environment variables. Create a `.env` file from the example:

```bash
cp .env.example .env
```

### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `ADMIN_PHONE` | Admin user's phone number (E.164 format) | `+15551234567` |
| `TWILIO_ACCOUNT_SID` | Twilio account SID | `ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| `TWILIO_AUTH_TOKEN` | Twilio auth token | `xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| `TWILIO_PHONE_NUMBER` | Your Twilio phone number (E.164 format) | `+15559876543` |
| `LLM_API_KEY` | API key for your LLM provider | `sk-xxxxxxxxxxxxxxxx` |

### LLM Provider

| Variable | Default | Description |
|----------|---------|-------------|
| `LLM_BASE_URL` | `https://api.openai.com/v1` | Base URL for the LLM API |
| `LLM_MODEL` | `gpt-4o` | Model name to use |
| `LLM_API_KEY` | -- | API key |

WadsMedia works with any OpenAI-compatible API. To use a local model:

**Ollama:**
```env
LLM_BASE_URL=http://host.docker.internal:11434/v1
LLM_MODEL=llama3.1
LLM_API_KEY=ollama
```

**LM Studio:**
```env
LLM_BASE_URL=http://host.docker.internal:1234/v1
LLM_MODEL=local-model
LLM_API_KEY=lm-studio
```

> Note: The model must support function/tool calling for WadsMedia to work correctly.

### Media Servers

| Variable | Description | Example |
|----------|-------------|---------|
| `SONARR_URL` | Sonarr base URL | `http://sonarr:8989` or `http://192.168.1.50:8989` |
| `SONARR_API_KEY` | Sonarr API key (Settings > General) | `xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| `RADARR_URL` | Radarr base URL | `http://radarr:7878` or `http://192.168.1.50:7878` |
| `RADARR_API_KEY` | Radarr API key (Settings > General) | `xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |

Both are optional -- you can run with just Sonarr (TV only) or just Radarr (movies only). If a server is unreachable on startup, the app continues in degraded mode and logs a warning.

To find your API key: open Sonarr/Radarr, go to **Settings** > **General** > **Security** > **API Key**.

### Users

| Variable | Description | Example |
|----------|-------------|---------|
| `ADMIN_PHONE` | Admin phone number (required) | `+15551234567` |
| `PHONE_WHITELIST` | Comma-separated pre-approved phone numbers | `+15551234567,+15559876543` |

The admin receives approval requests when unknown users text the app. Whitelisted numbers are automatically approved on first contact.

### Notifications

| Variable | Default | Description |
|----------|---------|-------------|
| `NOTIFICATION_SECRET` | -- | Shared secret for webhook authentication |

If set, Sonarr/Radarr webhook URLs must include `?token=<secret>` to be accepted. If not set, webhook endpoints accept any request (suitable for trusted local networks).

### Server

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP port |
| `HOST` | `0.0.0.0` | Bind address |
| `NODE_ENV` | `production` | `development` for pretty logs |
| `DATABASE_PATH` | `/data/wadsmedia.db` | SQLite database file path |

### Complete `.env` Example

```env
# Server
PORT=3000
NODE_ENV=production
DATABASE_PATH=/data/wadsmedia.db

# Twilio
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_PHONE_NUMBER=+15559876543

# LLM
LLM_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4o

# Media Servers
SONARR_URL=http://192.168.1.50:8989
SONARR_API_KEY=your-sonarr-api-key
RADARR_URL=http://192.168.1.50:7878
RADARR_API_KEY=your-radarr-api-key

# Users
ADMIN_PHONE=+15551234567
PHONE_WHITELIST=+15551234567,+15559876543

# Notifications (optional)
NOTIFICATION_SECRET=my-secret-token
```

## Setting Up Proactive Notifications

WadsMedia can text you when downloads finish or episodes are grabbed. This requires configuring Sonarr and Radarr to send webhook events to WadsMedia.

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

When events occur, all active users receive an SMS:

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
User's Phone
    |
    v
  Twilio  ──webhook──>  WadsMedia  ──API──>  Sonarr / Radarr
                            |
                            v
                      OpenAI-compatible LLM
```

**Tech stack:**
- Node.js 22 + TypeScript (strict ESM)
- Fastify 5 with Pino structured logging
- SQLite via better-sqlite3 + Drizzle ORM
- OpenAI SDK v6 (any compatible provider)
- Twilio SDK for RCS/SMS
- Docker multi-stage build

**Key design decisions:**
- Webhook responds with empty TwiML immediately, then processes the LLM conversation asynchronously to avoid Twilio's 15-second timeout.
- Tool calling uses a bounded loop (max 10 iterations) with automatic confirmation interception for destructive operations.
- Conversation history uses a sliding window (last 20 messages) that preserves tool call pairs atomically.
- Notifications use template strings instead of LLM for speed, cost, and predictability.
- All media server operations degrade gracefully -- the app runs fine with only Sonarr, only Radarr, or neither configured.

## Troubleshooting

**App won't start**
- Check `docker compose logs wadsmedia` for configuration errors
- Ensure `ADMIN_PHONE` is set (it's the only required variable beyond Twilio credentials)

**Messages aren't received**
- Verify your Twilio webhook URL points to `/webhook/twilio`
- Check that the URL is publicly accessible (use ngrok for local dev)
- Verify `TWILIO_AUTH_TOKEN` matches your Twilio account

**LLM doesn't respond**
- Check that `LLM_API_KEY` and `LLM_BASE_URL` are set
- Verify the model supports function/tool calling
- Check logs for API errors: `docker compose logs wadsmedia | grep LLM`

**Sonarr/Radarr not connecting**
- Verify the URL is reachable from WadsMedia's network (use Docker service names if on the same Compose network)
- Check API keys in Sonarr/Radarr under Settings > General
- The app logs connection status on startup -- check `docker compose logs wadsmedia`

**Notifications not arriving**
- Verify Sonarr/Radarr webhooks are configured and the test button succeeds
- Check the `?token=` parameter matches your `NOTIFICATION_SECRET`
- Ensure `TWILIO_PHONE_NUMBER` is set (notifications are disabled without it)

## License

MIT
