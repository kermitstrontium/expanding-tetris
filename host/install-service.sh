#!/usr/bin/env bash
# Install Sprawl as a supervised systemd user unit and expose it on the
# tailnet only:  https://frozen-wsl.tail50be60.ts.net:9447/
# Idempotent. Never uses funnel.
set -euo pipefail

DIR="$HOME/ai-share/sprawl"
PORT=8091
HTTPS_PORT=9447
UNIT=sprawl.service
UNIT_DIR="$HOME/.config/systemd/user"
FQDN="frozen-wsl.tail50be60.ts.net"

say() { printf '\033[36m%s\033[0m\n' "$*"; }
ok()  { printf '  \033[32m[ok]\033[0m %s\n' "$*"; }
die() { printf '\033[31m%s\033[0m\n' "$*" >&2; exit 1; }

[ -f "$DIR/index.html" ] || die "$DIR/index.html not found"

say "1. unit"
mkdir -p "$UNIT_DIR"
cp "$DIR/host/$UNIT" "$UNIT_DIR/$UNIT"
systemctl --user daemon-reload
systemctl --user enable "$UNIT" >/dev/null 2>&1 || true
systemctl --user restart "$UNIT"
sleep 1
systemctl --user is-active --quiet "$UNIT" || { systemctl --user status "$UNIT" --no-pager | head -20; die "unit failed"; }
ok "$UNIT active"

say "2. local check"
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:$PORT/" || echo 000)
[ "$code" = 200 ] || die "local server returned $code"
ok "http://127.0.0.1:$PORT/ -> 200"

say "3. tailscale serve (tailnet only)"
if tailscale serve status 2>&1 | grep -q ":$HTTPS_PORT"; then
  ok "rule for :$HTTPS_PORT already exists"
else
  tailscale serve --bg --https="$HTTPS_PORT" "http://127.0.0.1:$PORT"
  ok "rule created"
fi

say "4. tailnet check"
tc=$(curl -sk -o /dev/null -w '%{http_code}' --max-time 8 "https://$FQDN:$HTTPS_PORT/" || echo 000)
printf '  https://%s:%s/ -> HTTP %s\n' "$FQDN" "$HTTPS_PORT" "$tc"
[ "$tc" = 200 ] && ok "live" || die "tailnet URL returned $tc"
