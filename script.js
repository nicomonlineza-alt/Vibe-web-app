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

// ---- Feature: Stock Market Joe -----------------------------------------
function renderStockMarketJoe(root) {
  root.innerHTML =
    '<h2>Stock Market Joe</h2>' +
    '<p class="subtitle">Market snapshot with simulated live prices. Demo data only.</p>' +
    '<div class="stocks" id="joe-stocks"></div>' +
    '<p class="joe-note">Prices update every 3 seconds using a random walk simulation. Connect a market data API for live quotes.</p>';

  const stocks = [
    { sym: 'AAPL', price: 228.4 },
    { sym: 'MSFT', price: 421.9 },
    { sym: 'GOOG', price: 176.2 },
    { sym: 'TSLA', price: 248.6 },
    { sym: 'NPN', price: 3652.0 },
    { sym: 'FSR', price: 74.3 }
  ].map(function (s) { return Object.assign({ history: seedHistory(s.price) }, s); });

  const grid = root.querySelector('#joe-stocks');
  const cards = stocks.map(function (s) {
    const card = document.createElement('div');
    card.className = 'stock-card';
    card.innerHTML =
      '<div class="sym">' + s.sym + '</div>' +
      '<div class="price"></div>' +
      '<canvas width="220" height="48"></canvas>';
    grid.appendChild(card);
    return card;
  });

  function seedHistory(price) {
    const h = [];
    let p = price * 0.97;
    for (let i = 0; i < 30; i++) {
      p *= 1 + (Math.random() - 0.48) * 0.01;
      h.push(p);
    }
    h.push(price);
    return h;
  }

  function drawSpark(canvas, history, up) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, hgt = canvas.height;
    const min = Math.min.apply(null, history);
    const max = Math.max.apply(null, history);
    const range = max - min || 1;
    ctx.clearRect(0, 0, w, hgt);
    ctx.beginPath();
    history.forEach(function (p, i) {
      const x = (i / (history.length - 1)) * w;
      const y = hgt - ((p - min) / range) * (hgt - 6) - 3;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = up ? '#3ecf8e' : '#ff5c6c';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function tick() {
    stocks.forEach(function (s, i) {
      const prev = s.price;
      s.price = Math.max(0.01, s.price * (1 + (Math.random() - 0.5) * 0.006));
      s.history.push(s.price);
      if (s.history.length > 30) s.history.shift();
      const up = s.price >= prev;
      const card = cards[i];
      const priceEl = card.querySelector('.price');
      priceEl.textContent = '$' + s.price.toFixed(2);
      priceEl.className = 'price ' + (up ? 'up' : 'down');
      drawSpark(card.querySelector('canvas'), s.history, up);
    });
  }

  tick();
  const timer = setInterval(tick, 3000);
  const observer = new MutationObserver(function () {
    if (!root.isConnected) { clearInterval(timer); observer.disconnect(); }
  });
  observer.observe(document.getElementById('app-content'), { childList: true });
}