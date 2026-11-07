========>  https://gabrielvelasco.github.io/BET-Attack-Momentum/ <========

# Football Attack Momentum (from SofaScore)
Feel free to contribute to this project (fork/copy...). Any sugestion you can email me at 'themrgabriel100@gmail.com'.

A Web Site that gather all football live matches pressure graphs, live scoreboard and stats from SofaScore.

## preview
![Image Preview](https://raw.githubusercontent.com/GabrielVelasco/BET-Attack-Momentum/main/imgs/prev.png)

## "Architecture"
![Image Preview](https://raw.githubusercontent.com/GabrielVelasco/BET-Attack-Momentum/main/imgs/archi.png)

## Purpose
Help users to decide which match to watch / bet.
Help bettors to find a good match for goal/corners based on the pressure graphs and stats (SofaScore attack momentum graph).

## Frameworks/Programs/APIs used

| Name                                             | Usage                                                        |
| ------------------------------------------------ | ------------------------------------------------------------ |
| VS Code | IDE |
| Browser Fetch API | Requests to the Node proxy |
| SofaScore API via Node proxy | Live matches, statistics, and momentum samples |
| Native HTML/CSS graph | Green home-pressure bars above zero; blue away-pressure bars below zero |


## Project layout and data flow

- `index.html` and `styles/apps.css`: responsive match board and card styling.
- `scripts/app.js`: match cards, filters, dismissal, score refresh (30 seconds), statistics refresh (60 seconds), and visible-card momentum refresh (30 seconds and manual refresh).
- `scripts/momentumGraph.js`: horizontal momentum timeline, bar rendering, minute tooltips, team legend, and loading/unavailable/stale states.
- `scripts/apiConfig.js`: browser requests and proxy URL configuration. All SofaScore data requests go through this proxy.
- `scripts/dragAndDrop.js`: card reordering.
- `server.js`: Node HTTP proxy with an allowlist of upstream routes, CORS restrictions, and upstream timeouts.
- `scripts/startNgrokProxy.js`: optional tunnel helper. It starts the proxy, updates the deployed URL, commits it, and pushes to `main`.
- `render.yaml`: proxy deployment configuration. The static frontend can be hosted separately on GitHub Pages.

The proxy exposes `GET /api/live`, `GET /api/event/:id/statistics`, and `GET /api/event/:id/graph/momentum`. The momentum route forwards to `https://www.sofascore.com/api/v1/event/:id/graph/momentum`; IDs must be numeric. `GET /health` is local to the proxy.

Momentum uses at least 90 minute slices. Missing and future minutes remain blank, while each added-time sample (such as `45.01`, displayed as `45+1`) gets a separate slice. Extra-time points extend the timeline using `overtimeLength`. Both teams share the same vertical scale, based on the largest absolute sample in the response. The graph always shows the full match; ALL/1ST/2ND buttons select the statistics period. Matches without momentum data show an unavailable state and retry on refresh. Requests run with up to four concurrent momentum fetches.

## Local development

Use Node 22. Start the proxy on the port expected by the frontend:

```sh
PORT=3001 npm start
```

Serve the project directory in another terminal, for example with `python3 -m http.server 8080`, and open `http://localhost:8080`. For a deployed frontend, set `DEPLOYED_PROXY_BASE_URL` in `scripts/apiConfig.js` and deploy the updated proxy as well. Add any additional frontend origins to the proxy's comma-separated `ALLOWED_ORIGINS` environment variable.

Run `npm test` for proxy routing/CORS/error handling and momentum timeline tests.
