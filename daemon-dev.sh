#!/bin/bash
# Double-fork daemon pattern
cd /home/z/my-project
# First fork
(
  # Second fork - this becomes the daemon
  exec ./node_modules/.bin/next dev -p 3000 >> dev.log 2>&1
) &
# Exit parent immediately
exit 0
