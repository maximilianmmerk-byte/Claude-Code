// Turns raw FPL bootstrap/fixtures data into a per-player "Attractiveness
// Score" (1-10) for the upcoming gameweek, plus the stats needed to explain it.

const POSITIONS = { 1: "GKP", 2: "DEF", 3: "MID", 4: "FWD" };

const WEIGHTS = {
  epNext: 0.35, // FPL's own expected-points-next-gameweek model
  form: 0.25, // recent scoring form
  fixture: 0.25, // how kind the next fixture is
  ppg: 0.15, // season-long consistency
};

function num(v, fallback = 0) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

function findNextEvent(events) {
  return (
    events.find((e) => e.is_next) ||
    events.find((e) => !e.finished && !e.is_current) ||
    events.find((e) => e.is_current) ||
    null
  );
}

/** Map teamId -> array of upcoming-fixture summaries for a given gameweek id. */
function buildFixtureMap(fixtures, eventId) {
  const map = new Map();
  if (!eventId) return map;

  for (const f of fixtures) {
    if (f.event !== eventId) continue;
    const homeEntry = {
      opponent: f.team_a,
      isHome: true,
      difficulty: f.team_h_difficulty,
      kickoff: f.kickoff_time,
    };
    const awayEntry = {
      opponent: f.team_h,
      isHome: false,
      difficulty: f.team_a_difficulty,
      kickoff: f.kickoff_time,
    };
    if (!map.has(f.team_h)) map.set(f.team_h, []);
    if (!map.has(f.team_a)) map.set(f.team_a, []);
    map.get(f.team_h).push(homeEntry);
    map.get(f.team_a).push(awayEntry);
  }
  return map;
}

/** Difficulty 1 (easiest) .. 5 (hardest) -> ease score 1 (best) .. 0.2 (worst). */
function difficultyToEase(difficulty) {
  const d = Number.isFinite(difficulty) ? difficulty : 3;
  return (6 - d) / 5;
}

function availabilityFactor(player) {
  const { status, chance_of_playing_next_round: chance } = player;
  if (chance === null || chance === undefined) {
    // No explicit doubt flagged by FPL.
    return status === "a" ? 1 : status === "d" ? 0.75 : 0;
  }
  return Math.max(0, Math.min(100, chance)) / 100;
}

function availabilityLabel(player, factor) {
  if (player.status === "i") return "Injured";
  if (player.status === "s") return "Suspended";
  if (player.status === "u") return "Unavailable";
  if (player.status === "n") return "Not in squad";
  if (factor >= 1) return "Available";
  if (factor > 0) return `Doubtful (${Math.round(factor * 100)}%)`;
  return "Unavailable";
}

/** Min-max normalize a list of numbers to 0..1. Flat/empty inputs -> 0.5. */
function normalize(values) {
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) return () => 0.5;
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  if (max - min < 1e-9) return () => 0.5;
  return (v) => (Number.isFinite(v) ? (v - min) / (max - min) : 0);
}

function crestUrl(team) {
  return `https://resources.premierleague.com/premierleague/badges/70/t${team.code}.png`;
}

function photoUrl(player) {
  const code = String(player.photo || "").replace(/\.jpg$/, "");
  return code
    ? `https://resources.premierleague.com/premierleague/photos/players/110x140/p${code}.png`
    : null;
}

function describeFixtures(fixtureEntries, teamsById) {
  if (!fixtureEntries || fixtureEntries.length === 0) {
    return { label: "No fixture (blank)", ease: 0, entries: [] };
  }
  const entries = fixtureEntries.map((f) => ({
    opponent: teamsById.get(f.opponent)?.short_name || "???",
    venue: f.isHome ? "H" : "A",
    difficulty: f.difficulty,
    kickoff: f.kickoff,
  }));
  const avgEase =
    fixtureEntries.reduce((sum, f) => sum + difficultyToEase(f.difficulty), 0) /
    fixtureEntries.length;
  const dgwBonus = entries.length > 1 ? 1.15 : 1;
  const label = entries
    .map((e) => `${e.opponent} (${e.venue})`)
    .join(" & ");
  return {
    label: entries.length > 1 ? `${label} — Double GW` : label,
    ease: Math.min(1, avgEase * dgwBonus),
    entries,
  };
}

/**
 * @param {{bootstrap: object, fixtures: object[]}} fplData
 * @returns {{ nextEvent: object|null, teams: object[], positions: object, players: object[] }}
 */
function buildPlayerModel({ bootstrap, fixtures }) {
  const { elements, teams, events } = bootstrap;
  const teamsById = new Map(teams.map((t) => [t.id, t]));
  const nextEvent = findNextEvent(events);
  const fixtureMap = buildFixtureMap(fixtures, nextEvent?.id);

  const raw = elements.map((el) => {
    const team = teamsById.get(el.team);
    const fixtureInfo = describeFixtures(fixtureMap.get(el.team), teamsById);
    const avail = availabilityFactor(el);
    return {
      el,
      team,
      fixtureInfo,
      avail,
      epNext: num(el.ep_next),
      form: num(el.form),
      ppg: num(el.points_per_game),
    };
  });

  // Normalize within each position so a 9/10 GK is judged against other GKs.
  const byPosition = new Map();
  for (const r of raw) {
    const pos = r.el.element_type;
    if (!byPosition.has(pos)) byPosition.set(pos, []);
    byPosition.get(pos).push(r);
  }

  const normalizers = new Map();
  for (const [pos, group] of byPosition) {
    normalizers.set(pos, {
      epNext: normalize(group.map((g) => g.epNext)),
      form: normalize(group.map((g) => g.form)),
      ppg: normalize(group.map((g) => g.ppg)),
    });
  }

  const players = raw.map((r) => {
    const n = normalizers.get(r.el.element_type);
    const nEpNext = n.epNext(r.epNext);
    const nForm = n.form(r.form);
    const nPpg = n.ppg(r.ppg);
    const nFixture = r.fixtureInfo.ease;

    const composite =
      WEIGHTS.epNext * nEpNext +
      WEIGHTS.form * nForm +
      WEIGHTS.fixture * nFixture +
      WEIGHTS.ppg * nPpg;

    const scoreBeforeAvailability = composite * 10;
    const score = Math.round(scoreBeforeAvailability * r.avail * 10) / 10;

    return {
      id: r.el.id,
      webName: r.el.web_name,
      fullName: `${r.el.first_name} ${r.el.second_name}`.trim(),
      position: POSITIONS[r.el.element_type] || "UNK",
      elementType: r.el.element_type,
      team: r.team
        ? { id: r.team.id, name: r.team.name, shortName: r.team.short_name, crest: crestUrl(r.team) }
        : null,
      photo: photoUrl(r.el),
      priceMillions: r.el.now_cost / 10,
      priceTrend: r.el.cost_change_event > 0 ? "rising" : r.el.cost_change_event < 0 ? "falling" : "stable",
      priceChangeEvent: r.el.cost_change_event / 10,
      priceChangeSeason: r.el.cost_change_start / 10,
      selectedByPercent: num(r.el.selected_by_percent),
      totalPoints: r.el.total_points,
      pointsPerGame: r.ppg,
      form: r.form,
      minutes: r.el.minutes,
      goals: r.el.goals_scored,
      assists: r.el.assists,
      cleanSheets: r.el.clean_sheets,
      goalsConceded: r.el.goals_conceded,
      saves: r.el.saves,
      bonus: r.el.bonus,
      bps: r.el.bps,
      ictIndex: num(r.el.ict_index),
      influence: num(r.el.influence),
      creativity: num(r.el.creativity),
      threat: num(r.el.threat),
      yellowCards: r.el.yellow_cards,
      redCards: r.el.red_cards,
      epNext: r.epNext,
      availability: {
        status: r.el.status,
        factor: r.avail,
        label: availabilityLabel(r.el, r.avail),
        news: r.el.news || null,
      },
      nextFixture: r.fixtureInfo,
      attractivenessScore: Math.max(0, Math.min(10, score)),
      scoreBreakdown: {
        expectedPoints: round1(nEpNext * 10),
        form: round1(nForm * 10),
        fixtureEase: round1(nFixture * 10),
        consistency: round1(nPpg * 10),
        availabilityFactor: round1(r.avail * 10),
      },
    };
  });

  players.sort((a, b) => b.attractivenessScore - a.attractivenessScore);

  return {
    nextEvent: nextEvent ? { id: nextEvent.id, name: nextEvent.name, deadline: nextEvent.deadline_time } : null,
    teams: teams.map((t) => ({ id: t.id, name: t.name, shortName: t.short_name, crest: crestUrl(t) })),
    positions: POSITIONS,
    players,
  };
}

function round1(v) {
  return Math.round(v * 10) / 10;
}

module.exports = { buildPlayerModel, POSITIONS, WEIGHTS };
