# MSF Leaderboard

The official leaderboard and tournament hub for **Minecraft Speedrun France (MSF)**.

Live website: [minecraftspeedrunfrance.fr](https://minecraftspeedrunfrance.fr)

## Overview

MSF Leaderboard brings together French-speaking Minecraft speedrunning rankings, tournament results and community prediction tools in one place.

### Main features

- **RSG leaderboard** - Any% random seed, glitchless rankings and run statistics
- **MCSR Ranked leaderboard** - season-based ranked standings
- **Draftout leaderboard** - Draftout rankings and statistics
- **MRM tournament pages** - group stages, final brackets, scores and podiums
- **MRM predictions** - community predictions and prediction leaderboards
- **Tournament archive** - results and information from previous MSF tournaments
- **Discord authentication** - sign in for prediction and administration features

## Tech stack

- React 19
- React Router 7
- Vite 7
- Vercel serverless functions
- Bootstrap 5
- Axios
- `@dnd-kit` for drag-and-drop tournament administration

## Getting started

### Requirements

- Node.js 20.19+ or 22.12+
- npm

### Installation

```bash
npm install
npm run dev
```

The development server starts the Vite frontend and the local API adapter together. Open the URL printed in the terminal, usually `http://localhost:5173`.

### Available scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the local development server |
| `npm run build` | Create a production build |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run ESLint across the project |

## Configuration

The API routes work locally through `vite-dev-api-plugin.js` and are deployed as Vercel serverless functions in production.

Set the following environment variables when using authentication, administration or a custom backend:

| Variable | Purpose |
| --- | --- |
| `DISCORD_CLIENT_ID` | Discord OAuth application client ID |
| `DISCORD_CLIENT_SECRET` | Discord OAuth application client secret |
| `DISCORD_REDIRECT_URI` | Discord OAuth callback URL |
| `AUTH_JWT_SECRET` | Secret used to sign authentication tokens |
| `DISCORD_ADMIN_IDS` | Comma-separated Discord IDs allowed to access admin actions |
| `BACKEND_API_BASE_URL` | Optional backend URL; defaults to `https://back.mcsr-game.com` |

Never commit secrets to the repository. Configure them through your local environment or your hosting provider's environment settings.

## Project structure

```text
api/       Vercel API routes for authentication, predictions and tournament data
lib/       Shared backend proxy, OAuth and authorization helpers
src/       React application, pages, components and styles
public/    Static assets
```

## Deployment

The project is configured for deployment on [Vercel](https://vercel.com/). Build the application with:

```bash
npm run build
```

Configure the environment variables above in the Vercel project settings before enabling production authentication or administrative features.

## Contributing

1. Install dependencies with `npm install`.
2. Create a focused branch for your change.
3. Run `npm run lint` and `npm run build` before opening a pull request.
4. Include a clear description of user-facing changes and any required configuration.