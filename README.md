# Nicom-AI

A web application for Nicom Online, built collaboratively with Vibe.

## Overview

Single-page application. All features launch as tiles from the homepage and open
in a central app window (about two thirds of the screen) with a close button at
the top left.

### Stock Market Joe

A paper trading feature powered by live market data from the Binance public API
(no API key required), with a self-learning pattern module:

1. On launch it scans liquid USDT pairs and scores candidates against patterns
   learned from previous paper trades.
2. Candidates whose pre-trade profile resembles past losing trades are skipped
   when the trade history is mature enough (10 or more stored trades).
3. Five trades are opened as LONG or SHORT with holding periods between 5 and
   10 minutes.
4. Prices refresh every 5 seconds; each trade shows live P&L, a countdown and,
   once learning is active, its pattern-match score.
5. At close, each trade is analysed (entry momentum, volatility range, early
   trend slope, price path volatility, maximum favourable and adverse moves)
   and stored in browser memory (localStorage, last 300 trades).
6. All open trades are force-closed at the 10-minute session cut-off, followed
   by a session summary and an insights panel describing profitable patterns
   and patterns to avoid.

All trades are paper trades. No real money is involved.

## Learning limitations

The pattern module is a lightweight similarity model running in the browser.
It learns from its own small sample of short paper trades and cannot guarantee
profits. Treat its insights as experimental.

## Stack

- HTML5, CSS3, vanilla JavaScript
- No build step required; suitable for static hosting

## Deployment (Vercel)

1. Import this repository at vercel.com.
2. Vercel detects a static site automatically; no configuration is required.
3. Every push to the main branch triggers an automatic deployment.

## Local development

Open `index.html` in a browser, or serve the folder with any static file server.
