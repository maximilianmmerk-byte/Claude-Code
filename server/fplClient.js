// Thin client for the public Fantasy Premier League API.
// No API key is required. The endpoints below are the same ones the
// official FPL web app itself calls.
const BOOTSTRAP_URL = "https://fantasy.premierleague.com/api/bootstrap-static/";
const FIXTURES_URL = "https://fantasy.premierleague.com/api/fixtures/?future=1";

const CACHE_TTL_MS = 15 * 60 * 1000; // FPL data changes slowly; refresh every 15 min.

let cache = { data: null, fetchedAt: 0 };
let inFlight = null;

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      // FPL's edge occasionally rejects requests with no User-Agent.
      "User-Agent": "Mozilla/5.0 (compatible; PLDraftPicker/1.0)",
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`FPL API request failed (${res.status}) for ${url}`);
  }
  return res.json();
}

/**
 * Returns { bootstrap, fixtures }, cached in memory for CACHE_TTL_MS.
 * Concurrent callers during a refresh share the same in-flight request.
 */
async function getFplData({ force = false } = {}) {
  const now = Date.now();
  if (!force && cache.data && now - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.data;
  }
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const [bootstrap, fixtures] = await Promise.all([
        fetchJson(BOOTSTRAP_URL),
        fetchJson(FIXTURES_URL),
      ]);
      cache = { data: { bootstrap, fixtures }, fetchedAt: Date.now() };
      return cache.data;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

function getCacheAge() {
  return cache.fetchedAt ? Date.now() - cache.fetchedAt : null;
}

module.exports = { getFplData, getCacheAge };
