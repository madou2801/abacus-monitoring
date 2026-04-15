#!/bin/bash
# Deploy health-server to VPS 76.13.59.88
# Run from local machine: bash deploy.sh

VPS="root@76.13.59.88"
REMOTE_DIR="/home/abacus/monitoring"

echo "=== Deploying health-server to VPS ==="

# 1. Create remote directory
ssh $VPS "mkdir -p $REMOTE_DIR"

# 2. Copy files
scp health-server.js $VPS:$REMOTE_DIR/
scp config.json $VPS:$REMOTE_DIR/

# 3. Install and start with PM2
ssh $VPS "cd $REMOTE_DIR && HEALTH_API_KEY='6f20ade18b199808ca76f7f639565ddd9dcce828e1ad6ec3cd6f11a34441f905' pm2 start health-server.js --name health-aggregator && pm2 save"

# 4. Add Nginx config
echo "
--- MANUAL STEP ---
Add to /etc/nginx/sites-available/api.monpermiscpf.com:

1. In the http block (if not already there):
   limit_req_zone \$binary_remote_addr zone=health:1m rate=10r/h;

2. In the server block:
   location /health-report {
       limit_req zone=health burst=2 nodelay;
       proxy_pass http://127.0.0.1:3850;
       proxy_set_header Host \$host;
       proxy_set_header X-Real-IP \$remote_addr;
       proxy_connect_timeout 15s;
       proxy_read_timeout 30s;
   }

3. Test and reload:
   nginx -t && systemctl reload nginx
"

echo "=== Done ==="
echo "Test: curl -H 'Authorization: Bearer 6f20ade18b199808ca76f7f639565ddd9dcce828e1ad6ec3cd6f11a34441f905' https://api.monpermiscpf.com/health-report"
