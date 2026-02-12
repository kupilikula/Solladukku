# Solmaalai Deployment Guide

Deploy to a single Digital Ocean droplet with nginx + PM2.

## Prerequisites

- Ubuntu 22.04 droplet (2GB+ RAM recommended for 16 flookup processes)
- Domain name pointing to the droplet's IP

## 1. Install Dependencies

```bash
# System packages
sudo apt update && sudo apt install -y nginx nodejs npm certbot python3-certbot-nginx

# foma (provides flookup for Tamil word validation)
sudo apt install -y foma-bin

# PM2 (process manager)
sudo npm install -g pm2

# Ensure Node.js 18+
node --version
```

## 2. Clone and Build

```bash
cd /var/www
git clone <your-repo-url> solmaalai
cd solmaalai

# Install and build React app
npm install
npm run build

# Install and setup server
cd server
npm install
npm run setup    # Downloads FST models
cd ..
```

## 3. Configure Environment

```bash
# Create server .env
cat > server/.env << 'EOF'
PORT=8000
ALLOWED_ORIGINS=https://yourdomain.com
EOF
```

Update these files with your domain:
- `.env.production`: Replace `DOMAIN_PLACEHOLDER` with your domain
- `ecosystem.config.js`: Replace `DOMAIN_PLACEHOLDER` in `ALLOWED_ORIGINS`
- Rebuild after `.env.production` change: `npm run build`

## 4. Start Server with PM2

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup    # Follow the instructions it prints
```

## 5. Configure nginx

```bash
# Copy config (replace DOMAIN_PLACEHOLDER first)
sudo cp deploy/nginx.conf /etc/nginx/sites-available/solmaalai
sudo sed -i 's/DOMAIN_PLACEHOLDER/yourdomain.com/g' /etc/nginx/sites-available/solmaalai

# Enable site
sudo ln -sf /etc/nginx/sites-available/solmaalai /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Test and restart
sudo nginx -t
sudo systemctl restart nginx
```

## 6. SSL Certificate

```bash
sudo certbot --nginx -d yourdomain.com
```

## 7. Verification Checklist

- [ ] `https://yourdomain.com` loads the React app
- [ ] Browser console shows WebSocket connecting to `wss://yourdomain.com/ws/...`
- [ ] Open two tabs — multiplayer works (tiles, turns, chat)
- [ ] Copy invite link from one tab, open in incognito — joins same game
- [ ] Check Network tab: `tamil_dictionary.txt` is gzip-compressed (~25MB)
- [ ] `pm2 status` shows the server running
- [ ] `pm2 logs` shows clean output

## Updating

```bash
cd /var/www/solmaalai
git pull
npm install && npm run build
cd server && npm install && cd ..
pm2 restart solmaalai-server
```
