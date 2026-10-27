#!/bin/zsh
# Rebuild the local LexiSpeak bundle and restart the background service (after code changes / git pull).
set -e
export PATH="/opt/homebrew/bin:$PATH"
cd /Users/janetmao/lexispeak
echo "▸ building…"; npm run build --silent 2>&1 | grep -E "built in|error" || true
echo "▸ restarting service…"; launchctl kickstart -k gui/$(id -u)/com.janet.lexispeak-local; sleep 2
curl -s -o /dev/null -w "%{http_code}" http://localhost:5182 | grep -q 200 && echo "✓ LexiSpeak local up: http://localhost:5182" || { echo "✗ not responding — see /tmp/lexispeak-local.log"; exit 1; }
