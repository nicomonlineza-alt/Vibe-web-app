# Nicom-AI

A web application for Nicom Online, built collaboratively with Vibe.

## Overview

Single-page application. All features launch as tiles from the homepage and open
in a central app window (about two thirds of the screen) with a close button at
the top left.

### Stock Market Joe

A paper trading feature powered by live market data from the Binance public API
(no API key required):

1. On launch it scans liquid USDT pairs and selects the 5 with the strongest
   24-hour momentum.
2. Each trade is opened as LONG (positive momentum) or SHORT (negative momentum)
   with a holding period randomly set between 5 and 10 minutes.
3. Prices refresh every 5 seconds and each trade shows live P&L and a countdown.
4. Trades close automatically at the end of their holding period, and all open
   trades are force-closed at the 10-minute session cut-off.
5. A session summary reports total paper profit and the number of winning trades.

All trades are paper trades. No real money is involved.

## Stack

- HTML5, CSS3, vanilla JavaScript
- No build step required; suitable for static hosting

## Deployment (Vercel)

1. Import this repository at vercel.com.
2. Vercel detects a static site automatically; no configuration is required.
3. Every push to the main branch triggers an automatic deployment.

## Local development

Open `index.html` in a browser, or serve the folder with any static file server.
