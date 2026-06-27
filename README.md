# CloudFFA Discord Bot

A professional, production-ready Discord bot built with **Node.js** and **discord.js v14**. Designed for large gaming communities (5,000+ members) with a modular, scalable architecture.

## Features

- **Ticket System** — Full ticket system with dropdowns, buttons, transcripts, claiming, and auto-close
- **Moderation** — Ban, kick, mute, timeout, warn, clear, lock, unlock, slowmode, purge, userinfo, serverinfo
- **Logging** — Message edits/deletes, member joins/leaves, nickname/role changes, voice events, channel creation/deletion
- **Auto-Moderation** — Anti-spam, anti-scam, anti-mass-mention, bad word filter, anti-invite, anti-raid
- **Welcome System** — Welcome/leave embeds, auto-role, account age detection, optional verification
- **Suggestions** — Submit, vote, staff approve/reject with logging
- **Polls** — Interactive button-based polls
- **Giveaways** — Timed giveaways with reroll support
- **Utility** — Ping, avatar, banner, embed, announce, say, serverstats, membercount
- **Database** — SQLite via `better-sqlite3` for persistent storage
- **Dashboard Ready** — Clean structure for adding a web dashboard

## Folder Structure

```
cloudffabot/
├── index.js                        # Entry point
├── package.json
├── .env.example                    # Environment variable template
├── .gitignore
├── README.md
├── src/
│   ├── config/
│   │   ├── client.js               # Centralised configuration from env
│   │   └── logger.js               # Winston logger setup
│   ├── database/
│   │   ├── database.js             # SQLite connection & table schemas
│   │   └── schema.js               # (reserved for future migrations)
│   ├── handlers/
│   │   ├── commandHandler.js       # Command loader & deployer
│   │   ├── eventHandler.js         # Event loader
│   │   └── deployCommands.js       # CLI script to register commands
│   ├── commands/
│   │   ├── moderation/
│   │   │   ├── ban.js
│   │   │   ├── kick.js
│   │   │   ├── mute.js
│   │   │   ├── timeout.js
│   │   │   ├── warn.js
│   │   │   ├── warnings.js
│   │   │   ├── clear.js
│   │   │   ├── lock.js
│   │   │   ├── unlock.js
│   │   │   ├── slowmode.js
│   │   │   ├── purge.js
│   │   │   ├── userinfo.js
│   │   │   ├── serverinfo.js
│   │   │   └── verify.js
│   │   ├── tickets/
│   │   │   └── panel.js
│   │   ├── suggestions/
│   │   │   └── suggest.js
│   │   ├── polls/
│   │   │   └── poll.js
│   │   ├── giveaways/
│   │   │   ├── giveaway.js
│   │   │   └── reroll.js
│   │   └── utility/
│   │       ├── ping.js
│   │       ├── avatar.js
│   │       ├── banner.js
│   │       ├── embed.js
│   │       ├── announce.js
│   │       ├── say.js
│   │       ├── serverstats.js
│   │       └── membercount.js
│   ├── events/
│   │   ├── ready.js
│   │   ├── interactionCreate.js
│   │   ├── messageCreate.js
│   │   ├── messageDelete.js
│   │   ├── messageUpdate.js
│   │   ├── guildMemberAdd.js
│   │   ├── guildMemberRemove.js
│   │   ├── guildMemberUpdate.js
│   │   ├── voiceStateUpdate.js
│   │   ├── channelCreate.js
│   │   └── channelDelete.js
│   ├── utils/
│   │   ├── embeds.js               # Embed builders
│   │   ├── permissions.js          # Permission/role checkers
│   │   ├── helpers.js              # Formatters & utilities
│   │   └── transcript.js           # HTML transcript generator
│   ├── moderation/
│   │   └── autoMod.js              # Auto-mod rules & mod action logger
│   ├── tickets/
│   │   └── ticketManager.js        # Ticket creation, buttons, modals
│   └── welcome/
│       └── welcome.js              # Join/leave handlers
└── logs/                           # (auto-created) Winston log files
└── transcripts/                    # (auto-created) HTML transcripts
```

## Installation

### Prerequisites

- **Node.js** v18 or higher
- **npm** (comes with Node.js)
- A **Discord Application** created at https://discord.com/developers/applications

### Step 1: Clone the Repository

```bash
git clone https://github.com/your-username/cloudffabot.git
cd cloudffabot
```

### Step 2: Install Dependencies

```bash
npm install
```

### Step 3: Configure Environment

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

Edit `.env` with your bot token, client ID, guild ID, channel IDs, and role IDs.

### Step 4: Register Slash Commands

```bash
npm run deploy
```

This registers all commands with Discord (guild-scoped if `GUILD_ID` is set, globally otherwise).

### Step 5: Start the Bot

```bash
npm start
```

For development with auto-restart:

```bash
npm run dev
```

## Environment Variables

| Variable | Description | Required |
|---|---|---|
| `TOKEN` | Discord bot token | ✅ |
| `CLIENT_ID` | Discord application client ID | ✅ |
| `GUILD_ID` | Discord server ID | ✅ |
| `TICKET_CATEGORY_ID` | Category for ticket channels | ✅ |
| `TICKET_STAFF_ROLE_ID` | Staff role that can see tickets | ✅ |
| `TICKET_LOG_CHANNEL_ID` | Channel for ticket logs | |
| `MOD_LOG_CHANNEL_ID` | Channel for moderation logs | |
| `MESSAGE_LOG_CHANNEL_ID` | Channel for message edit/delete logs | |
| `MEMBER_LOG_CHANNEL_ID` | Channel for member join/leave logs | |
| `VOICE_LOG_CHANNEL_ID` | Channel for voice event logs | |
| `CHANNEL_LOG_CHANNEL_ID` | Channel for channel create/delete logs | |
| `WELCOME_CHANNEL_ID` | Channel for welcome messages | |
| `LEAVE_CHANNEL_ID` | Channel for leave messages | |
| `AUTO_ROLE_ID` | Role assigned on join | |
| `VERIFIED_ROLE_ID` | Role assigned after verification | |
| `VERIFICATION_ENABLED` | Enable/disable verification (`true`/`false`) | |
| `SUGGESTION_CHANNEL_ID` | Channel for suggestions | |
| `SUGGESTION_STAFF_ROLE_ID` | Role that can approve/reject suggestions | |
| `MUTE_ROLE_ID` | Role assigned when muting | |
| `DATABASE_PATH` | Path to SQLite database file | |

## Database

The bot uses **SQLite** via `better-sqlite3`. The database file is created automatically at `./database.sqlite` (configurable via `DATABASE_PATH`).

### Tables

- `tickets` — Open/closed ticket records
- `warnings` — User warning history
- `moderation_actions` — All moderation action logs
- `suggestions` — Suggestion submissions
- `giveaways` — Giveaway records
- `polls` — Poll records
- `ticket_messages` — Ticket message/entry storage
- `auto_roles` — Auto-role assignments (for future dashboard use)
- `verification` — Verification codes

## Hosting

### Local Hosting (24/7)

Use **PM2** to keep the bot running:

```bash
npm install -g pm2
pm2 start index.js --name cloudffa-bot
pm2 save
pm2 startup
```

### Deploy to a VPS (e.g., DigitalOcean, Linode, AWS EC2)

1. Provision a Linux VPS (Ubuntu 22.04 recommended, minimum 1 GB RAM).
2. Install Node.js 18+:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt install -y nodejs git
   ```
3. Clone the repository and install dependencies:
   ```bash
   git clone https://github.com/your-username/cloudffabot.git
   cd cloudffabot
   npm install
   ```
4. Set up `.env` with your configuration.
5. Run with PM2 for persistence:
   ```bash
   npm install -g pm2
   pm2 start index.js --name cloudffa-bot
   pm2 save
   pm2 startup
   ```

### Deploy to Railway / Heroku / Fly.io

1. Push the repository to GitHub.
2. Connect your GitHub repo to the hosting platform.
3. Set all environment variables in the hosting dashboard.
4. The `npm start` script will be used automatically (set `start` as the command on most platforms).
5. For Railway, no additional config needed. For Heroku, use the `heroku/nodejs` buildpack.

### Deploy to Docker (Advanced)

Create a `Dockerfile`:

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
CMD ["npm", "start"]
```

Build and run:

```bash
docker build -t cloudffa-bot .
docker run -d --env-file .env --name cloudffa-bot cloudffa-bot
```

## Security

- Never commit your `.env` file (it's in `.gitignore`).
- Use the **minimum required permissions** for your bot in the Discord Developer Portal.
- Regularly rotate your bot token.
- Keep dependencies updated (`npm audit fix`).

## Adding a Web Dashboard

The project is structured for easy dashboard integration. Add a `dashboard/` folder at the root, and use the database (SQLite) to read/write configuration, ticket data, and moderation records. The `config/client.js` module reads from environment variables — you can extend it to read from the database for live config editing.

## Commands Overview

| Command | Description | Permissions |
|---|---|---|
| `/panel` | Send ticket panel | Administrator |
| `/ban` | Ban a user | Ban Members |
| `/kick` | Kick a user | Kick Members |
| `/mute` | Mute a user | Moderate Members |
| `/timeout` | Timeout a user | Moderate Members |
| `/warn` | Warn a user | Moderate Members |
| `/warnings` | View user warnings | Moderate Members |
| `/clear` | Clear messages | Manage Messages |
| `/purge` | Purge messages (by user) | Manage Messages |
| `/lock` | Lock channel | Manage Channels |
| `/unlock` | Unlock channel | Manage Channels |
| `/slowmode` | Set slowmode | Manage Channels |
| `/userinfo` | Get user info | Moderate Members |
| `/serverinfo` | Get server info | Moderate Members |
| `/verify` | Verify with code | None |
| `/suggest` | Submit suggestion | None |
| `/poll` | Create a poll | None |
| `/giveaway` | Start giveaway | Staff role |
| `/reroll` | Reroll giveaway | Staff role |
| `/ping` | Check latency | None |
| `/avatar` | Get avatar | None |
| `/banner` | Get banner | None |
| `/embed` | Send embed | Manage Messages |
| `/announce` | Send announcement | Manage Messages |
| `/say` | Say a message | Manage Messages |
| `/serverstats` | Server statistics | None |
| `/membercount` | Member count | None |

## License

MIT
