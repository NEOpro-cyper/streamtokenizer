# StreamVault 🔐
> Secure URL masking & proxy service — deploy on Vercel, store on your own PostgreSQL VPS

## How It Works

1. You call `POST /api/shorten` with your real URL (e.g. an m3u8 stream link)
2. The URL is **AES-256-GCM encrypted** and stored in your PostgreSQL database
3. You get back a random token URL like `https://yourdomain.com/api/resolve/a3f9b2c1d8e4...`
4. Only domains in your `ALLOWED_DOMAINS` whitelist can call `/api/resolve/` — all others get **403 Forbidden**
5. The original URL **never appears** in any client-side code or network response to unauthorised callers

---

## Setup Guide

### 1. PostgreSQL on your VPS

```sql
-- SSH into your VPS, then:
sudo -u postgres psql

CREATE USER streamuser WITH PASSWORD 'yourpassword';
CREATE DATABASE streamvault OWNER streamuser;
GRANT ALL PRIVILEGES ON DATABASE streamvault TO streamuser;
\q
```

Make sure port **5432** is accessible from Vercel's IP ranges (or use SSL tunnel).
To allow external connections, edit `/etc/postgresql/*/main/pg_hba.conf` and add:
```
host  streamvault  streamuser  0.0.0.0/0  md5
```
Then in `postgresql.conf` set `listen_addresses = '*'` and restart:
```bash
sudo systemctl restart postgresql
```

> **Tip:** Use `POSTGRES_SSL=true` in your env if your VPS has SSL configured.

### 2. Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Clone / enter project
cd stream-vault

# Deploy
vercel

# Set environment variables (or add via Vercel Dashboard → Settings → Environment Variables)
vercel env add POSTGRES_URL
vercel env add SECRET_KEY
vercel env add ADMIN_PASSWORD
vercel env add ADMIN_API_KEY
vercel env add ALLOWED_DOMAINS
vercel env add DEFAULT_EXPIRY_HOURS
vercel env add BASE_URL

# Redeploy after setting env vars
vercel --prod
```

### 3. Initialize the Database

After deploying, run this once to create the table:

```bash
curl -X GET "https://yourdomain.vercel.app/api/init?apiKey=YOUR_ADMIN_API_KEY"
```

You should see: `{"success":true,"message":"Database tables created successfully"}`

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `POSTGRES_URL` | ✅ | Full PostgreSQL connection string |
| `SECRET_KEY` | ✅ | 32+ char random secret for AES encryption |
| `ADMIN_API_KEY` | ✅ | API key to protect `POST /api/shorten` |
| `ADMIN_PASSWORD` | ✅ | Password for `/admin` dashboard |
| `ALLOWED_DOMAINS` | ✅ | Comma-separated whitelisted domains |
| `DEFAULT_EXPIRY_HOURS` | ❌ | Default token TTL in hours (default: 24) |
| `BASE_URL` | ❌ | Your Vercel domain e.g. `https://vault.yourdomain.com` |
| `POSTGRES_SSL` | ❌ | Set `true` if your VPS uses SSL |

**Generate a SECRET_KEY:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## API Reference

### `POST /api/shorten`
Create a masked URL token.

**Headers:**
```
Content-Type: application/json
x-api-key: YOUR_ADMIN_API_KEY
```

**Body:**
```json
{
  "url": "https://hls.example.com/stream.m3u8?token=secret123",
  "label": "Movie 4K Stream",
  "expiresInHours": 6
}
```

**Response:**
```json
{
  "success": true,
  "token": "a3f9b2c1d8e47a0b5c2d9e6f",
  "maskedUrl": "https://yourdomain.com/api/resolve/a3f9b2c1d8e47a0b5c2d9e6f",
  "label": "Movie 4K Stream",
  "expiresAt": "2025-01-01T06:00:00.000Z",
  "createdAt": "2025-01-01T00:00:00.000Z"
}
```

---

### `GET /api/resolve/:token`
Resolve a token to its original URL.

**Requirements:** Request must come from an `ALLOWED_DOMAINS` origin (Origin or Referer header).

**Response (success):**
```json
{
  "success": true,
  "url": "https://hls.example.com/stream.m3u8?token=secret123",
  "expiresAt": "2025-01-01T06:00:00.000Z"
}
```

**Response (forbidden — wrong domain):**
```json
{ "error": "Forbidden: domain not whitelisted" }
```

---

## Using in Your Frontend

```javascript
// In your whitelisted frontend app:
async function getStreamUrl(token) {
  const res = await fetch(`https://vault.yourdomain.com/api/resolve/${token}`, {
    // The Origin header is set automatically by the browser
  });
  const { url } = await res.json();
  // Use url with your video player — HLS.js, Video.js, etc.
  return url;
}
```

```javascript
// With HLS.js example:
const token = "a3f9b2c1d8e47a0b5c2d9e6f";
const { url } = await fetch(`/api/resolve/${token}`).then(r => r.json());

const hls = new Hls();
hls.loadSource(url);
hls.attachMedia(videoElement);
```

---

## Admin Dashboard

Visit `https://yourdomain.com/admin` and enter your `ADMIN_PASSWORD`.

Features:
- 📊 Live stats (active tokens, total hits, revoked, expired)
- ➕ Create masked URLs with label + expiry
- 🔍 Search tokens by label or token string
- ❌ Revoke any token instantly
- 🧹 Clean up expired tokens

---

## Security Architecture

```
Client (your site)          Vercel Edge             Your VPS (PostgreSQL)
─────────────────           ─────────────           ─────────────────────
Request token URL    →      Check Origin header      
                            against ALLOWED_DOMAINS  
                    ←  403  if not whitelisted       
                            ↓ if whitelisted          
                            Fetch encrypted blob  →  SELECT encrypted_url
                                                  ←  AES-256-GCM blob
                            Decrypt in memory        
                    ←  URL  Return real URL           
                                                      UPDATE hit_count
```

- The real URL is **never stored in plaintext** — always AES-256-GCM encrypted
- The `SECRET_KEY` lives only in Vercel's encrypted env store
- Even if your database is breached, URLs cannot be read without the key
- Domain whitelist enforced via `Origin`/`Referer` headers on every resolve request
- Tokens auto-expire and can be manually revoked from the dashboard
