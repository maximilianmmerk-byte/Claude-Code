# PL Fantasy Draft Picker

A small website for picking Fantasy Premier League Draft players. It lists
every player from all 20 Premier League teams, lets you filter/sort them,
and ranks each one with an **Attractiveness Score (1–10)** estimating how
likely they are to score you a lot of points in the *next* gameweek.

Data comes straight from the official, public Fantasy Premier League API
(no API key needed) — the same one the FPL app itself uses — so stats,
prices, injuries and fixtures stay current every time you refresh.

## How the Attractiveness Score works

For every player, the app pulls:

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

## Running it

```bash
npm install
npm start
```

Then open **http://localhost:3000**.

- Use the search box, team dropdown, and position tabs to filter.
- Use the sort dropdown to rank by score, form, expected points, goals, etc.
- Click a player card for full stats, injury news, next fixture, and the
  score breakdown.
- Click **"↻ Refresh data"** to force a fresh pull from the FPL API (data
  is otherwise cached in memory for 15 minutes).

## Project structure

```
server/
  index.js       Express app + REST API (/api/meta, /api/players, /api/players/:id)
  fplClient.js    Fetches & caches data from the official FPL API
  scoring.js      Turns raw FPL data into the attractiveness score
public/
  index.html, styles.css, app.js   The website itself
test/
  scoring.test.js   Unit tests for the scoring logic (npm test)
```

## Notes

- This uses `fantasy.premierleague.com`'s public endpoints, which require a
  normal internet connection but no login or API key.
- "Draft" leagues share the same player pool/stats as classic FPL; this
  tool doesn't need your specific draft league ID since it just ranks the
  whole player pool for you.
