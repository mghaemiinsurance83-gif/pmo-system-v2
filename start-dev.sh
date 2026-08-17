#!/bin/bash
# Respawn wrapper for Next.js dev server — restarts if it crashes.
cd /home/z/my-project
while true; do
  NODE_OPTIONS="--max-old-space-size=1024" node node_modules/.bin/next dev -p 3000 > dev.log 2>&1
  echo "[$(date)] Server exited (code $?), restarting in 3s..." >> dev.log
  sleep 3
done
