#!/bin/sh
# Used by the Replit "Run" button: install once, build, then start the server
# (which also serves the web version of the app at the same URL).
set -e
cd "$(dirname "$0")/.."
[ -d server/node_modules ] || npm ci --prefix server
[ -d mobile/node_modules ] || npm ci --prefix mobile
npm run build
exec npm start
