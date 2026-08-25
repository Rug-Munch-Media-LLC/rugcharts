# RugCharts — FAQ

**What is RugCharts?** Server-side chart generation for crypto tokens with a React UI and Telegram delivery bot.

**Which data providers?** Pluggable DataBus feeds (prices, liquidity). Free-tier providers work out of the box; add keys via environment for premium sources.

**How does the Telegram bot work?** Set the bot token env var, run the backend — `/chart <token>` renders server-side and ships the image in-chat.

**Can I add chart types?** Yes — extend `backend/app/chart_generator.py`, register the renderer, add tests.

**Image storage?** Generated charts are ephemeral by default; configure object storage via env for persistence.
