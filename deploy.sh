#!/bin/bash
# Deploy CS Platform to Hetzner VPS
# Usage: bash deploy.sh   (run from project root on PC)

set -e

VPS="root@91.99.156.163"
VPS_DIR="/opt/cs-platform"
SSH_OPTS="-i $HOME/.ssh/id_nas -o StrictHostKeyChecking=no"

echo "=== [1/3] Building on PC ==="
npm run build

echo "=== [2/3] Syncing to VPS ==="
ssh $SSH_OPTS "$VPS" "rm -rf $VPS_DIR/.next"
tar czf - .next public server.js next.config.js package.json package-lock.json templates data data_sources scripts 2>/dev/null \
  | ssh $SSH_OPTS "$VPS" "cd $VPS_DIR && tar xzf -"

echo "=== [3/3] Restarting on VPS ==="
ssh $SSH_OPTS "$VPS" "cd $VPS_DIR && NODE_ENV=production PORT=443 POSTGREST_HOST=10.0.0.3 POSTGREST_PORT=3000 pm2 restart cs-platform --update-env"

echo ""
echo "=== Deploy complete! ==="
ssh $SSH_OPTS "$VPS" "pm2 status"
