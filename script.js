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

// ---- Feature: Stock Market Joe ------------------------------------------
// Live data: Binance public REST API (no key required).
// Session: 5 paper trades, each held 5-10 minutes, forced close at 10 minutes.

const BINANCE_BASE = 'https://api.binance.com';
const SESSION_MS = 10 * 60 * 1000;      // hard cut-off
const POLL_MS = 5000;                   // price refresh interval

function renderStockMarketJoe(root) {
  root.innerHTML =
    '<h2>Stock Market Joe</h2>' +
    '<p class="subtitle">Live crypto market data (Binance). Paper trades only: no real money.</p>' +
    '<div class="joe-session" id="joe-session">' +
    '  <div class="joe-status" id="joe-status">Scanning the market for the best 5 trades...</div>' +
    '  <div class="joe-clock" id="joe-clock"></div>' +
    '  <div class="stocks" id="joe-stocks"></div>' +
    '  <div class="joe-summary" id="joe-summary"></div>' +
    '</div>';

  const statusEl = root.querySelector('#joe-status');
  const clockEl = root.querySelector('#joe-clock');
  const grid = root.querySelector('#joe-stocks');
  const summaryEl = root.querySelector('#joe-summary');

  let sessionStart = null;
  let trades = [];

  function fmt(n) { return '$' + n.toFixed(n < 1 ? 6 : 2); }
  function pnlClass(v) { return v >= 0 ? 'up' : 'down'; }
  function remainingMs() { return Math.max(0, SESSION_MS - (Date.now() - sessionStart)); }

  async function pickTrades() {
    // Rank liquid USDT pairs by 24h absolute momentum and take the top 5.
    const res = await fetch(BINANCE_BASE + '/api/v3/ticker/24hr');
    if (!res.ok) throw new Error('Market data unavailable (HTTP ' + res.status + ')');
    const tickers = await res.json();
    return tickers
      .filter(function (t) {
        return /USDT$/.test(t.symbol) &&
          !/(UP|DOWN|BULL|BEAR)USDT$/.test(t.symbol) &&
          parseFloat(t.quoteVolume) > 50000000 &&
          parseFloat(t.lastPrice) > 0;
      })
      .map(function (t) {
        return { symbol: t.symbol, momentum: parseFloat(t.priceChangePercent), lastPrice: parseFloat(t.lastPrice) };
      })
      .sort(function (a, b) { return Math.abs(b.momentum) - Math.abs(a.momentum); })
      .slice(0, 5)
      .map(function (t) {
        const durationMs = (5 + Math.random() * 5) * 60 * 1000; // 5 to 10 minutes
        return {
          symbol: t.symbol,
          direction: t.momentum >= 0 ? 'LONG' : 'SHORT',
          entryPrice: t.lastPrice,
          entryTime: Date.now(),
          durationMs: durationMs,
          expiresAt: Date.now() + durationMs,
          lastPrice: t.lastPrice,
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
      const card = document.createElement('div');
      card.className = 'stock-card';
      card.innerHTML =
        '<div class="sym">' + t.symbol + ' <span class="' + (t.direction === 'LONG' ? 'up' : 'down') + '">' + t.direction + '</span></div>' +
        '<div class="price">' + fmt(t.lastPrice) + '</div>' +
        '<div class="joe-meta">Entry ' + fmt(t.entryPrice) + '</div>' +
        '<div class="joe-meta">P&amp;L: <span class="' + pnlClass(pnl) + '">' + (pnl >= 0 ? '+' : '') + pct + '%</span></div>' +
        '<div class="joe-meta">' + left + '</div>';
      grid.appendChild(card);
    });
  }

  function formatLeft(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    const m = Math.floor(s / 60);
    return (m > 0 ? m + 'm ' : '') + (s % 60) + 's left';
  }

  function closeExpired() {
    const now = Date.now();
    trades.forEach(function (t) {
      if (!t.closed && (now >= t.expiresAt || now - sessionStart >= SESSION_MS)) {
        t.closed = true;
        t.exitPrice = t.lastPrice;
        t.pnl = tradePnl(t);
      }
    });
  }

  function sessionDone() {
    return trades.length > 0 && trades.every(function (t) { return t.closed; });
  }

  function renderSummary() {
    const total = trades.reduce(function (sum, t) { return sum + (t.pnl || 0); }, 0);
    const wins = trades.filter(function (t) { return t.pnl > 0; }).length;
    summaryEl.innerHTML =
      '<strong>Session result:</strong> ' +
      '<span class="' + pnlClass(total) + '">' + (total >= 0 ? '+' : '') + (total * 100).toFixed(2) + '%</span>' +
      ' across ' + trades.length + ' paper trades (' + wins + ' profitable). ' +
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
            if (t) t.lastPrice = parseFloat(p.price);
          });
        }
      }
      closeExpired();
      render();
      if (sessionDone()) {
        statusEl.textContent = 'Session complete. All paper trades closed.';
        renderSummary();
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

  pickTrades().then(function (picked) {
    trades = picked;
    sessionStart = Date.now();
    statusEl.textContent = 'Live paper trading session running. 5 trades selected by momentum.';
    render();
    renderSummary();
    pollTimer = setInterval(poll, POLL_MS);
    clockTimer = setInterval(tickClock, 1000);
    tickClock();
  }).catch(function (e) {
    statusEl.textContent = 'Could not reach the live market data source: ' + e.message + '. Please check your connection and relaunch.';
  });
}