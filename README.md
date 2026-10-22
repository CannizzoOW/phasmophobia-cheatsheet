# Phasmophobia Journal — Stream Deck bridge

Runs a local copy of [phasmophobia.vercel.app](https://phasmophobia.vercel.app) directly from the Stream Deck plugin.

- `streamdeck/` contains the plugin, local web server, and journal.
- `docs/` contains the standalone frontend deployed to GitHub Pages.
- `relay/` contains the secure WebSocket relay used by the hosted frontend and plugin.

Live frontend: https://cannizzo.online/phasmophobia-cheatsheet/

Deploy the relay: https://render.com/deploy?repo=https://github.com/CannizzoOW/phasmophobia-cheatsheet

No browser extension or separate server is required. See [INSTALL.md](INSTALL.md) for setup.
