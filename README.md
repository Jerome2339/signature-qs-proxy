# Signature QS Proxy

A lightweight Node.js proxy that sits between your beta HTML tool and the Anthropic API.
It adds your API key server-side so it never appears in the browser.

## How it works

```
Browser (beta.html)  →  POST /analyse-drawing  →  This proxy  →  Anthropic API
                    ←  JSON extracted dims     ←               ←
```

## Deploy to Render (free, 5 minutes)

### Step 1 — Push to GitHub
1. Create a new GitHub repo called `signature-qs-proxy`
2. Upload all files in this folder to it (drag and drop on GitHub works fine)

### Step 2 — Deploy on Render
1. Go to [render.com](https://render.com) and sign up (free)
2. Click **New → Web Service**
3. Connect your GitHub repo
4. Render detects the `render.yaml` automatically — click **Deploy**
5. Once deployed, go to **Environment → Environment Variables**
6. Add: `ANTHROPIC_API_KEY` = your key from [console.anthropic.com](https://console.anthropic.com)
7. Click **Save** — Render restarts automatically

Your proxy URL will be something like:
`https://signature-qs-proxy.onrender.com`

### Step 3 — Update your beta.html
In the beta HTML file, find this line near the top of the Materials JS:

```javascript
const MX_PROXY_URL = 'https://YOUR-PROXY-URL.onrender.com';
```

Replace with your actual Render URL.

That's it — the AI drawing upload will work.

## Local development

```bash
npm install
cp .env.example .env
# Edit .env and add your API key
npm run dev
```

## API endpoints

### GET /health
Returns `{"status":"ok"}` — use to check the proxy is running.

### POST /analyse-drawing
Accepts: `multipart/form-data` with field `drawings` (one or more files)
Returns: `{"success":true,"data":{...extracted dimensions...}}`

Supported file types: PDF, PNG, JPG, WebP (max 20MB per file)

## Notes

- The free Render tier spins down after 15 minutes of inactivity
  — the first request after idle takes ~30 seconds to wake up
  — subsequent requests are instant
- Your API key is stored as a Render environment variable, never in code
- CORS is configured to allow your Netlify domain automatically
