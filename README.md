# PL Fantasy Draft Picker

A website for picking Fantasy Premier League Draft players. It lists every
player from all 20 Premier League teams, lets you filter/sort them, and ranks
each one with an **Attractiveness Score (1–10)** estimating how likely they
are to score you a lot of points in the *next* gameweek.

There are two ways to use it, in this repo:

1. **Draft Night** — a published, shareable website (an "Artifact") with a
   real link you and your friends can open on any phone, no install needed.
   This is the one to share. See `artifact/`.
2. **Local app** — a Node/Express server you run yourself, pulling data live
   from the official FPL API. Good if you want always-current official data
   and don't mind running it locally. See `server/` + `public/`.

Both share the same scoring engine (`server/scoring.js`).

## How the Attractiveness Score works

For every player:

- **Expected points next GW** (`ep_next`) — FPL's own predictive model
- **Form** — recent scoring form
- **Fixture ease** — how easy/hard the next opponent is (FPL's Fixture
  Difficulty Rating), including a bonus for double gameweeks and a
  "blank gameweek" flag when a team has no fixture
- **Points per game** — season-long consistency
- **Availability** — injuries/suspensions/doubts (`status`,
  `chance_of_playing_next_round`)

Each of the first four is normalized against other players in the *same
position* (so a 9/10 defender is genuinely one of the best defensive picks,
not just being compared to strikers), combined into a weighted composite,
then scaled to 1–10 and multiplied by the availability factor — so an
injured or suspended player always drops toward 0, no matter how good their
underlying stats are. Click any player card to see the full breakdown.

Price/market value is shown for reference (drafts have no budget, so it
isn't a scoring input).

## Option 1: Draft Night (shareable link)

`artifact/template.html` is a self-contained website with the player data
baked directly into the page (no login, no server, works for anyone with the
link). `scripts/build-artifact.js` regenerates that data:

```bash
node scripts/build-artifact.js
```

This pulls the latest season snapshot from a public GitHub mirror of FPL's
data (`vaastav/fantasy-premier-league` — the official API itself isn't
reachable from every environment, but GitHub is), runs it through the same
scoring engine, and writes `dist/draft-night.html`. That file gets published
as a Claude Artifact and re-published on the same URL whenever the data is
refreshed, so the link you shared with friends never changes.

Because the page bakes its data in at build time rather than fetching it
live in-browser, it's only as fresh as the last time someone ran the build +
republish step. Ask whoever's maintaining it (or the Claude session that set
it up) how often that happens, or to run it again before your next draft.

## Option 2: Local app (always-live official data)

```bash
npm install
npm start
```

Then open **http://localhost:3000**. This talks directly to
`fantasy.premierleague.com` every time you refresh, so it's always current,
but it only runs on whatever machine you start it on — not a link you can
send friends.

- Use the search box, team dropdown, and position tabs to filter.
- Use the sort dropdown to rank by score, form, expected points, goals, etc.
- Click a player card for full stats, injury news, next fixture, and the
  score breakdown.
- Click **"↻ Refresh data"** to force a fresh pull from the FPL API (data
  is otherwise cached in memory for 15 minutes).

## Project structure

```
server/
  index.js        Express app + REST API (/api/meta, /api/players, /api/players/:id)
  fplClient.js    Fetches & caches data from the official FPL API (used by the local app)
  scoring.js      Turns raw FPL/mirror data into the attractiveness score (shared)
public/
  index.html, styles.css, app.js   The local-app website
artifact/
  template.html   Draft Night page shell (data gets injected at build time)
scripts/
  build-artifact.js   Pulls the GitHub mirror data and regenerates dist/draft-night.html
  csv.js              Small CSV parser used by build-artifact.js
test/
  scoring.test.js   Unit tests for the scoring logic (npm test)
```

## Notes

- "Draft" leagues share the same player pool/stats as classic FPL; this
  tool doesn't need your specific draft league ID since it just ranks the
  whole player pool for you.
- The local app needs outbound network access to `fantasy.premierleague.com`
  (no login or API key). Some sandboxed environments block that domain by
  policy — if `npm start` can't reach it, that's a network policy issue in
  that environment, not a bug in the code.
