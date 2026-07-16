#!/bin/bash
set -e

echo "==========================================="
echo "   RareStore 5-Day Validation Runner       "
echo "==========================================="

echo "[1/3] Running Legacy Scraper..."
node scripts/sync-seller-data.legacy.js || echo "Legacy script had an error, continuing..."
cp data.js data.legacy.js
echo "Saved data.legacy.js"

echo "[2/3] Running SyncOS FULL Pipeline..."
node syncos/core.js FULL || echo "SyncOS had an error, continuing..."
cp data.js data.syncos.js
echo "Saved data.syncos.js"

echo "[3/3] Generating Validation Report..."
node syncos/reports/daily_validation.js

echo "Validation run complete."
