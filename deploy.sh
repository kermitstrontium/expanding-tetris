#!/usr/bin/env bash
# Stamp a new build id into sw.js and index.html, after the tests pass.
# serve.py reads straight from this folder, so the tailnet copy is live at
# once. The stamp is what makes installed phones pick up the new code.
#
#   ./deploy.sh            stamp (tailnet copy only)
#   ./deploy.sh --push "message"   also commit everything and push to GitHub,
#                          which republishes expandingtetris.berger.au
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

for f in js/*.js js/themes/*.js js/music/*.js sw.js; do node --check "$f"; done
node test/core.test.js

BUILD="$(date -u +%Y%m%d-%H%M%S)"
sed -i -E "s/^const BUILD = '[^']*';/const BUILD = '$BUILD';/" sw.js
sed -i -E "s/(name=\"et-build\" content=\")[^\"]*\"/\1$BUILD\"/" index.html
grep -q "$BUILD" sw.js && grep -q "$BUILD" index.html || { echo "stamp failed" >&2; exit 1; }
echo "build $BUILD"

if curl -s --max-time 3 http://127.0.0.1:8091/ | grep -q "$BUILD"; then
  echo "local server is serving $BUILD"
fi

if [ "${1:-}" = "--push" ]; then
  git add -A
  git commit -q -m "${2:-Deploy $BUILD}" && git push -q origin main
  echo "pushed; GitHub Pages republishes in about a minute"
fi
