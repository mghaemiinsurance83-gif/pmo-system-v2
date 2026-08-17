#!/bin/bash
# Double-fork daemon pattern — survives parent shell exit (reparents to init)
cd /home/z/my-project
export NODE_OPTIONS="--max-old-space-size=1024"
# First fork
(
  # Second fork - this becomes the daemon
  exec ./node_modules/.bin/next dev -p 3000 >> dev.log 2>&1
) &
# Save PID
echo $! > .zscripts/dev.pid
# Exit parent immediately
exit 0
