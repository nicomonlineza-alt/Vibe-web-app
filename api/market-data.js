// Secure market-data endpoint. Finnhub is preferred for US equities when configured;
// Twelve Data remains the fallback and handles slash-formatted forex/crypto symbols.
// API keys are server-only environment variables and must never enter browser code.
const ALLOWED_INTERVALS = new Set(["1day", "1h", "30min", "15min", "5min", "1min"]);
const FINNHUB_RESOLUTION = { "1day": "D", "1h": "60", "30min": "30", "15min": "15", "5min": "5", "1min": "1" };
const INTERVAL_SECONDS = { "1day": 86400, "1h": 3600, "30min": 1800, "15min": 900, "5min": 300, "1min": 60 };

function validCandles(rows) {
  return rows
    .filter(row => row.datetime && [row.open, row.high, row.low, row.close].every(Number.isFinite) && row.high >= row.low)
    .sort((a, b) => String(a.datetime).localeCompare(String(b.datetime)));
}

async function fetchFinnhub(symbol, interval, outputsize, apiKey) {
  const now = Math.floor(Date.now() / 1000);
  const from = now - (INTERVAL_SECONDS[interval] * outputsize * 3) - (interval === "1day" ? 86400 * 10 : 0);
  const url = new URL("https://finnhub.io/api/v1/stock/candle");
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("resolution", FINNHUB_RESOLUTION[interval]);
  url.searchParams.set("from", String(from));
  url.searchParams.set("to", String(now));
  const upstream = await fetch(url, {
    headers: { "X-Finnhub-Token": apiKey },
    signal: AbortSignal.timeout(10000)
  });
  const payload = await upstream.json();
  if (!upstream.ok || payload.s !== "ok" || !Array.isArray(payload.t)) {
    throw new Error(payload.error || (upstream.status === 403 ? "Finnhub denied candle access; check your plan." : "Finnhub returned no usable candles."));
  }
  const candles = validCandles(payload.t.map((timestamp, index) => ({
    datetime: new Date(Number(timestamp) * 1000).toISOString().replace("T", " ").slice(0, 19),
    open: Number(payload.o?.[index]), high: Number(payload.h?.[index]),
    low: Number(payload.l?.[index]), close: Number(payload.c?.[index]),
    volume: payload.v?.[index] == null ? null : Number(payload.v[index])
  })));
  if (candles.length < Math.min(21, outputsize)) throw new Error("Finnhub returned too few valid candles for this analysis.");
  return {
    source: "Finnhub",
    symbol,
    exchange: null,
    currency: "USD",
    interval,
    fetchedAt: new Date().toISOString(),
    candleCount: candles.length,
    candles: candles.slice(-outputsize)
  };
}

async function fetchTwelveData(symbol, interval, outputsize, apiKey) {
  const url = new URL("https://api.twelvedata.com/time_series");
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("interval", interval);
  url.searchParams.set("outputsize", String(outputsize));
  url.searchParams.set("format", "JSON");
  const upstream = await fetch(url, {
    headers: { Authorization: `apikey ${apiKey}` },
    signal: AbortSignal.timeout(10000)
  });
  const payload = await upstream.json();
  if (!upstream.ok || payload.status === "error" || !Array.isArray(payload.values)) {
    const message = payload.message || payload.error || "Market data provider returned an unexpected response.";
    const error = new Error(message);
    error.status = upstream.status === 429 ? 429 : upstream.status >= 500 ? 502 : 400;
    error.code = payload.code || "MARKET_DATA_PROVIDER_ERROR";
    throw error;
  }
  const candles = validCandles(payload.values.map(row => ({
    datetime: row.datetime,
    open: Number(row.open), high: Number(row.high), low: Number(row.low),
    close: Number(row.close), volume: row.volume == null ? null : Number(row.volume)
  })));
  if (candles.length < 21) {
    const error = new Error("Fewer than 21 valid candles were returned; analysis is unavailable.");
    error.status = 502;
    error.code = "INSUFFICIENT_CANDLES";
    throw error;
  }
  return {
    source: "Twelve Data",
    symbol: payload.meta?.symbol || symbol,
    exchange: payload.meta?.exchange || null,
    currency: payload.meta?.currency || "USD",
    interval,
    fetchedAt: new Date().toISOString(),
    candleCount: candles.length,
    candles
  };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=60");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const finnhubKey = process.env.FINNHUB_API_KEY;
  const twelveDataKey = process.env.TWELVE_DATA_API_KEY;
  if (!finnhubKey && !twelveDataKey) {
    return res.status(503).json({
      error: "Market data is not configured. Add FINNHUB_API_KEY or TWELVE_DATA_API_KEY in Vercel environment variables.",
      code: "MARKET_DATA_NOT_CONFIGURED"
    });
  }

  const symbol = String(req.query.symbol || "AAPL").trim().toUpperCase();
  const interval = String(req.query.interval || "1day").trim();
  const requestedSize = Number.parseInt(String(req.query.outputsize || "21"), 10);
  const outputsize = Number.isFinite(requestedSize) ? Math.min(100, Math.max(21, requestedSize)) : 21;
  if (!/^[A-Z./:_-]{1,24}$/.test(symbol)) return res.status(400).json({ error: "Invalid market symbol." });
  if (!ALLOWED_INTERVALS.has(interval)) return res.status(400).json({ error: "Unsupported candle interval." });

  try {
    // Finnhub's stock candle endpoint is used for plain equity tickers.
    // Slash-formatted pairs stay on Twelve Data because provider symbols differ by venue.
    if (finnhubKey && /^[A-Z][A-Z0-9.-]{0,11}$/.test(symbol)) {
      try {
        const result = await fetchFinnhub(symbol, interval, outputsize, finnhubKey);
        return res.status(200).json(result);
      } catch (error) {
        if (!twelveDataKey) {
          const status = error?.name === "TimeoutError" ? 504 : 502;
          return res.status(status).json({
            error: error?.message || "Finnhub market data is unavailable.",
            code: "FINNHUB_MARKET_DATA_UNAVAILABLE"
          });
        }
      }
    }
    if (!twelveDataKey) {
      return res.status(503).json({
        error: "This symbol or candle interval needs Twelve Data, or Finnhub does not provide access on the current plan.",
        code: "MARKET_DATA_PROVIDER_FALLBACK_UNAVAILABLE"
      });
    }
    const result = await fetchTwelveData(symbol, interval, outputsize, twelveDataKey);
    return res.status(200).json(result);
  } catch (error) {
    const timedOut = error?.name === "TimeoutError";
    return res.status(error?.status || (timedOut ? 504 : 502)).json({
      error: error?.message || (timedOut ? "Market data request timed out." : "Unable to reach the market data provider."),
      code: error?.code || (timedOut ? "MARKET_DATA_TIMEOUT" : "MARKET_DATA_UNAVAILABLE")
    });
  }
}
