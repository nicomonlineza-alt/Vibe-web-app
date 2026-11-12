// ---- Central app window -------------------------------------------------
const overlay = document.getElementById('app-overlay');
const content = document.getElementById('app-content');
const closeBtn = document.getElementById('app-close');

const apps = {
  'stock-joe': renderStockMarketJoe
};

document.querySelectorAll('.feature-tile[data-app]').forEach(function (tile) {
  tile.addEventListener('click', function () {
    openApp(tile.dataset.app);
  });
});

function openApp(name) {
  if (!apps[name]) return;
  content.innerHTML = '';
  apps[name](content);
  overlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeApp() {
  overlay.classList.add('hidden');
  content.innerHTML = '';
  document.body.style.overflow = '';
}

closeBtn.addEventListener('click', closeApp);
overlay.addEventListener('click', function (e) {
  if (e.target === overlay) closeApp();
});
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape' && !overlay.classList.contains('hidden')) closeApp();
});

// Clean-up registry so timers stop when the app window closes
const appCleanups = [];
function registerCleanup(fn) { appCleanups.push(fn); }
closeBtn.addEventListener('click', function () {
  while (appCleanups.length) { try { appCleanups.pop()(); } catch (e) {} }
});

// ---- Learning module -----------------------------------------------------
// Stores completed paper trades in localStorage, extracts pattern features at
// close, and scores new candidates by similarity to past winners vs losers.

const MEMORY_KEY = 'nicom-ai-joe-memory-v1';
const MEMORY_LIMIT = 300;

function loadMemory() {
  try { return JSON.parse(localStorage.getItem(MEMORY_KEY)) || []; }
  catch (e) { return []; }
}
function saveMemory(memory) {
  try { localStorage.setItem(MEMORY_KEY, JSON.stringify(memory.slice(-MEMORY_LIMIT))); } catch (e) {}
}

// Pre-trade features (known at selection time).
// mom: 24h momentum %, range: 24h volatility proxy % (high-low span), vol: quote volume rank proxy.
function candidateFeatures(t) {
  return [t.momentum, t.range, t.volScore];
}

function featureDistance(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) * (a[i] - b[i]);
  return Math.sqrt(sum);
}

function normaliseFeatures(vecs) {
  const dims = vecs[0] ? vecs[0].length : 0;
  const means = [], stds = [];
  for (let d = 0; d < dims; d++) {
    const col = vecs.map(function (v) { return v[d]; });
    const mean = col.reduce(function (s, x) { return s + x; }, 0) / col.length;
    const variance = col.reduce(function (s, x) { return s + (x - mean) * (x - mean); }, 0) / col.length;
    means.push(mean); stds.push(Math.sqrt(variance) || 1);
  }
  return vecs.map(function (v) { return v.map(function (x, d) { return (x - means[d]) / stds[d]; }); });
}

// Score a candidate: + similarity to winners, - similarity to losers.
function patternScore(candFeaturesArr, memory) {
  const past = memory.map(function (m) { return candidateFeatures(m); });
  const all = past.concat([candFeaturesArr]);
  const norm = normaliseFeatures(all);
  const cand = norm[norm.length - 1];
  let winnerScore = 0, loserScore = 0, w = 0, l = 0;
  memory.forEach(function (m, i) {
    const sim = 1 / (1 + featureDistance(cand, norm[i]));
    if (m.pnl > 0) { winnerScore += sim * m.pnl; w++; }
    else { loserScore += sim * Math.abs(m.pnl); l++; }
  });
  return { score: winnerScore - loserScore, w: w, l: l };
}

// Post-trade analysis at close: extract the pattern the trade exhibited.
function analyseTrade(t) {
  const samples = t.samples || [];
  const n = samples.length;
  let maxUp = 0, maxDown = 0;
  samples.forEach(function (p) {
    const move = (p - t.entryPrice) / t.entryPrice * (t.direction === 'LONG' ? 1 : -1);
    if (move > maxUp) maxUp = move;
    if (move < maxDown) maxDown = move;
  });
  // Early trend: slope over the first third of the samples.
  let earlySlope = 0;
  if (n >= 6) {
    const k = Math.max(2, Math.floor(n / 3));
    earlySlope = (samples[k] - samples[0]) / samples[0];
  }
  // Volatility of the sampled path.
  let vol = 0;
  if (n >= 3) {
    for (let i = 1; i < n; i++) vol += Math.abs(samples[i] - samples[i - 1]) / samples[i - 1];
    vol = vol / (n - 1);
  }
  return {
    symbol: t.symbol,
    direction: t.direction,
    momentum: t.entryMomentum,
    range: t.entryRange,
    volScore: t.entryVolScore,
    earlySlope: earlySlope,
    pathVol: vol,
    maxUp: maxUp,
    maxDown: maxDown,
    pnl: t.pnl,
    heldMs: t.expiresAt - t.entryTime,
    closedAt: Date.now()
  };
}

// ---- Feature: Stock Market Joe ------------------------------------------
// Live data: Binance public REST API (no key required).
// Session: 5 paper trades, each held 5-10 minutes, forced close at 10 minutes.
// Learning: completed trades are analysed and stored; future selections are
// scored against recognised winning and losing patterns.

const BINANCE_BASE = 'https://api.binance.com';
const SESSION_MS = 10 * 60 * 1000;
const POLL_MS = 5000;

function renderStockMarketJoe(root) {
  root.innerHTML =
    '<h2>Stock Market Joe</h2>' +
    '<p class="subtitle">Live crypto market data (Binance). Paper trades only: no real money.</p>' +
    '<div class="joe-session" id="joe-session">' +
    '  <div class="joe-status" id="joe-status">Scanning the market and matching learned patterns...</div>' +
    '  <div class="joe-clock" id="joe-clock"></div>' +
    '  <div class="stocks" id="joe-stocks"></div>' +
    '  <div class="joe-summary" id="joe-summary"></div>' +
    '  <div class="joe-insights" id="joe-insights"></div>' +
    '</div>';

  const statusEl = root.querySelector('#joe-status');
  const clockEl = root.querySelector('#joe-clock');
  const grid = root.querySelector('#joe-stocks');
  const summaryEl = root.querySelector('#joe-summary');
  const insightsEl = root.querySelector('#joe-insights');

  const memory = loadMemory();
  let sessionStart = null;
  let trades = [];

  function fmt(n) { return '$' + n.toFixed(n < 1 ? 6 : 2); }
  function pnlClass(v) { return v >= 0 ? 'up' : 'down'; }
  function formatLeft(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    const m = Math.floor(s / 60);
    return (m > 0 ? m + 'm ' : '') + (s % 60) + 's left';
  }
  function remainingMs() { return Math.max(0, SESSION_MS - (Date.now() - sessionStart)); }

  function renderInsights() {
    if (!memory.length) {
      insightsEl.innerHTML = '<p class="joe-note">Joe has no learned patterns yet. Insights appear after the first sessions.</p>';
      return;
    }
    const wins = memory.filter(function (m) { return m.pnl > 0; });
    const losses = memory.filter(function (m) { return m.pnl <= 0; });
    const avgWin = wins.length ? wins.reduce(function (s, m) { return s + m.pnl; }, 0) / wins.length : 0;
    const avgLoss = losses.length ? losses.reduce(function (s, m) { return s + m.pnl; }, 0) / losses.length : 0;
    const winRate = (wins.length / memory.length * 100).toFixed(0);

    function describe(list, label) {
      if (!list.length) return '';
      const avgMom = list.reduce(function (s, m) { return s + m.momentum; }, 0) / list.length;
      const bestDir = list.filter(function (m) { return m.direction === 'LONG'; }).length >= list.length / 2 ? 'LONG' : 'SHORT';
      const early = list.reduce(function (s, m) { return s + m.earlySlope; }, 0) / list.length;
      return '<li>' + label + ': typical momentum ' + avgMom.toFixed(2) + '%, favoured ' + bestDir +
        ', early trend ' + (early >= 0 ? 'up' : 'down') + ' (' + (early * 100).toFixed(2) + '%)</li>';
    }

    insightsEl.innerHTML =
      '<h3>Joe\'s learned insights</h3>' +
      '<p class="joe-note">Based on ' + memory.length + ' completed paper trades: ' + winRate +
      '% win rate, average win +' + (avgWin * 100).toFixed(2) + '%, average loss ' + (avgLoss * 100).toFixed(2) + '%.</p>' +
      '<ul class="joe-list">' +
      describe(wins, 'Profitable patterns') +
      describe(losses, 'Patterns to avoid') +
      '</ul>' +
      '<p class="joe-note">Selection now favours candidates resembling past winners and skips those resembling past losers.</p>';
  }

  async function pickTrades() {
    const res = await fetch(BINANCE_BASE + '/api/v3/ticker/24hr');
    if (!res.ok) throw new Error('Market data unavailable (HTTP ' + res.status + ')');
    const tickers = await res.json();
    const candidates = tickers
      .filter(function (t) {
        return /USDT$/.test(t.symbol) &&
          !/(UP|DOWN|BULL|BEAR)USDT$/.test(t.symbol) &&
          parseFloat(t.quoteVolume) > 50000000 &&
          parseFloat(t.lastPrice) > 0;
      })
      .map(function (t) {
        const high = parseFloat(t.highPrice), low = parseFloat(t.lowPrice);
        const mom = parseFloat(t.priceChangePercent);
        const qv = parseFloat(t.quoteVolume);
        return {
          symbol: t.symbol,
          momentum: mom,
          range: high > 0 ? (high - low) / low * 100 : 0,
          volScore: Math.log10(qv || 1),
          lastPrice: parseFloat(t.lastPrice)
        };
      })
      .sort(function (a, b) { return Math.abs(b.momentum) - Math.abs(a.momentum); })
      .slice(0, 15);

    // Pattern-aware selection: score each candidate against learned history,
    // skip clear loser-lookalikes, take the best 5 remaining.
    const scored = candidates.map(function (c) {
      const ps = patternScore(candidateFeatures(c), memory);
      return Object.assign({ patternScore: ps.score, skipped: false }, c);
    });
    const avoided = [];
    let chosen = [];
    for (let i = 0; i < scored.length && chosen.length < 5; i++) {
      const c = scored[i];
      if (memory.length >= 10 && c.patternScore < 0) { c.skipped = true; avoided.push(c.symbol); continue; }
      chosen.push(c);
    }
    // Fall back to skipped candidates if fewer than 5 remain.
    for (let i = 0; i < scored.length && chosen.length < 5; i++) {
      if (!scored[i].skipped && chosen.indexOf(scored[i]) === -1) chosen.push(scored[i]);
    }

    if (avoided.length) {
      statusEl.textContent = 'Pattern filter avoided: ' + avoided.slice(0, 4).join(', ') + (avoided.length > 4 ? '...' : '');
    }

    return chosen.map(function (c) {
      const durationMs = (5 + Math.random() * 5) * 60 * 1000;
      return {
        symbol: c.symbol,
        direction: c.momentum >= 0 ? 'LONG' : 'SHORT',
        entryPrice: c.lastPrice,
        entryTime: Date.now(),
        entryMomentum: c.momentum,
        entryRange: c.range,
        entryVolScore: c.volScore,
        patternScore: c.patternScore,
        durationMs: durationMs,
        expiresAt: Date.now() + durationMs,
        lastPrice: c.lastPrice,
        samples: [c.lastPrice],
        closed: false,
        exitPrice: null,
        pnl: null
      };
    });
  }

  function tradePnl(t) {
    const move = (t.lastPrice - t.entryPrice) / t.entryPrice;
    return move * (t.direction === 'LONG' ? 1 : -1);
  }

  function render() {
    grid.innerHTML = '';
    trades.forEach(function (t) {
      const pnl = t.closed ? t.pnl : tradePnl(t);
      const pct = (pnl * 100).toFixed(2);
      const left = t.closed ? 'Closed' : formatLeft(t.expiresAt - Date.now());
      const learned = memory.length >= 10
        ? '<div class="joe-meta">Pattern match: ' + (t.patternScore >= 0 ? '+' : '') + t.patternScore.toFixed(2) + '</div>'
        : '';
      const card = document.createElement('div');
      card.className = 'stock-card';
      card.innerHTML =
        '<div class="sym">' + t.symbol + ' <span class="' + (t.direction === 'LONG' ? 'up' : 'down') + '">' + t.direction + '</span></div>' +
        '<div class="price">' + fmt(t.lastPrice) + '</div>' +
        '<div class="joe-meta">Entry ' + fmt(t.entryPrice) + '</div>' +
        '<div class="joe-meta">P&amp;L: <span class="' + pnlClass(pnl) + '">' + (pnl >= 0 ? '+' : '') + pct + '%</span></div>' +
        learned +
        '<div class="joe-meta">' + left + '</div>';
      grid.appendChild(card);
    });
  }

  function closeExpired() {
    const now = Date.now();
    let closedAny = false;
    trades.forEach(function (t) {
      if (!t.closed && (now >= t.expiresAt || now - sessionStart >= SESSION_MS)) {
        t.closed = true;
        t.exitPrice = t.lastPrice;
        t.pnl = tradePnl(t);
        memory.push(analyseTrade(t));
        closedAny = true;
      }
    });
    if (closedAny) saveMemory(memory);
  }

  function sessionDone() {
    return trades.length > 0 && trades.every(function (t) { return t.closed; });
  }

  function renderSummary() {
    const total = trades.reduce(function (sum, t) { return sum + (t.pnl !== null ? t.pnl : tradePnl(t)); }, 0);
    const closedCount = trades.filter(function (t) { return t.closed; }).length;
    const wins = trades.filter(function (t) { return t.closed && t.pnl > 0; }).length;
    summaryEl.innerHTML =
      '<strong>Session result:</strong> ' +
      '<span class="' + pnlClass(total) + '">' + (total >= 0 ? '+' : '') + (total * 100).toFixed(2) + '%</span>' +
      ' (' + closedCount + '/' + trades.length + ' closed, ' + wins + ' profitable). ' +
      'Aim: maximum paper profit before the 10-minute cut-off.';
  }

  async function poll() {
    if (sessionDone()) return;
    try {
      const symbols = trades.filter(function (t) { return !t.closed; }).map(function (t) { return t.symbol; });
      if (symbols.length) {
        const res = await fetch(BINANCE_BASE + '/api/v3/ticker/price?symbols=' + encodeURIComponent(JSON.stringify(symbols)));
        if (res.ok) {
          const prices = await res.json();
          prices.forEach(function (p) {
            const t = trades.find(function (x) { return x.symbol === p.symbol; });
            if (t) { t.lastPrice = parseFloat(p.price); t.samples.push(t.lastPrice); }
          });
        }
      }
      closeExpired();
      render();
      if (sessionDone()) {
        statusEl.textContent = 'Session complete. All paper trades analysed and stored for future pattern matching.';
        renderSummary();
        renderInsights();
        clearInterval(pollTimer);
        clearInterval(clockTimer);
        return;
      }
      renderSummary();
    } catch (e) {
      statusEl.textContent = 'Live data error: ' + e.message + '. Retrying...';
    }
  }

  function tickClock() {
    if (sessionStart === null) return;
    clockEl.textContent = 'Time to cut-off: ' + formatLeft(remainingMs());
    if (remainingMs() === 0) poll();
  }

  registerCleanup(function () { clearInterval(pollTimer); clearInterval(clockTimer); });
  let pollTimer = null;
  let clockTimer = null;

  renderInsights();
  pickTrades().then(function (picked) {
    trades = picked;
    sessionStart = Date.now();
    if (!statusEl.textContent) statusEl.textContent = 'Live paper trading session running. 5 trades selected by momentum and learned patterns.';
    render();
    renderSummary();
    pollTimer = setInterval(poll, POLL_MS);
    clockTimer = setInterval(tickClock, 1000);
    tickClock();
  }).catch(function (e) {
    statusEl.textContent = 'Could not reach the live market data source: ' + e.message + '. Please check your connection and relaunch.';
  });
}