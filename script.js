// ---- Central app window -------------------------------------------------
const overlay = document.getElementById('app-overlay');
const content = document.getElementById('app-content');
const closeBtn = document.getElementById('app-close');

const apps = {
  'stock-joe': renderStockMarketJoe,
  'social-sally': renderSocialSally
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
const MEMORY_LIMIT = 300;

function loadMemory() {
  try { return JSON.parse(localStorage.getItem(MEMORY_KEY)) || []; }
  catch (e) { return []; }
}
function saveMemory(memory) {
  try { localStorage.setItem(MEMORY_KEY, JSON.stringify(memory.slice(-MEMORY_LIMIT))); } catch (e) {}
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

function renderStockMarketJoe(root) {
  root.innerHTML =
    '<h2>Stock Market Joe</h2>' +
    '<p class="subtitle">Live crypto market data (Binance). Paper trades only: no real money.</p>' +
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

  let memory = loadMemory();
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
    if (!confirm('Reset all of Joe\'s learned knowledge? This deletes the stored trade patterns and cannot be undone.')) return;
    memory = [];
    try { localStorage.removeItem(MEMORY_KEY); } catch (e) {}
    renderInsights();
    statusEl.textContent = 'Joe\'s knowledge has been reset. He will learn from scratch from the next trades.';
  });

  backupBtn.addEventListener('click', function () {
    trades.forEach(function (t) {
      if (t.closed && t.pnl !== null && !t.stored) {
        memory.push(analyseTrade(t));
        t.stored = true;
      }
    });
    saveMemory(memory);
    const backup = {
      app: 'Nicom-AI Stock Market Joe',
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
      '<p class="joe-note">Selection favours candidates resembling past winners and skips those resembling past losers.</p>';
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
        stored: false,
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
        t.stored = true;
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
// ---- Feature: Social Sally (live research edition) ------------------------
// Captures company details, then researches the industry and area LIVE via
// the Wikipedia API (browser-accessible, no key required) and builds the
// growth plan around the real findings.

const SALLY_KEY = 'nicom-ai-sally-profiles-v1';

function sallyLoadProfiles() {
  try { return JSON.parse(localStorage.getItem(SALLY_KEY)) || []; } catch (e) { return []; }
}
function sallySaveProfile(p) {
  const list = sallyLoadProfiles();
  list.push(p);
  try { localStorage.setItem(SALLY_KEY, JSON.stringify(list.slice(-50))); } catch (e) {}
}

const SALLY_INDUSTRIES = {
  retail: { label: 'Retail', wiki: 'Retail', competitors: ['National retail chains', 'Local independent shops', 'Online marketplaces (Takealot, Amazon, Shein)'], channels: ['Instagram and Facebook shops with product tagging', 'Google Business Profile with local SEO', 'WhatsApp Business catalogue for orders', 'Weekly promotions and loyalty programmes'], opportunities: ['Partner with complementary local businesses for cross-promotion', 'Offer local delivery or click-and-collect', 'Host in-store or community events'], kpis: ['Footfall or site visits', 'Conversion rate', 'Average basket size', 'Repeat customer rate'] },
  hospitality: { label: 'Hospitality', wiki: 'Hospitality industry', competitors: ['Nearby restaurants or accommodation', 'Delivery platforms', 'Booking sites (Booking.com, Airbnb)'], channels: ['Instagram food and venue photography', 'Google and TripAdvisor review management', 'Local food influencers', 'Weekly specials via WhatsApp and email'], opportunities: ['Host local events, tastings or live music', 'Corporate lunch or conference packages', 'Collaborate with nearby attractions'], kpis: ['Occupancy or covers per day', 'Average spend per guest', 'Review scores', 'Repeat booking rate'] },
  professional: { label: 'Professional services', wiki: 'Professional services', competitors: ['National firms with local branches', 'Boutique local consultancies', 'Freelance specialists'], channels: ['LinkedIn thought leadership and articles', 'Targeted email newsletters', 'Webinars and workshops', 'Referral partnerships with adjacent firms'], opportunities: ['Free diagnostic workshops for local businesses', 'Chamber of commerce and industry association membership', 'Local business awards entries for credibility'], kpis: ['Qualified leads per month', 'Proposal win rate', 'Client lifetime value', 'Referral share of new business'] },
  trades: { label: 'Trades and construction', wiki: 'Construction', competitors: ['Established local contractors', 'Franchise operators', 'Informal independent traders'], channels: ['Google Business Profile with project photos and reviews', 'Facebook community groups and local marketplaces', 'Before-and-after project galleries on Instagram', 'Vehicle branding and site signage'], opportunities: ['Municipal and property-management contracts', 'Maintenance retainers with estates and complexes', 'Partnerships with architects and estate agents'], kpis: ['Quote-to-job conversion rate', 'Job value average', 'Repeat maintenance contracts', 'Review volume and rating'] },
  tech: { label: 'Technology and software', wiki: 'Software industry', competitors: ['Global SaaS platforms', 'Local development agencies', 'In-house teams'], channels: ['Content marketing and SEO around client problems', 'LinkedIn outreach to decision makers', 'Product-led free trials or demos', 'Case studies and testimonials'], opportunities: ['Local enterprise digital-transformation budgets', 'Partnerships with ICT resellers', 'Government and school digitisation tenders'], kpis: ['Trial-to-paid conversion', 'Monthly recurring revenue', 'Churn rate', 'Sales cycle length'] },
  health: { label: 'Health and wellness', wiki: 'Health care', competitors: ['Nearby clinics, gyms or practices', 'National franchises', 'Online alternatives'], channels: ['Google Business Profile and health directory listings', 'Educational content and short videos', 'Community wellness events and screenings', 'Referral relationships with doctors and pharmacies'], opportunities: ['Corporate wellness programmes', 'Medical scheme partnerships', 'Senior and school community programmes'], kpis: ['New patient or member numbers', 'Appointment utilisation', 'Package retention', 'Referral counts'] },
  other: { label: 'Other', wiki: 'Business', competitors: ['Direct local providers of similar services', 'National brands expanding into the area', 'Substitute solutions customers use instead'], channels: ['Google Business Profile and local SEO', 'Social media on the platform your customers use most', 'Email and WhatsApp nurture lists', 'Local networking and partnerships'], opportunities: ['Local business associations and networking events', 'Partnerships with complementary providers', 'Community sponsorships for visibility'], kpis: ['Leads per month', 'Conversion rate', 'Customer retention', 'Revenue per customer'] }
};

// Live research helpers (Wikipedia, CORS-enabled, no key)
async function wikiSearch(query, limit) {
  const url = 'https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&origin=*&srlimit=' + (limit || 3) + '&srsearch=' + encodeURIComponent(query);
  const res = await fetch(url);
  if (!res.ok) throw new Error('Wikipedia search failed (HTTP ' + res.status + ')');
  const data = await res.json();
  return data.query.search.map(function (r) { return { title: r.title, snippet: r.snippet.replace(/<[^>]+>/g, '') }; });
}

async function wikiSummary(title) {
  const url = 'https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(title);
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  return { title: data.title, extract: data.extract, url: data.content_urls ? data.content_urls.desktop.page : ('https://en.wikipedia.org/wiki/' + encodeURIComponent(title)) };
}

async function sallyResearch(p) {
  const ind = SALLY_INDUSTRIES[p.industry] || SALLY_INDUSTRIES.other;
  const queries = [ind.wiki + ' industry', p.area + ' economy'];
  const results = [];
  for (let i = 0; i < queries.length; i++) {
    try {
      const hits = await wikiSearch(queries[i], 3);
      for (let j = 0; j < hits.length && results.length < 4; j++) {
        const s = await wikiSummary(hits[j].title);
        if (s && s.extract) results.push(s);
      }
    } catch (e) { /* keep partial results */ }
  }
  return results;
}

function renderSocialSally(root) {
  root.innerHTML =
    '<h2>Social Sally</h2>' +
    '<p class="subtitle">Sales and marketing advisor with live research. Answer four questions and Sally will research your industry and area, then build your growth plan.</p>' +
    '<div id="sally-body"></div>';
  renderSallyForm(root.querySelector('#sally-body'));
}

function renderSallyForm(body) {
  body.innerHTML =
    '<form id="sally-form" class="sally-form">' +
    '  <label>1. What industry is your company in?' +
    '    <select id="sally-industry">' +
    Object.keys(SALLY_INDUSTRIES).map(function (k) {
      return '<option value="' + k + '">' + SALLY_INDUSTRIES[k].label + '</option>';
    }).join('') +
    '    </select></label>' +
    '  <label>2. Area of operation (town, city or region)' +
    '    <input id="sally-area" type="text" placeholder="e.g. Cape Town, Western Cape" required /></label>' +
    '  <label>3. Website address (or "none yet")' +
    '    <input id="sally-website" type="text" placeholder="e.g. www.mycompany.co.za" /></label>' +
    '  <label>4. Describe your business services or products' +
    '    <textarea id="sally-desc" rows="4" placeholder="What do you sell, to whom, and what makes you different?" required></textarea></label>' +
    '  <button type="submit" class="joe-btn sally-go">Research and build my growth plan</button>' +
    '</form>';

  body.querySelector('#sally-form').addEventListener('submit', function (e) {
    e.preventDefault();
    const profile = {
      industry: body.querySelector('#sally-industry').value,
      area: body.querySelector('#sally-area').value.trim(),
      website: body.querySelector('#sally-website').value.trim(),
      description: body.querySelector('#sally-desc').value.trim(),
      createdAt: new Date().toISOString()
    };
    sallySaveProfile(profile);
    renderSallyPlan(body, profile);
  });
}

async function renderSallyPlan(body, p) {
  const ind = SALLY_INDUSTRIES[p.industry] || SALLY_INDUSTRIES.other;
  const desc = p.description;
  const firstWords = desc.split(/[,.]/)[0].trim();

  body.innerHTML =
    '<div class="sally-plan">' +
    '  <div class="sally-header"><strong>Growth plan for:</strong> ' + firstWords + ' &mdash; ' + p.area + '</div>' +
    '  <div class="joe-status" id="sally-research-status">Researching your industry and area from live sources...</div>' +
    '  <div id="sally-research"></div>' +
    '  <div id="sally-plan-body"></div>' +
    '  <button id="sally-again" class="joe-btn">Advise another company</button>' +
    '</div>';

  body.querySelector('#sally-again').addEventListener('click', function () {
    renderSallyForm(body);
  });

  const researchEl = body.querySelector('#sally-research');
  const statusEl = body.querySelector('#sally-research-status');
  const planEl = body.querySelector('#sally-plan-body');

  let findings = [];
  try {
    findings = await sallyResearch(p);
  } catch (e) {
    statusEl.textContent = 'Live research was unavailable (' + e.message + '). The plan below uses Sally\'s built-in industry knowledge.';
  }
  if (findings.length) {
    statusEl.textContent = 'Live research complete: ' + findings.length + ' sources found.';
    researchEl.innerHTML =
      '<h3>Live research findings</h3>' +
      findings.map(function (f) {
        return '<div class="sally-finding"><strong>' + f.title + '</strong>' +
          '<p>' + f.extract + '</p>' +
          '<a href="' + f.url + '" target="_blank" rel="noopener">Source: Wikipedia</a></div>';
      }).join('');
  } else if (!statusEl.textContent) {
    statusEl.textContent = 'No live sources found for this industry and area combination.';
  }

  planEl.innerHTML =
    '<h3>1. Industry snapshot</h3>' +
    '<p>You operate in the ' + ind.label.toLowerCase() + ' sector in ' + p.area + '. Use the live findings above as' +
    '  factual context for your market. Growth in this sector is driven by visibility, trust and repeat business.' +
    '  World-class companies win by being the most findable, the most recommended and the most consistent provider' +
    '  in their local market before expanding outward.</p>' +

    '  <h3>2. Competitor landscape</h3>' +
    '  <p>Your competitors will typically include:</p><ul>' +
    ind.competitors.map(function (c) { return '<li>' + c + '</li>'; }).join('') +
    '  </ul>' +
    '  <p><strong>Your research task (this week):</strong> identify the top 5 competitors in ' + p.area +
    '  by searching Google and social media as a customer would. Record for each: their pricing, their reviews' +
    '  (score and common complaints), their website quality' + (p.website && p.website.toLowerCase().indexOf('none') === -1 ? ' compared to yours (' + p.website + ')' : ' (you have no website yet: this is your first gap to close)') +
    ', and their social media activity. Every recurring complaint against competitors is a promise you can make and keep.</p>' +

    '  <h3>3. Local opportunities in ' + p.area + '</h3><ul>' +
    ind.opportunities.map(function (o) { return '<li>' + o + '</li>'; }).join('') +
    '  </ul>' +

    '  <h3>4. Positioning to become world class</h3>' +
    '  <p>Define one clear promise based on what your customers value most: "' + desc.slice(0, 120) +
    (desc.length > 120 ? '..."' : '"') +
    '  Position your company as the specialist, not the generalist: publish your process, guarantee your standards,' +
    '  and collect proof (reviews, case studies, results) from every single client.</p>' +

    '  <h3>5. Marketing channels to activate</h3><ul>' +
    ind.channels.map(function (c) { return '<li>' + c + '</li>'; }).join('') +
    '  </ul>' +

    '  <h3>6. Ninety-day action plan</h3>' +
    '  <ul>' +
    '    <li><strong>Days 1-14:</strong> Complete your Google Business Profile, fix or launch your website landing page,' +
    '    set up or clean up your main social profile, and gather your first 10 reviews from existing customers.</li>' +
    '    <li><strong>Days 15-30:</strong> Publish your core message and offer, contact 5 complementary local businesses' +
    '    for partnerships, and start one content rhythm (one useful post per week).</li>' +
    '    <li><strong>Days 31-60:</strong> Launch one local campaign (event, special or workshop), begin systematic' +
    '    follow-up with past customers, and track your KPIs weekly.</li>' +
    '    <li><strong>Days 61-90:</strong> Double down on the channel producing the best leads, formalise referral' +
    '    incentives, and document your service standards so quality scales with demand.</li>' +
    '  </ul>' +

    '  <h3>7. Measure these numbers</h3><ul>' +
    ind.kpis.map(function (k) { return '<li>' + k + '</li>'; }).join('') +
    '  </ul>';
}