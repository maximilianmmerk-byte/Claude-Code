const state = {
  team: "",
  position: "",
  search: "",
  sortBy: "attractivenessScore",
};

const grid = document.getElementById("player-grid");
const statusLine = document.getElementById("status-line");
const gameweekLabel = document.getElementById("gameweek-label");
const teamFilter = document.getElementById("team-filter");
const searchInput = document.getElementById("search-input");
const sortSelect = document.getElementById("sort-select");
const positionTabs = document.getElementById("position-tabs");
const refreshBtn = document.getElementById("refresh-btn");
const modalBackdrop = document.getElementById("modal-backdrop");
const modalBody = document.getElementById("modal-body");
const modalClose = document.getElementById("modal-close");

let debounceTimer = null;

function scoreColor(score) {
  if (score >= 8) return "#0a9d4c";
  if (score >= 6) return "#3fae2a";
  if (score >= 4) return "#f4a300";
  if (score >= 2) return "#e07b00";
  return "#e63946";
}

function availabilityClass(factor) {
  if (factor >= 1) return "avail-ok";
  if (factor > 0.3) return "avail-warn";
  return "avail-bad";
}

async function loadMeta() {
  const res = await fetch("/api/meta");
  const meta = await res.json();
  if (meta.nextEvent) {
    gameweekLabel.textContent = `Ranking for ${meta.nextEvent.name}`;
  } else {
    gameweekLabel.textContent = "Season complete — no upcoming gameweek";
  }
  teamFilter.innerHTML =
    '<option value="">All teams</option>' +
    meta.teams
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((t) => `<option value="${t.id}">${t.name}</option>`)
      .join("");
}

function buildQuery() {
  const params = new URLSearchParams();
  if (state.team) params.set("team", state.team);
  if (state.position) params.set("position", state.position);
  if (state.search) params.set("search", state.search);
  params.set("sortBy", state.sortBy);
  return params.toString();
}

async function loadPlayers(force = false) {
  statusLine.textContent = "Loading players…";
  try {
    const query = buildQuery() + (force ? "&refresh=1" : "");
    const res = await fetch(`/api/players?${query}`);
    if (!res.ok) throw new Error((await res.json()).error || "Request failed");
    const data = await res.json();
    renderGrid(data.players);
    statusLine.textContent = `${data.count} player${data.count === 1 ? "" : "s"} found`;
  } catch (err) {
    statusLine.textContent = `Error: ${err.message}`;
    grid.innerHTML = `<p class="empty-state">Could not load Fantasy Premier League data. ${err.message}</p>`;
  }
}

function renderGrid(players) {
  if (players.length === 0) {
    grid.innerHTML = '<p class="empty-state">No players match those filters.</p>';
    return;
  }
  grid.innerHTML = players.map(playerCardHtml).join("");
  grid.querySelectorAll("[data-player-id]").forEach((card) => {
    card.addEventListener("click", () => openPlayerModal(card.dataset.playerId));
  });
}

function playerCardHtml(p) {
  const crest = p.team ? `<img class="crest" src="${p.team.crest}" alt="${p.team.shortName}" />` : "";
  const availClass = availabilityClass(p.availability.factor);
  return `
    <article class="player-card" data-player-id="${p.id}">
      <div class="score-badge" style="background:${scoreColor(p.attractivenessScore)}">${p.attractivenessScore.toFixed(1)}</div>
      <div class="card-top">
        ${crest}
        <div>
          <p class="player-name">${p.webName}</p>
          <p class="player-meta">${p.position} · ${p.team ? p.team.shortName : "?"} · £${p.priceMillions.toFixed(1)}m</p>
        </div>
      </div>
      <div class="stat-row"><span>Form</span><strong>${p.form.toFixed(1)}</strong></div>
      <div class="stat-row"><span>Total pts</span><strong>${p.totalPoints}</strong></div>
      <div class="stat-row"><span>Exp. pts next GW</span><strong>${p.epNext.toFixed(1)}</strong></div>
      <span class="fixture-chip">${p.nextFixture.label}</span><br/>
      <span class="availability-flag ${availClass}">${p.availability.label}</span>
    </article>
  `;
}

async function openPlayerModal(id) {
  modalBackdrop.hidden = false;
  modalBody.innerHTML = "<p>Loading…</p>";
  try {
    const res = await fetch(`/api/players/${id}`);
    const p = await res.json();
    modalBody.innerHTML = playerModalHtml(p);
  } catch (err) {
    modalBody.innerHTML = `<p>Could not load player details.</p>`;
  }
}

function breakdownRow(label, value) {
  const pct = Math.max(0, Math.min(100, value * 10));
  return `
    <div class="breakdown-bar-row">
      <span class="breakdown-label">${label}</span>
      <div class="breakdown-track"><div class="breakdown-fill" style="width:${pct}%"></div></div>
      <span class="breakdown-value">${value.toFixed(1)}</span>
    </div>
  `;
}

function playerModalHtml(p) {
  const b = p.scoreBreakdown;
  const photo = p.photo
    ? `<img class="modal-photo" src="${p.photo}" alt="${p.webName}" onerror="this.style.display='none'" />`
    : "";
  const news = p.availability.news
    ? `<div class="news-box">⚠ ${p.availability.news}</div>`
    : "";
  const goalStatBoxes =
    p.position === "GKP"
      ? [
          ["Saves", p.saves],
          ["Clean sheets", p.cleanSheets],
          ["Goals conceded", p.goalsConceded],
        ]
      : p.position === "DEF"
      ? [
          ["Goals", p.goals],
          ["Assists", p.assists],
          ["Clean sheets", p.cleanSheets],
        ]
      : [
          ["Goals", p.goals],
          ["Assists", p.assists],
          ["Bonus", p.bonus],
        ];

  return `
    <div class="modal-header">
      ${photo}
      <div>
        <h2 id="modal-name">${p.fullName}</h2>
        <p class="player-meta">${p.position} · ${p.team ? p.team.name : "?"} · £${p.priceMillions.toFixed(1)}m
          (${p.priceTrend})</p>
        <p class="availability-flag ${availabilityClass(p.availability.factor)}">${p.availability.label}</p>
      </div>
    </div>
    ${news}

    <p class="section-title">Attractiveness score: ${p.attractivenessScore.toFixed(1)} / 10</p>
    ${breakdownRow("Expected points", b.expectedPoints)}
    ${breakdownRow("Form", b.form)}
    ${breakdownRow("Fixture ease", b.fixtureEase)}
    ${breakdownRow("Consistency (PPG)", b.consistency)}
    ${breakdownRow("Availability", b.availabilityFactor)}

    <p class="section-title">Next fixture</p>
    <p>${p.nextFixture.label}</p>

    <p class="section-title">Key stats this season</p>
    <div class="stats-grid">
      <div class="stat-box"><div class="value">${p.totalPoints}</div><div class="label">Total points</div></div>
      <div class="stat-box"><div class="value">${p.form.toFixed(1)}</div><div class="label">Form</div></div>
      <div class="stat-box"><div class="value">${p.pointsPerGame.toFixed(1)}</div><div class="label">Pts / game</div></div>
      ${goalStatBoxes
        .map(([label, value]) => `<div class="stat-box"><div class="value">${value}</div><div class="label">${label}</div></div>`)
        .join("")}
      <div class="stat-box"><div class="value">${p.minutes}</div><div class="label">Minutes</div></div>
      <div class="stat-box"><div class="value">${p.selectedByPercent.toFixed(1)}%</div><div class="label">Selected by</div></div>
    </div>

    <p class="section-title">Underlying (ICT index)</p>
    <div class="stats-grid">
      <div class="stat-box"><div class="value">${p.influence.toFixed(0)}</div><div class="label">Influence</div></div>
      <div class="stat-box"><div class="value">${p.creativity.toFixed(0)}</div><div class="label">Creativity</div></div>
      <div class="stat-box"><div class="value">${p.threat.toFixed(0)}</div><div class="label">Threat</div></div>
    </div>
  `;
}

function debounce(fn, delay) {
  return (...args) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => fn(...args), delay);
  };
}

teamFilter.addEventListener("change", () => {
  state.team = teamFilter.value;
  loadPlayers();
});

searchInput.addEventListener(
  "input",
  debounce(() => {
    state.search = searchInput.value.trim();
    loadPlayers();
  }, 300)
);

sortSelect.addEventListener("change", () => {
  state.sortBy = sortSelect.value;
  loadPlayers();
});

positionTabs.addEventListener("click", (e) => {
  const btn = e.target.closest(".tab");
  if (!btn) return;
  positionTabs.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
  btn.classList.add("active");
  state.position = btn.dataset.position;
  loadPlayers();
});

refreshBtn.addEventListener("click", () => loadPlayers(true));

modalClose.addEventListener("click", () => (modalBackdrop.hidden = true));
modalBackdrop.addEventListener("click", (e) => {
  if (e.target === modalBackdrop) modalBackdrop.hidden = true;
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") modalBackdrop.hidden = true;
});

(async function init() {
  await loadMeta();
  await loadPlayers();
})();
