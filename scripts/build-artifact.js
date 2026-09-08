#!/usr/bin/env node
// Regenerates the Draft Night artifact HTML from the latest available season
// data. Data source: the community-maintained "Fantasy-Premier-League" GitHub
// mirror of the official FPL API (fantasy.premierleague.com isn't directly
// reachable from every environment, but GitHub is). See README.md.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { parseCsv } = require("./csv");
const { buildPlayerModel } = require("../server/scoring");

const MIRROR_URL = "https://github.com/vaastav/fantasy-premier-league";
const MIRROR_DIR = "/home/user/vaastav/fantasy-premier-league";
const TEMPLATE_PATH = path.join(__dirname, "..", "artifact", "template.html");
const OUT_PATH = path.join(__dirname, "..", "dist", "draft-night.html");

function sh(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: "utf8", ...opts });
}

function syncMirror() {
  if (fs.existsSync(path.join(MIRROR_DIR, ".git"))) {
    sh("git", ["-C", MIRROR_DIR, "fetch", "--depth", "1", "origin", "HEAD"]);
    sh("git", ["-C", MIRROR_DIR, "reset", "--hard", "FETCH_HEAD"]);
  } else {
    fs.mkdirSync(path.dirname(MIRROR_DIR), { recursive: true });
    sh("git", ["clone", "--depth", "1", MIRROR_URL, MIRROR_DIR], {
      env: { ...process.env, GIT_LFS_SKIP_SMUDGE: "1" },
    });
  }
}

function latestSeasonDir() {
  const dataDir = path.join(MIRROR_DIR, "data");
  const seasons = fs
    .readdirSync(dataDir)
    .filter((name) => /^\d{4}-\d{2}$/.test(name))
    .sort();
  const season = seasons[seasons.length - 1];
  return { season, dir: path.join(dataDir, season) };
}

function readCsv(dir, name) {
  return parseCsv(fs.readFileSync(path.join(dir, name), "utf8"));
}

const NUMERIC_FIELDS = [
  "id", "team", "element_type", "now_cost", "cost_change_event", "cost_change_start",
  "total_points", "minutes", "goals_scored", "assists", "clean_sheets", "goals_conceded",
  "saves", "bonus", "bps", "yellow_cards", "red_cards",
];

function buildModel(seasonDir) {
  const teams = readCsv(seasonDir, "teams.csv").map((t) => ({
    id: Number(t.id),
    name: t.name,
    short_name: t.short_name,
    code: Number(t.code),
  }));

  const elements = readCsv(seasonDir, "players_raw.csv").map((p) => {
    const el = { ...p };
    for (const f of NUMERIC_FIELDS) el[f] = Number(p[f] || 0);
    el.chance_of_playing_next_round =
      p.chance_of_playing_next_round === "" || p.chance_of_playing_next_round === "None"
        ? null
        : Number(p.chance_of_playing_next_round);
    el.news = p.news || "";
    return el;
  });

  const fixtures = readCsv(seasonDir, "fixtures.csv")
    .map((f) => ({
      event: f.event ? Number(f.event) : null,
      team_h: Number(f.team_h),
      team_a: Number(f.team_a),
      team_h_difficulty: Number(f.team_h_difficulty),
      team_a_difficulty: Number(f.team_a_difficulty),
      kickoff_time: f.kickoff_time,
      finished: f.finished === "True",
    }))
    .filter((f) => f.event !== null);

  const eventNumbers = [...new Set(fixtures.map((f) => f.event))].sort((a, b) => a - b);
  let nextEventId = null;
  for (const evt of eventNumbers) {
    const evtFixtures = fixtures.filter((f) => f.event === evt);
    if (!evtFixtures.every((f) => f.finished)) {
      nextEventId = evt;
      break;
    }
  }

  const events = eventNumbers.map((id) => ({
    id,
    name: `Gameweek ${id}`,
    finished: fixtures.filter((f) => f.event === id).every((f) => f.finished),
    is_current: false,
    is_next: id === nextEventId,
    deadline_time: fixtures.find((f) => f.event === id)?.kickoff_time || null,
  }));

  return buildPlayerModel({ bootstrap: { elements, teams, events }, fixtures });
}

function toEmbedPayload(model, dataAsOf) {
  const teams = model.teams.map((t) => ({ id: t.id, name: t.name, shortName: t.shortName }));
  const players = model.players.map((p) => ({
    id: p.id,
    n: p.webName,
    fn: p.fullName,
    pos: p.position,
    t: p.team ? p.team.id : null,
    price: p.priceMillions,
    trend: p.priceTrend,
    sel: p.selectedByPercent,
    pts: p.totalPoints,
    ppg: p.pointsPerGame,
    form: p.form,
    mins: p.minutes,
    g: p.goals,
    a: p.assists,
    cs: p.cleanSheets,
    gc: p.goalsConceded,
    sv: p.saves,
    bonus: p.bonus,
    ict: p.ictIndex,
    inf: p.influence,
    cre: p.creativity,
    thr: p.threat,
    yc: p.yellowCards,
    rc: p.redCards,
    ep: p.epNext,
    avail: p.availability,
    fix: p.nextFixture,
    score: p.attractivenessScore,
    brk: p.scoreBreakdown,
  }));
  return { generatedAt: new Date().toISOString(), dataAsOf, nextEvent: model.nextEvent, teams, players };
}

function main() {
  syncMirror();
  const { season, dir } = latestSeasonDir();
  const model = buildModel(dir);
  const dataAsOf = sh("git", ["-C", MIRROR_DIR, "log", "-1", "--format=%cs"]).trim();
  const payload = toEmbedPayload(model, dataAsOf);

  const template = fs.readFileSync(TEMPLATE_PATH, "utf8");
  const dataJson = JSON.stringify(payload).replace(/<\/script/g, "<\\/script");
  const html = template.replace("__DATA__", dataJson);

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, html);

  console.log(`Season: ${season}`);
  console.log(`Data as of: ${dataAsOf}`);
  console.log(`Next gameweek: ${model.nextEvent ? model.nextEvent.id : "none"}`);
  console.log(`Players: ${model.players.length}, Teams: ${model.teams.length}`);
  console.log(`Wrote: ${OUT_PATH} (${(fs.statSync(OUT_PATH).size / 1024).toFixed(0)} KB)`);
}

main();
