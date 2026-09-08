const test = require("node:test");
const assert = require("node:assert/strict");
const { buildPlayerModel } = require("../server/scoring");

function makeBootstrap() {
  const teams = [
    { id: 1, name: "Arsenal", short_name: "ARS", code: 3 },
    { id: 2, name: "Brentford", short_name: "BRE", code: 94 },
    { id: 3, name: "Chelsea", short_name: "CHE", code: 8 },
    { id: 4, name: "Derby (no fixture)", short_name: "DER", code: 999 },
  ];

  const events = [
    { id: 1, name: "Gameweek 1", finished: true, is_current: false, is_next: false, deadline_time: "2025-08-01T00:00:00Z" },
    { id: 2, name: "Gameweek 2", finished: false, is_current: false, is_next: true, deadline_time: "2025-08-08T00:00:00Z" },
  ];

  const elements = [
    {
      id: 101,
      first_name: "Star",
      second_name: "Striker",
      web_name: "Striker",
      team: 1,
      element_type: 4,
      now_cost: 120,
      cost_change_event: 1,
      cost_change_start: 3,
      total_points: 60,
      points_per_game: "6.0",
      form: "8.0",
      ep_next: "7.5",
      minutes: 900,
      goals_scored: 8,
      assists: 3,
      clean_sheets: 0,
      goals_conceded: 0,
      saves: 0,
      bonus: 10,
      bps: 300,
      ict_index: "150.0",
      influence: "100.0",
      creativity: "80.0",
      threat: "200.0",
      yellow_cards: 1,
      red_cards: 0,
      selected_by_percent: "45.0",
      status: "a",
      chance_of_playing_next_round: null,
      news: "",
      photo: "12345.jpg",
    },
    {
      id: 102,
      first_name: "Injured",
      second_name: "Winger",
      web_name: "Winger",
      team: 2,
      element_type: 3,
      now_cost: 80,
      cost_change_event: -1,
      cost_change_start: -2,
      total_points: 40,
      points_per_game: "4.0",
      form: "5.0",
      ep_next: "5.0",
      minutes: 700,
      goals_scored: 4,
      assists: 4,
      clean_sheets: 0,
      goals_conceded: 0,
      saves: 0,
      bonus: 5,
      bps: 200,
      ict_index: "100.0",
      influence: "60.0",
      creativity: "70.0",
      threat: "90.0",
      yellow_cards: 0,
      red_cards: 0,
      selected_by_percent: "20.0",
      status: "i",
      chance_of_playing_next_round: 0,
      news: "Hamstring injury - Expected back 01 Sep",
      photo: "22222.jpg",
    },
    {
      id: 103,
      first_name: "Bench",
      second_name: "Warmer",
      web_name: "Warmer",
      team: 3,
      element_type: 2,
      now_cost: 45,
      cost_change_event: 0,
      cost_change_start: 0,
      total_points: 5,
      points_per_game: "0.5",
      form: "0.2",
      ep_next: "0.5",
      minutes: 20,
      goals_scored: 0,
      assists: 0,
      clean_sheets: 0,
      goals_conceded: 5,
      saves: 0,
      bonus: 0,
      bps: 10,
      ict_index: "5.0",
      influence: "2.0",
      creativity: "1.0",
      threat: "2.0",
      yellow_cards: 0,
      red_cards: 0,
      selected_by_percent: "0.5",
      status: "a",
      chance_of_playing_next_round: null,
      news: "",
      photo: "33333.jpg",
    },
    {
      id: 104,
      first_name: "Blank",
      second_name: "GameweekPlayer",
      web_name: "NoFixture",
      team: 4,
      element_type: 4,
      now_cost: 55,
      cost_change_event: 0,
      cost_change_start: 0,
      total_points: 30,
      points_per_game: "3.0",
      form: "3.0",
      ep_next: "0.0",
      minutes: 500,
      goals_scored: 3,
      assists: 1,
      clean_sheets: 0,
      goals_conceded: 0,
      saves: 0,
      bonus: 2,
      bps: 100,
      ict_index: "50.0",
      influence: "20.0",
      creativity: "10.0",
      threat: "40.0",
      yellow_cards: 0,
      red_cards: 0,
      selected_by_percent: "3.0",
      status: "a",
      chance_of_playing_next_round: null,
      news: "",
      photo: "44444.jpg",
    },
  ];

  return { elements, teams, events };
}

function makeFixtures() {
  return [
    // GW2: Arsenal (easy, difficulty 2) vs Brentford (hard, difficulty 4)
    { event: 2, team_h: 1, team_a: 2, team_h_difficulty: 2, team_a_difficulty: 4, kickoff_time: "2025-08-09T14:00:00Z" },
    // Chelsea plays too (team 3), difficulty 3 both ways vs some other team not in our small teams list
    { event: 2, team_h: 3, team_a: 1, team_h_difficulty: 3, team_a_difficulty: 3, kickoff_time: "2025-08-10T14:00:00Z" },
    // team 4 (Derby) has no fixture in GW2 -> blank gameweek
  ];
}

test("ranks an in-form, easy-fixture striker above an injured player", () => {
  const model = buildPlayerModel({ bootstrap: makeBootstrap(), fixtures: makeFixtures() });
  const striker = model.players.find((p) => p.id === 101);
  const injured = model.players.find((p) => p.id === 102);

  assert.ok(striker.attractivenessScore > injured.attractivenessScore);
  assert.equal(injured.availability.label, "Injured");
  assert.equal(injured.attractivenessScore, 0, "unavailable player should score 0 regardless of underlying stats");
});

test("flags a team with no fixture in the next gameweek as blank", () => {
  const model = buildPlayerModel({ bootstrap: makeBootstrap(), fixtures: makeFixtures() });
  const blankPlayer = model.players.find((p) => p.id === 104);
  assert.equal(blankPlayer.nextFixture.label, "No fixture (blank)");
  assert.equal(blankPlayer.nextFixture.ease, 0);
});

test("score is bounded between 0 and 10 for all players", () => {
  const model = buildPlayerModel({ bootstrap: makeBootstrap(), fixtures: makeFixtures() });
  for (const p of model.players) {
    assert.ok(p.attractivenessScore >= 0 && p.attractivenessScore <= 10, `score out of range for ${p.webName}`);
  }
});

test("players are sorted descending by attractiveness score", () => {
  const model = buildPlayerModel({ bootstrap: makeBootstrap(), fixtures: makeFixtures() });
  for (let i = 1; i < model.players.length; i++) {
    assert.ok(model.players[i - 1].attractivenessScore >= model.players[i].attractivenessScore);
  }
});

test("exposes next gameweek metadata", () => {
  const model = buildPlayerModel({ bootstrap: makeBootstrap(), fixtures: makeFixtures() });
  assert.equal(model.nextEvent.id, 2);
  assert.equal(model.nextEvent.name, "Gameweek 2");
});
