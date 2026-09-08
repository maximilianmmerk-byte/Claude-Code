const path = require("path");
const express = require("express");
const { getFplData, getCacheAge } = require("./fplClient");
const { buildPlayerModel } = require("./scoring");

const PORT = process.env.PORT || 3000;
const app = express();

app.use(express.static(path.join(__dirname, "..", "public")));

let modelCache = null;
let modelCacheAge = -1;

async function getModel(force) {
  const data = await getFplData({ force });
  const age = getCacheAge();
  if (!modelCache || age !== modelCacheAge) {
    modelCache = buildPlayerModel(data);
    modelCacheAge = age;
  }
  return modelCache;
}

app.get("/api/meta", async (req, res, next) => {
  try {
    const { nextEvent, teams, positions } = await getModel(false);
    res.json({ nextEvent, teams, positions });
  } catch (err) {
    next(err);
  }
});

app.get("/api/players", async (req, res, next) => {
  try {
    const force = req.query.refresh === "1";
    const { players } = await getModel(force);
    const { team, position, search, sortBy = "attractivenessScore", order = "desc" } = req.query;

    let result = players;
    if (team) {
      const teamId = Number(team);
      result = result.filter((p) => p.team && p.team.id === teamId);
    }
    if (position) {
      result = result.filter((p) => p.position === String(position).toUpperCase());
    }
    if (search) {
      const q = String(search).toLowerCase();
      result = result.filter(
        (p) => p.webName.toLowerCase().includes(q) || p.fullName.toLowerCase().includes(q)
      );
    }

    const sortableFields = new Set([
      "attractivenessScore",
      "form",
      "totalPoints",
      "priceMillions",
      "goals",
      "assists",
      "epNext",
      "selectedByPercent",
    ]);
    const field = sortableFields.has(sortBy) ? sortBy : "attractivenessScore";
    const dir = order === "asc" ? 1 : -1;
    result = [...result].sort((a, b) => (a[field] - b[field]) * dir);

    res.json({ count: result.length, players: result });
  } catch (err) {
    next(err);
  }
});

app.get("/api/players/:id", async (req, res, next) => {
  try {
    const { players } = await getModel(false);
    const player = players.find((p) => p.id === Number(req.params.id));
    if (!player) return res.status(404).json({ error: "Player not found" });
    res.json(player);
  } catch (err) {
    next(err);
  }
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(502).json({ error: "Failed to load Fantasy Premier League data", detail: err.message });
});

app.listen(PORT, () => {
  console.log(`PL Fantasy Draft Picker running at http://localhost:${PORT}`);
});
