#!/usr/bin/env bash
# Install the host side of the Approve button and of approve.py as systemd user units.
# Run it once on the lab host, in the main clone that the review container mounts: scripts/review/approve-install.sh
# Then: docker-compose -p t7d-review -f docker-compose.dev.yml up -d
# Remove it: systemctl --user disable --now t7d-review-approve.path && rm ~/.config/systemd/user/t7d-review-approve.*
set -euo pipefail
repo=$(cd "$(dirname "$(readlink -f "$0")")/../.." && pwd)
units=${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user
gh=$(command -v gh) || { echo "approve-install: gh is not on PATH" >&2; exit 1; }
# before "docker-compose up": else Docker makes the folders as root
mkdir -p "$units" "$repo/.review/approve" "$repo/.review/approve-status"

cat >"$units/t7d-review-approve.path" <<EOF
[Unit]
Description=t7d.dev review: wait for an approved round

[Path]
PathExists=$repo/.review/approve/request.json
MakeDirectory=yes

[Install]
WantedBy=default.target
EOF

# A user unit gets a short PATH: add the folder of gh, which git also uses to log in to GitHub.
cat >"$units/t7d-review-approve.service" <<EOF
[Unit]
Description=t7d.dev review: check, push, merge and publish the approved round

[Service]
Type=oneshot
Environment=PATH=$(dirname "$gh"):/usr/local/bin:/usr/bin:/bin
ExecStart=$repo/scripts/review/approve-host.sh
# Keep this below STALE in approve.py (1800 s): after that time the page treats "running" as stopped.
TimeoutStartSec=1500
# A cap, so a run that goes wrong cannot take the memory of the platform (a 4 GB host).
MemoryMax=256M
EOF

systemctl --user daemon-reload
systemctl --user enable --now t7d-review-approve.path
systemctl --user --no-pager status t7d-review-approve.path | head -3
if [ "$(loginctl show-user "$USER" -p Linger --value 2>/dev/null)" != yes ]; then
  echo "Note: linger is off. After a reboot the button works only when $USER has a login session."
  echo "To keep it on: loginctl enable-linger $USER"
fi
echo "Remove it: systemctl --user disable --now t7d-review-approve.path && rm $units/t7d-review-approve.*"
