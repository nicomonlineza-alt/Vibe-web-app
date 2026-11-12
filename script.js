// ---- Central app window -------------------------------------------------
const overlay = document.getElementById('app-overlay');
const content = document.getElementById('app-content');
const closeBtn = document.getElementById('app-close');

const apps = {
  'stock-joe': renderStockMarketJoe,
  'stock-kenny': renderStockMarketKenny
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
const MEMORY_KEY = 'nicom-ai-joe-memory-v1';
const KENNY_MEMORY_KEY = 'nicom-ai-kenny-memory-v1';
const KENNY_SCORE_KEY = 'nicom-ai-kenny-score-v1';
const MEMORY_LIMIT = 300;

function loadMemory(key) {
  try { return JSON.parse(localStorage.getItem(key || MEMORY_KEY)) || []; }
  catch (e) { return []; }
}
function saveMemory(memory, key) {
  try { localStorage.setItem(key || MEMORY_KEY, JSON.stringify(memory.slice(-MEMORY_LIMIT))); } catch (e) {}
}

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

function patternScore(candFeaturesArr, memory) {
  const past = memory.map(function (m) { return candidateFeatures(m); });
  const all = past.concat([candFeaturesArr]);
  const norm = normaliseFeatures(all);
  const cand = norm[norm.length - 1];
  let winnerScore = 0, loserScore = 0;
  memory.forEach(function (m, i) {
    const sim = 1 / (1 + featureDistance(cand, norm[i]));
    if (m.pnl > 0) winnerScore += sim * m.pnl;
    else loserScore += sim * Math.abs(m.pnl);
  });
  return winnerScore - loserScore;
}

function analyseTrade(t) {
  const samples = t.samples || [];
  const n = samples.length;
  let maxUp = 0, maxDown = 0;
  samples.forEach(function (p) {
    const move = (p - t.entryPrice) / t.entryPrice * (t.direction === 'LONG' ? 1 : -1);
    if (move > maxUp) maxUp = move;
    if (move < maxDown) maxDown = move;
  });
  let earlySlope = 0;
  if (n >= 6) {
    const k = Math.max(2, Math.floor(n / 3));
    earlySlope = (samples[k] - samples[0]) / samples[0];
  }
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
const BINANCE_BASE = 'https://api.binance.com';
const SESSION_MS = 10 * 60 * 1000;
const POLL_MS = 5000;

function renderStockMarketJoe(root) { renderMarketSimulator(root, { name: 'Joe', memoryKey: MEMORY_KEY, duration: 10 * 60 * 1000, scoreKey: null }); }
function renderStockMarketKenny(root) { renderMarketSimulator(root, { name: 'Kenny', memoryKey: KENNY_MEMORY_KEY, duration: 2 * 60 * 1000, scoreKey: KENNY_SCORE_KEY }); }
function renderMarketSimulator(root, config) {
  const SESSION_MS = config.duration;
  const appName = config.name;
  const memoryKey = config.memoryKey;
  root.innerHTML =
    '<h2>Stock Market ' + appName + '</h2>' +
    '<p class="subtitle">Binance crypto market data. Educational paper simulation only — no real-money trading.</p>' +
    '<div class="joe-toolbar">' +
    '  <button id="joe-backup" class="joe-btn">Backup knowledge</button>' +
    '  <button id="joe-reset" class="joe-btn joe-btn-danger">Reset data</button>' +
    '</div>' +
    '<div class="joe-session" id="joe-session">' +
    '  <div class="joe-status" id="joe-status">Scanning the market and matching learned patterns...</div>' +
    '  <div class="joe-clock" id="joe-clock"></div>' +
    '  <div class="joe-chart-box">' +
    '    <div class="joe-chart-title">Session P&amp;L (all open trades, %)</div>' +
    '    <canvas id="joe-chart" width="800" height="180"></canvas>' +
    '  </div>' +
    '  <div class="stocks" id="joe-stocks"></div>' +
    '  <div class="joe-summary" id="joe-summary"></div>' +
    '  <div class="joe-insights" id="joe-insights"></div>' +
    '</div>';

  const statusEl = root.querySelector('#joe-status');
  const clockEl = root.querySelector('#joe-clock');
  const grid = root.querySelector('#joe-stocks');
  const summaryEl = root.querySelector('#joe-summary');
  const insightsEl = root.querySelector('#joe-insights');
  const chartCanvas = root.querySelector('#joe-chart');
  const backupBtn = root.querySelector('#joe-backup');
  const resetBtn = root.querySelector('#joe-reset');

  let memory = loadMemory(memoryKey);
  let confidence = config.scoreKey ? Number(localStorage.getItem(config.scoreKey) || 50) : null;
  let sessionStart = null;
  let trades = [];
  let pnlHistory = [];

  function fmt(n) { return '$' + n.toFixed(n < 1 ? 6 : 2); }
  function pnlClass(v) { return v >= 0 ? 'up' : 'down'; }
  function formatLeft(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    const m = Math.floor(s / 60);
    return (m > 0 ? m + 'm ' : '') + (s % 60) + 's left';
  }
  function remainingMs() { return Math.max(0, SESSION_MS - (Date.now() - sessionStart)); }

  resetBtn.addEventListener('click', function () {
    if (!confirm('Reset all of ' + appName + '\'s learned knowledge? This deletes the stored trade patterns and cannot be undone.')) return;
    memory = [];
    try { localStorage.removeItem(memoryKey); if (config.scoreKey) { confidence = 50; localStorage.setItem(config.scoreKey, '50'); } } catch (e) {}
    renderInsights();
    statusEl.textContent = appName + '\'s knowledge has been reset. New patterns will be learned from the next session.';
  });

  backupBtn.addEventListener('click', function () {
    trades.forEach(function (t) {
      if (t.closed && t.pnl !== null && !t.stored) {
        memory.push(analyseTrade(t));
        t.stored = true;
      }
    });
    saveMemory(memory, memoryKey);
    const backup = {
      app: 'Nicom-AI Stock Market ' + appName,
      exportedAt: new Date().toISOString(),
      tradeCount: memory.length,
      trades: memory
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'stock-market-joe-knowledge-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    statusEl.textContent = 'Knowledge analysed and backed up: ' + memory.length + ' trades exported as JSON.';
  });

  function renderInsights() {
    if (!memory.length) {
      insightsEl.innerHTML = '<p class="joe-note">' + appName + ' has no learned patterns yet. Insights appear after the first sessions.</p>' + (confidence === null ? '' : '<p class="joe-note"><strong>Kenny prediction score:</strong> ' + confidence.toFixed(0) + '% (baseline 50%; adjusted as predictions resolve).</p>');
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
      '<h3>' + appName + '\'s learned insights</h3>' +
      '<p class="joe-note">Based on ' + memory.length + ' completed paper trades: ' + winRate +
      '% win rate, average win +' + (avgWin * 100).toFixed(2) + '%, average loss ' + (avgLoss * 100).toFixed(2) + '%.</p>' +
      '<ul class="joe-list">' +
      describe(wins, 'Profitable patterns') +
      describe(losses, 'Patterns to avoid') +
      '</ul>' +
      '<p class="joe-note">Selection favours candidates resembling past winners and skips those resembling past losers.</p>' + (confidence === null ? '' : '<p class="joe-note"><strong>Kenny prediction score:</strong> ' + confidence.toFixed(0) + '% (starts at 50%, changes by 2 points per prediction; capped at 0–100%).</p>');
  }

  function drawChart() {
    const ctx = chartCanvas.getContext('2d');
    const w = chartCanvas.width, h = chartCanvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#12182e';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();
    ctx.setLineDash([]);
    if (pnlHistory.length < 2) {
      ctx.fillStyle = '#9aa5bd';
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillText('Collecting data...', 12, h / 2 - 8);
      return;
    }
    const values = pnlHistory.map(function (p) { return p.v; });
    const maxAbs = Math.max(0.001, Math.max.apply(null, values.map(Math.abs)));
    const yFor = function (v) { return h / 2 - (v / maxAbs) * (h / 2 - 10); };
    const xFor = function (t) { return (t / SESSION_MS) * w; };
    ctx.beginPath();
    pnlHistory.forEach(function (p, i) {
      const x = xFor(p.t), y = yFor(p.v);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    const last = pnlHistory[pnlHistory.length - 1];
    ctx.strokeStyle = last.v >= 0 ? '#3ecf8e' : '#ff5c6c';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = last.v >= 0 ? '#3ecf8e' : '#ff5c6c';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillText((last.v >= 0 ? '+' : '') + (last.v * 100).toFixed(2) + '%', w - 70, last.v >= 0 ? 16 : h - 8);
  }

  function recordPnlPoint() {
    if (sessionStart === null) return;
    const total = trades.reduce(function (sum, t) {
      return sum + (t.closed && t.pnl !== null ? t.pnl : tradePnl(t));
    }, 0);
    pnlHistory.push({ t: Date.now() - sessionStart, v: total });
    drawChart();
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

    const scored = candidates.map(function (c) {
      return Object.assign({ patternScore: patternScore(candidateFeatures(c), memory), skipped: false }, c);
    });
    const avoided = [];
    let chosen = [];
    for (let i = 0; i < scored.length && chosen.length < 5; i++) {
      const c = scored[i];
      if (memory.length >= 10 && c.patternScore < 0) { c.skipped = true; avoided.push(c.symbol); continue; }
      chosen.push(c);
    }
    for (let i = 0; i < scored.length && chosen.length < 5; i++) {
      if (!scored[i].skipped && chosen.indexOf(scored[i]) === -1) chosen.push(scored[i]);
    }
    if (avoided.length) {
      statusEl.textContent = 'Pattern filter avoided: ' + avoided.slice(0, 4).join(', ') + (avoided.length > 4 ? '...' : '');
    }

    return Promise.all(chosen.map(async function (c) {
      let candlePattern = 'mixed';
      let candleBias = 0;
      try {
        const kr = await fetch(BINANCE_BASE + '/api/v3/klines?symbol=' + encodeURIComponent(c.symbol) + '&interval=1m&limit=2');
        if (kr.ok) {
          const ks = await kr.json(), a = ks[ks.length - 1], b = ks[ks.length - 2];
          const o = +a[1], h = +a[2], l = +a[3], cl = +a[4], po = +b[1], pc = +b[4];
          const range = Math.max(h - l, 1e-12), body = Math.abs(cl - o);
          if (cl > o && pc < po && cl >= po && o <= pc) { candlePattern = 'bullish engulfing'; candleBias = 1; }
          else if (cl < o && pc > po && o >= pc && cl <= po) { candlePattern = 'bearish engulfing'; candleBias = -1; }
          else if ((Math.min(o,cl)-l)/range > .58 && body/range < .3) { candlePattern = 'lower-wick rejection'; candleBias = 1; }
          else if ((h-Math.max(o,cl))/range > .58 && body/range < .3) { candlePattern = 'upper-wick rejection'; candleBias = -1; }
          else if (cl > o) { candlePattern = 'bullish candle'; candleBias = 1; }
          else if (cl < o) { candlePattern = 'bearish candle'; candleBias = -1; }
        }
      } catch(e) {}
      const durationMs = appName === 'Kenny' ? SESSION_MS : (5 + Math.random() * 5) * 60 * 1000;
      return {
        symbol: c.symbol,
        direction: (c.momentum + candleBias * 0.35) >= 0 ? 'LONG' : 'SHORT',
        candlePattern: candlePattern,
        candleBias: candleBias,
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
        stored: false,
        exitPrice: null,
        pnl: null
      };
    }));
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
        '<div class="joe-meta">' + left + '</div>' + '<div class="joe-meta">Candle setup: ' + (t.candlePattern || 'observing') + '</div>';
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
        t.stored = true;
        closedAny = true;
      }
    });
    if (closedAny) {
      saveMemory(memory, memoryKey);
      if (config.scoreKey) {
        trades.filter(function (t) { return t.closed && !t.scored; }).forEach(function (t) {
          confidence = Math.max(0, Math.min(100, confidence + (t.pnl > 0 ? 2 : -2)));
          t.scored = true;
        });
        localStorage.setItem(config.scoreKey, String(confidence));
      }
    }
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
      'Two-minute educational paper simulation. Results are uncertain; profit is not guaranteed.';
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
            if (t) {
              t.lastPrice = parseFloat(p.price);
              t.samples.push(t.lastPrice);
              if (!t.closed && t.samples.length >= 4) {
                const sig = t.samples[t.samples.length - 1] > t.samples[t.samples.length - 4] ? 'BUY' :
                  (t.samples[t.samples.length - 1] < t.samples[t.samples.length - 4] ? 'SELL' : 'HOLD');
                if (sig !== t.lastSignal) {
                  t.lastSignal = sig;
                  statusEl.textContent = appName + ' signal notification: ' + t.symbol + ' — ' + sig + ' (paper signal only).';
                }
              }
            }
          });
        }
      }
      closeExpired();
      render();
      recordPnlPoint();
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
  drawChart();
  pickTrades().then(function (picked) {
    trades = picked;
    sessionStart = Date.now();
    if (!statusEl.textContent) statusEl.textContent = 'Live paper trading session running. 5 trades selected by momentum and learned patterns.';
    render();
    renderSummary();
    recordPnlPoint();
    pollTimer = setInterval(poll, POLL_MS);
    clockTimer = setInterval(tickClock, 1000);
    tickClock();
  }).catch(function (e) {
    statusEl.textContent = 'Could not reach the live market data source: ' + e.message + '. Please check your connection and relaunch.';
  });
}
