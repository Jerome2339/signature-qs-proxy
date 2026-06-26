const express = require('express');
const multer = require('multer');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

// ── PREFERRED SUPPLIERS (configured by Signature Construction) ────────────
// Client just toggles which type they want - emails are pre-configured here
const SUPPLIER_EMAILS = {
  builders:  process.env.BUILDERS_MERCHANT_EMAIL  || '',
  kitchen:   process.env.KITCHEN_SUPPLIER_EMAIL   || '',
  bathroom:  process.env.BATHROOM_SUPPLIER_EMAIL  || '',
  tiling:    process.env.TILING_SUPPLIER_EMAIL    || '',
  windows:   process.env.WINDOWS_SUPPLIER_EMAIL   || '',
};
const RESEND_KEY = process.env.RESEND_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;       // e.g. https://xxxx.supabase.co
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY; // service_role key (server-side only)

// ── COST TRACKING + PER-BRANCH CAP (env-overridable) ──────────────────────
// Per-branch monthly cap on drawing analyses (guards against runaway AI spend / abuse).
// Set well above expected use (~4/mo). 0 disables the cap.
const BRANCH_MONTHLY_CAP = parseInt(process.env.BRANCH_MONTHLY_CAP || '50', 10);
// Unit costs used only to estimate cost-per-lookup. Set to current rates.
// Anthropic Claude (Sonnet) USD per 1M tokens; Google Document AI USD per page.
const PRICE_IN_PER_MTOK  = parseFloat(process.env.PRICE_IN_PER_MTOK  || '3');   // input  $/1M tok
const PRICE_OUT_PER_MTOK = parseFloat(process.env.PRICE_OUT_PER_MTOK || '15');  // output $/1M tok
const DOCAI_PRICE_PER_PAGE = parseFloat(process.env.DOCAI_PRICE_PER_PAGE || '0.03'); // $/page

// ── SANDBOX MODE (set SANDBOX_MODE=true only on the evaluation deployment) ──
// Runs the same code against a separate database, with a hard total trial cap.
const SANDBOX_MODE = process.env.SANDBOX_MODE === 'true';
const SANDBOX_TOTAL_CAP = parseInt(process.env.SANDBOX_TOTAL_CAP || '25', 10);

// Helper: insert a usage record into Supabase
try {
  const { setGlobalDispatcher, Agent } = require('undici');
  setGlobalDispatcher(new Agent({ headersTimeout: 0, bodyTimeout: 0, keepAliveTimeout: 10000, pipelining: 0 }));
  console.log('undici read timeouts disabled');
} catch (e) { console.warn('undici tuning unavailable (continuing without it):', e.message); }

// Non-streaming Anthropic calls send no bytes until generation finishes (20s+ for a
// full schedule read), so an idle-connection timeout on the path drops them as
// "Premature close". Streaming keeps bytes flowing continuously and defeats that.
// undici (Node's global fetch) premature-closes reading Cloudflare-fronted response bodies
// on this instance. The built-in https module uses a different HTTP stack and gets through.
function anthropicStream(body, usageOut) {
  const https = require('https');
  const payload = JSON.stringify({ ...body, stream: true });
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'pdfs-2024-09-25',
      },
    }, (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        let errBody = '';
        res.setEncoding('utf8');
        res.on('data', d => { errBody += d; });
        res.on('end', () => reject(new Error('Claude API ' + res.statusCode + ': ' + errBody.slice(0, 300))));
        return;
      }
      let buf = '', text = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        buf += chunk;
        let nl;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line.startsWith('data:')) continue;
          const p = line.slice(5).trim();
          if (!p || p === '[DONE]') continue;
          try {
            const evt = JSON.parse(p);
            if (evt.type === 'content_block_delta' && evt.delta && evt.delta.text) text += evt.delta.text;
            else if (usageOut && evt.type === 'message_start' && evt.message && evt.message.usage) { usageOut.in_tokens = evt.message.usage.input_tokens || 0; usageOut.model = evt.message.model || (body && body.model) || ''; }
            else if (usageOut && evt.type === 'message_delta' && evt.usage) { usageOut.out_tokens = evt.usage.output_tokens || usageOut.out_tokens || 0; }
          } catch (e) { /* ignore keep-alive / non-JSON lines */ }
        }
      });
      res.on('end', () => resolve(text));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(120000, () => req.destroy(new Error('Anthropic request timeout (120s)')));
    req.write(payload);
    req.end();
  });
}

// Supabase sits behind Cloudflare; undici (global fetch) premature-closes reading its
// response bodies on this host. Route Supabase calls through the built-in https module.
function httpsRequest(urlString, { method = 'GET', headers = {}, body = null } = {}) {
  const httpsLib = require('https');
  return new Promise((resolve, reject) => {
    const u = new URL(urlString);
    const opts = { hostname: u.hostname, path: u.pathname + u.search, method, headers: { ...headers } };
    if (body != null) opts.headers['Content-Length'] = Buffer.byteLength(body);
    const req = httpsLib.request(opts, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', d => { data += d; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: data }));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('Supabase request timeout (30s)')));
    if (body != null) req.write(body);
    req.end();
  });
}

async function supabaseInsert(record) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  try {
    const r = await httpsRequest(`${SUPABASE_URL}/rest/v1/usage_log`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(record)
    });
    if (r.status < 200 || r.status >= 300) { console.error('Supabase insert failed:', r.status, r.text.slice(0, 200)); return null; }
    try { return JSON.parse(r.text); } catch (e) { return null; }
  } catch (e) { console.error('Supabase insert error:', e.message); return null; }
}

// Insert a per-lookup cost record into the cost_log table (non-fatal if it fails).
async function costLogInsert(record) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  try {
    const r = await httpsRequest(`${SUPABASE_URL}/rest/v1/cost_log`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify(record)
    });
    if (r.status < 200 || r.status >= 300) console.error('cost_log insert failed:', r.status, r.text.slice(0,160));
  } catch (e) { console.error('cost_log insert error:', e.message); }
}

// All-time row count for a table (used by the sandbox trial cap).
async function supabaseTotalCount(table) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return 0;
  const tbl = table || 'cost_log';
  const r = await httpsRequest(`${SUPABASE_URL}/rest/v1/${tbl}?select=id`, {
    method: 'GET',
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Prefer': 'count=exact', 'Range': '0-0' }
  }).catch(() => null);
  if (!r || r.status < 200 || r.status >= 300) return 0;
  const cr = r.headers['content-range'];
  if (cr && cr.includes('/')) return parseInt(cr.split('/')[1]) || 0;
  return 0;
}

// Helper: count records for current month
async function supabaseMonthCount(client, branch, table) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return 0;
  const tbl = table || 'usage_log';
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const url = `${SUPABASE_URL}/rest/v1/${tbl}?ts=gte.${monthStart}`
    + (client ? `&client=eq.${encodeURIComponent(client)}` : '')
    + (branch ? `&branch=eq.${encodeURIComponent(branch)}` : '');
  const r = await httpsRequest(url, {
    method: 'GET',
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Prefer': 'count=exact', 'Range': '0-0' }
  }).catch(() => null);
  if (!r || r.status < 200 || r.status >= 300) return 0;
  const cr = r.headers['content-range']; // format: 0-0/N
  if (cr && cr.includes('/')) return parseInt(cr.split('/')[1]) || 0;
  return 0;
}

// Helper: fetch records for a given month offset (0 = this month, -1 = last month)
async function supabaseMonthRecords(monthOffset, table) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return [];
  const tbl = table || 'usage_log';
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1).toISOString();
  const end = new Date(now.getFullYear(), now.getMonth() + monthOffset + 1, 1).toISOString();
  const url = `${SUPABASE_URL}/rest/v1/${tbl}?ts=gte.${start}&ts=lt.${end}&order=ts.asc`;
  const r = await httpsRequest(url, {
    method: 'GET',
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
  }).catch(() => null);
  if (!r || r.status < 200 || r.status >= 300) return [];
  try { return JSON.parse(r.text); } catch (e) { return []; }
}
const GOOGLE_SA_KEY = process.env.GOOGLE_SERVICE_ACCOUNT_KEY; // JSON string of service account key
const DOCAI_PROCESSOR = 'https://eu-documentai.googleapis.com/v1/projects/843787881834/locations/eu/processors/b39e11de77cfc99e/processorVersions/pretrained-foundation-model-v1.5-pro-2025-06-20:process';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.get('/health', (req, res) => res.json({ status: 'ok', version: '7.13.0', sandbox: SANDBOX_MODE, docai: !!GOOGLE_SA_KEY }));
const PROXY_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
setInterval(() => fetch(`${PROXY_URL}/health`).catch(() => {}), 10 * 60 * 1000);

// ── ROOM CLASSIFICATION ──────────────────────────────────────────────────
// Normalise an extracted room into one of our standard buckets.
// Used so the materials tool can count bathrooms/kitchens/utilities reliably,
// regardless of exactly how the model labels them.
function classifyRoomType(rawName, rawType) {
  const s = ((rawType || '') + ' ' + (rawName || '')).toLowerCase();
  if (/cloak|\bw[\.\/]?c\b|powder|toilet/.test(s)) return 'cloakroom';
  if (/en[-\s]?suite|ensuite/.test(s)) return 'ensuite';
  if (/bath|shower\s?room/.test(s)) return 'bathroom';
  if (/utility|laundry/.test(s)) return 'utility';
  if (/kitchen/.test(s)) return 'kitchen';
  if (/bed/.test(s)) return 'bedroom';
  if (/living|lounge|sitting|family\s?room/.test(s)) return 'living';
  if (/dining/.test(s)) return 'dining';
  if (/hall|landing|lobby|porch/.test(s)) return 'circulation';
  if (/garage/.test(s)) return 'garage';
  if (/office|study/.test(s)) return 'study';
  return 'other';
}

// Normalise a raw rooms array (from any extraction pass) into typed rooms.
function normaliseRooms(rawRooms) {
  if (!Array.isArray(rawRooms)) return [];
  return rawRooms.map(r => {
    if (typeof r === 'string') {
      return { name: r, floor: null, type: classifyRoomType(r, null) };
    }
    return {
      name: r.name || r.label || '',
      floor: r.floor || null,
      type: r.type && r.type !== 'null' ? classifyRoomType(r.name, r.type) : classifyRoomType(r.name, null)
    };
  }).filter(r => r.name);
}

// ── GOOGLE AUTH ────────────────────────────────────────────────────────────
let cachedToken = null;
let tokenExpiry = 0;

async function getGoogleToken() {
  if (cachedToken && Date.now() < tokenExpiry - 60000) return cachedToken;

  const sa = JSON.parse(GOOGLE_SA_KEY);
  const now = Math.floor(Date.now() / 1000);

  // Build JWT
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  })).toString('base64url');

  const crypto = require('crypto');
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(`${header}.${payload}`);
  const sig = sign.sign(sa.private_key, 'base64url');
  const jwt = `${header}.${payload}.${sig}`;

  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Connection': 'close' },
        body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
      });
      const tokenData = await tokenRes.json();
      if (!tokenData.access_token) throw new Error('Failed to get Google token: ' + JSON.stringify(tokenData));
      cachedToken = tokenData.access_token;
      tokenExpiry = Date.now() + (tokenData.expires_in * 1000);
      return cachedToken;
    } catch (e) {
      lastErr = e;
      console.warn(`Google token fetch attempt ${attempt}/3 failed: ${e.message}`);
      if (attempt < 3) await new Promise(r => setTimeout(r, 400 * attempt));
    }
  }
  throw lastErr;
}

// ── ANALYSE DRAWING ────────────────────────────────────────────────────────
const { parseVectorPDF } = require('./vectorParse');

app.post('/analyse-drawing', upload.array('drawings', 10), async (req, res) => {
  if (!req.files || !req.files.length) return res.status(400).json({ error: 'No files uploaded' });

  // Sandbox trial cap — hard total limit on the evaluation deployment.
  if (SANDBOX_MODE) {
    const total = await supabaseTotalCount('cost_log').catch(() => 0);
    if (total >= SANDBOX_TOTAL_CAP) {
      return res.status(429).json({ error: 'sandbox_limit', message: `This sandbox has reached its trial limit of ${SANDBOX_TOTAL_CAP} estimates. Please contact Signature to extend the trial.` });
    }
  }

  // Per-branch monthly cap — guards against runaway AI spend / abuse. Skipped if no branch sent.
  const reqBranch = (req.body && req.body.branch) || '';
  const reqClient = (req.body && req.body.client) || '';
  if (BRANCH_MONTHLY_CAP > 0 && reqBranch) {
    const used = await supabaseMonthCount(reqClient, reqBranch, 'cost_log').catch(() => 0);
    if (used >= BRANCH_MONTHLY_CAP) {
      console.warn(`Branch ${reqBranch} hit monthly cap (${used}/${BRANCH_MONTHLY_CAP})`);
      return res.status(429).json({ error: 'monthly_limit', message: `This branch has reached its monthly limit of ${BRANCH_MONTHLY_CAP} estimates. Please contact your administrator.` });
    }
  }
  const _costT0 = Date.now();
  let docaiPages = 0;
  const aiUsage = {};

  // If no Google key, fall back to Claude
  if (!GOOGLE_SA_KEY) {
    console.log('No Google SA key — falling back to Claude');
    return analyseWithClaude(req, res);
  }

  try {
    const results = [];

    for (const file of req.files) {
      const b64 = file.buffer.toString('base64');
      const mimeType = file.mimetype.toLowerCase().includes('pdf') ? 'application/pdf' : file.mimetype;

      console.log(`Processing ${file.originalname} with Google Document AI...`);
      let docaiData = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const token = await getGoogleToken();
          const docaiRes = await fetch(DOCAI_PROCESSOR, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Connection': 'close' },
            body: JSON.stringify({ skipHumanReview: true, rawDocument: { mimeType, content: b64 } }),
          });
          if (!docaiRes.ok) {
            const errTxt = await docaiRes.text().catch(() => '');
            throw new Error(`Document AI ${docaiRes.status}: ${errTxt.slice(0, 300)}`);
          }
          docaiData = await docaiRes.json();
          break;
        } catch (e) {
          console.warn(`Document AI attempt ${attempt}/3 for ${file.originalname} failed: ${e.message}`);
          if (attempt < 3) await new Promise(r => setTimeout(r, 1500 * attempt));
        }
      }
      if (docaiData) {
        try { docaiPages += (docaiData.document && Array.isArray(docaiData.document.pages)) ? docaiData.document.pages.length : 1; } catch (e) {}
        results.push({ file: file.originalname, data: docaiData });
      } else {
        console.error(`Document AI gave up on ${file.originalname} after 3 attempts — will fall back to Claude`);
      }
    }

    if (!results.length) {
      console.log('Document AI returned no results — falling back to Claude');
      return analyseWithClaude(req, res);
    }

    // Parse Document AI response into our standard format
    const merged = mergeDocAIResults(results);
    console.log(`Document AI extraction complete: ${merged.walls?.length || 0} walls, roof pitch: ${merged.roof?.pitch_degrees}°`);

    // Vector pass (short-circuit): on a CAD-exported PDF with a schedule, read the
    // architect's actual text deterministically and skip the Claude schedule pass.
    // DocAI geometry (walls etc.) is kept regardless. Falls through on raster/no-schedule/error.
    let vectorUsed = false;
    try {
      const pdfFile = (req.files || []).find(f => (f.mimetype || '').toLowerCase().includes('pdf'));
      if (pdfFile) {
        const vec = await parseVectorPDF(pdfFile.buffer);
        if (vec && vec.usable) {
          merged.openings = vec.openings;
          merged.extra.door_count = vec.door_count;
          merged.extra.window_count = vec.window_count;
          if (vec.rooms && vec.rooms.length) merged.extra.rooms = normaliseRooms(vec.rooms);
          if (vec.floor_areas && vec.floor_areas.total_m2) merged.extra.floor_areas = vec.floor_areas;
          if (vec.roof_pitch) merged.roof.pitch_degrees = vec.roof_pitch;
          vectorUsed = true;
          console.log(`Vector parse: ${vec.window_count} windows, ${vec.door_count} doors, ` +
            `${(vec.rooms || []).length} rooms, GIFA ${vec.floor_areas?.total_m2 || '?'}m² — Claude schedule pass skipped`);
        } else {
          console.log(`Vector parse not usable (${vec && vec.vector ? 'no/partial schedule' : 'raster / no text layer'}) — using Claude schedule pass`);
        }
      }
    } catch (e) {
      console.warn('Vector parse failed (non-critical), falling back to Claude schedule pass:', e.message);
    }

    // Pass 2: Use Claude to extract door/window schedules + room schedule (tables Claude reads reliably)
    if (!vectorUsed && ANTHROPIC_KEY && req.files.length > 0) {
      try {
        console.log('Running schedule extraction pass with Claude...');
        const scheduleData = await extractSchedulesWithClaude(req.files, aiUsage);
        if (scheduleData && (scheduleData.doors?.length > 0 || scheduleData.windows?.length > 0)) {
          const doors = scheduleData.doors || [];
          const windows = scheduleData.windows || [];
          merged.openings = [
            ...doors.map(d => ({
              label: `${d.ref||'Door'} — ${d.location||''}`,
              type: d.type === 'bifold' || d.type === 'bi-fold' ? 'bifold' : 'door',
              width_m: d.structural_w_mm ? d.structural_w_mm/1000 : null,
              height_m: d.structural_h_mm ? d.structural_h_mm/1000 : 2.1,
              qty: 1,
            })),
            ...windows.map(w => ({
              label: `${w.ref||'Window'} — ${w.location||''}${w.type==='bay'?' (Bay)':''}`,
              type: 'window',
              width_m: w.structural_w_mm ? w.structural_w_mm/1000 : null,
              height_m: w.structural_h_mm ? w.structural_h_mm/1000 : 1.05,
              qty: 1,
            })),
          ].filter(o => o.width_m);
          merged.extra.door_count = doors.length;
          merged.extra.window_count = windows.length;
          console.log(`Schedule extraction: ${doors.length} doors, ${windows.length} windows`);
        }
        // Room schedule — merge in whenever the pass returns rooms (independent of door/window result)
        if (scheduleData && Array.isArray(scheduleData.rooms) && scheduleData.rooms.length > 0) {
          merged.extra.rooms = normaliseRooms(scheduleData.rooms);
          const counts = merged.extra.rooms.reduce((a, r) => { a[r.type] = (a[r.type]||0) + 1; return a; }, {});
          console.log(`Room extraction: ${merged.extra.rooms.length} rooms — ` +
            `bath ${counts.bathroom||0}, ensuite ${counts.ensuite||0}, cloak ${counts.cloakroom||0}, ` +
            `kitchen ${counts.kitchen||0}, utility ${counts.utility||0}`);
        }
      } catch(err) {
        console.warn('Schedule extraction failed (non-critical):', err.message);
      }
    }

    // Cost tracking (non-fatal): record what this lookup actually cost to run.
    try {
      const inTok = aiUsage.in_tokens || 0, outTok = aiUsage.out_tokens || 0;
      const aiCost = (inTok / 1e6) * PRICE_IN_PER_MTOK + (outTok / 1e6) * PRICE_OUT_PER_MTOK;
      const docaiCost = docaiPages * DOCAI_PRICE_PER_PAGE;
      await costLogInsert({
        ts: new Date().toISOString(),
        branch: reqBranch || null, client: reqClient || null,
        parse_path: vectorUsed ? 'vector' : 'claude',
        docai_pages: docaiPages, ai_in_tokens: inTok, ai_out_tokens: outTok,
        ai_cost: +aiCost.toFixed(4), docai_cost: +docaiCost.toFixed(4),
        total_cost: +(aiCost + docaiCost).toFixed(4), ms: Date.now() - _costT0,
      });
    } catch (e) { console.warn('cost log skipped:', e.message); }

    res.json({ success: true, data: merged, source: vectorUsed ? 'vector-pdf + google-document-ai' : 'google-document-ai' });

  } catch (err) {
    console.error('Document AI error:', err.message);
    console.log('Falling back to Claude...');
    return analyseWithClaude(req, res);
  }
});

function mergeDocAIResults(results) {
  // Extract entities from all Document AI responses
  const allEntities = {};

  for (const result of results) {
    const entities = result.data?.document?.entities || [];
    for (const entity of entities) {
      const type = entity.type;
      const value = entity.mentionText || entity.normalizedValue?.text || '';
      if (!value) continue;

      // Keep the highest confidence value for each field
      if (!allEntities[type] || (entity.confidence || 0) > (allEntities[type].confidence || 0)) {
        allEntities[type] = { value, confidence: entity.confidence || 0 };
      }
    }
  }

  console.log('=== DOCUMENT AI ENTITIES ===');
  Object.entries(allEntities).forEach(([key, val]) => {
    console.log(`  ${key}: "${val.value}" (confidence: ${(val.confidence*100).toFixed(0)}%)`);
  });
  console.log('============================');

  // Helper to get numeric value
  const getNum = (key) => {
    const v = allEntities[key]?.value;
    if (!v) return null;
    const n = parseFloat(v.replace(/[^0-9.]/g, ''));
    return isNaN(n) ? null : n;
  };
  const getStr = (key) => allEntities[key]?.value || null;

  const groundArea = getNum('floor_area_ground_m2');
  const firstArea = getNum('floor_area_first_m2');
  const totalArea = getNum('floor_area_total_m2');
  const lengthMm = getNum('overall_length_mm');
  const widthMm = getNum('overall_width_mm');
  const ceilGroundMm = getNum('ceiling_height_ground_mm') || getNum('ceiling_height_gr');
  const ceilFirstMm = getNum('ceiling_height_first_mm') || getNum('ceiling_height_fir') || getNum('ceiling_height_fi');
  const overallHeightMm = getNum('overall_height_mm'); // full external wall height from DPC to eaves/ridge
  // Wall height for external wall area: use overall building height if available (most accurate for 2-storey)
  // Otherwise estimate from ceiling heights + floor structure
  const extWallHeightMm = overallHeightMm || 
    (ceilGroundMm && ceilFirstMm ? ceilGroundMm + ceilFirstMm + 300 : // +300mm for floor structure
     ceilGroundMm ? ceilGroundMm : 2400);

  // Gable triangle area for pitched roofs
  // Ridge height = (half span) x tan(pitch)
  // Gable area = 0.5 x width x ridge height x 2 gables
  const pitchDeg = getNum('roof_pitch_degrees') || 35;
  const pitchRad = pitchDeg * Math.PI / 180;
  const halfSpanMm = widthMm ? widthMm / 2 : (lengthMm ? lengthMm / 2 : 5000);
  const ridgeHeightMm = halfSpanMm * Math.tan(pitchRad);
  const gableAreaM2 = widthMm ? 2 * 0.5 * (widthMm / 1000) * (ridgeHeightMm / 1000) : 0;
  const roofPitch = getNum('roof_pitch_degrees');
  const wallOuterMm = getNum('wall_outer_leaf_mm');
  const wallCavityMm = getNum('wall_cavity_mm');
  const wallInnerMm = getNum('wall_inner_leaf_mm');

  const missing = [];
  if (!lengthMm) missing.push('Overall building length — enter manually in Dimensions tab');
  if (!widthMm) missing.push('Overall building width — enter manually in Dimensions tab');
  if (!roofPitch) missing.push('Roof pitch angle — enter manually in Spec & Roof tab');

  const notes = [];
  if (groundArea) notes.push(`Floor areas — Ground: ${groundArea}m², First: ${firstArea || '?'}m², Total: ${totalArea || '?'}m²`);
  if (getStr('wall_construction')) notes.push(`Wall construction: ${getStr('wall_construction')}`);
  if (getStr('house_type')) notes.push(`House type: ${getStr('house_type')}`);

  return {
    project_name: getStr('project_name'),
    drawing_type: ['floor plan', 'elevation', 'section', 'schedule'],

    floor: {
      length_m: lengthMm ? lengthMm / 1000 : null,
      width_m: widthMm ? widthMm / 1000 : null,
      area_m2: groundArea && totalArea && groundArea < totalArea ? groundArea : groundArea || totalArea,
      ceiling_height_m: ceilGroundMm ? ceilGroundMm / 1000 : null,
      ext_wall_height_m: extWallHeightMm ? extWallHeightMm / 1000 : null,
    },

    walls: lengthMm && widthMm ? [
      { label: 'Front wall', length_m: lengthMm / 1000, height_m: extWallHeightMm / 1000, is_external: true },
      { label: 'Rear wall', length_m: lengthMm / 1000, height_m: extWallHeightMm / 1000, is_external: true },
      { label: 'Left gable wall', length_m: widthMm / 1000, height_m: extWallHeightMm / 1000, is_external: true, gable_area_m2: gableAreaM2 / 2 },
      { label: 'Right gable wall', length_m: widthMm / 1000, height_m: extWallHeightMm / 1000, is_external: true, gable_area_m2: gableAreaM2 / 2 },
    ] : [],

    openings: [], // Door/window schedule extraction added once foundation model tested

    roof: {
      type: getStr('roof_type') || 'pitched',
      pitch_degrees: roofPitch,
      span_m: widthMm ? widthMm / 1000 : null,
      length_m: lengthMm ? lengthMm / 1000 : null,
      overhang_m: null,
    },

    wall_construction: (() => {
      const wc = (getStr('wall_construction') || '').toLowerCase();
      // Map common blockwork legend labels to standard types
      if (wc.includes('cavity') || wc.includes('brick') || wc.includes('block') || 
          wc.includes('aglite') || wc.includes('dense') || wc.includes('lightweight')) return 'cavity';
      if (wc.includes('timber') || wc.includes('stud') || wc.includes('frame')) return 'timber';
      if (wc.includes('solid')) return 'solid';
      return 'cavity'; // default for UK residential
    })(),
    floor_construction: getStr('floor_construction_ground') || 'concrete',

    extra: {
      house_type: getStr('house_type'),
      client: getStr('client') || getStr('project_name'),
      floor_areas: { ground_m2: groundArea, first_m2: firstArea, total_m2: totalArea },
      ceiling_heights: { 
        ground_floor_mm: ceilGroundMm, 
        first_floor_mm: ceilFirstMm,
        // Log what we found for debugging
      },
      wall_spec: {
        type: getStr('wall_construction') || 'cavity',
        outer_leaf: getStr('wall_outer_leaf'),
        outer_leaf_mm: wallOuterMm,
        cavity_mm: wallCavityMm,
        inner_leaf_mm: wallInnerMm,
      },
      internal_stud_mm: getNum('internal_stud_mm'),
      internal_board_mm: getNum('internal_board_mm'),
      rooms: [],
      door_count: 0,
      window_count: 0,
      raw_entities: allEntities,
    },

    confidence: {
      floor_dims: lengthMm && widthMm ? 'high' : 'low',
      wall_dims: lengthMm && widthMm ? 'medium' : 'low',
      openings: 'low',
      roof: roofPitch ? 'high' : 'low',
      construction_type: getStr('wall_construction') ? 'high' : 'low',
    },

    missing,
    notes,
  };
}

// ── CLAUDE FALLBACK ────────────────────────────────────────────────────────
async function analyseWithClaude(req, res) {
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'No API keys configured' });

  try {
    const fileParts = req.files.map(file => {
      const b64 = file.buffer.toString('base64');
      const ext = (file.originalname || '').split('.').pop().toLowerCase();
      const isPDF = file.mimetype.includes('pdf') || ext === 'pdf';
      if (isPDF) return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } };
      return { type: 'image', source: { type: 'base64', media_type: file.mimetype, data: b64 } };
    });

    fileParts.push({
      type: 'text',
      text: `You are a senior UK quantity surveyor. Extract ONLY what you can read with HIGH CONFIDENCE from these drawings. Return JSON only.

{
  "project_name": null,
  "house_type": null,
  "floor_areas": { "ground_m2": null, "first_m2": null, "total_m2": null },
  "ceiling_heights": { "ground_floor_mm": null, "first_floor_mm": null },
  "roof": { "type": "pitched/flat", "pitch_degrees": null },
  "wall_construction": { "type": "cavity/solid/timber", "outer_leaf": null, "outer_leaf_mm": null, "cavity_mm": null, "inner_leaf_mm": null },
  "floor_construction": { "ground": null, "upper": null },
  "doors": [{ "ref": null, "location": null, "structural_w_mm": null, "structural_h_mm": null }],
  "windows": [{ "ref": null, "location": null, "structural_w_mm": null, "structural_h_mm": null, "type": null }],
  "rooms": [{ "name": null, "floor": null, "type": null }],
  "notes": [],
  "cannot_determine": []
}

KEY RULES:
- Floor area table is in the title block — rows labelled GROUND/FIRST/TOTAL
- Roof pitch is the arc symbol at the eaves on section drawings (NOT staircase PITCH=41°)
- Door/window schedules are tables — read every row
- ROOMS: list every room labelled on the floor plans. For each, set "name" to the label as drawn (e.g. "En-suite 2") and "type" to ONE of: cloakroom, bathroom, ensuite, kitchen, utility, bedroom, living, dining, hall, garage, study, other. Classify any WC / W.C. / W/C / toilet / powder room as "cloakroom", any bath or shower room as "bathroom", en-suites as "ensuite", and laundry / utility rooms as "utility". Set "floor" to ground or first if known.
- Do NOT attempt overall building dimensions — user will enter manually`
    });

    let raw = null, lastErr;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const txt = await anthropicStream({ model: 'claude-sonnet-4-5', max_tokens: 4000, messages: [{ role: 'user', content: fileParts }] });
        raw = txt.replace(/```json|```/g, '').trim();
        break;
      } catch (e) {
        lastErr = e;
        console.warn(`Claude fallback attempt ${attempt}/3 failed: ${e.message}`);
        if (attempt < 3) await new Promise(r => setTimeout(r, 1500 * attempt));
      }
    }
    if (raw === null) throw lastErr;
    let parsed;
    try { parsed = JSON.parse(raw); } catch(e) { return res.status(502).json({ error: 'Could not parse response' }); }

    const fa = parsed.floor_areas || {};
    const ch = parsed.ceiling_heights || {};
    const roof = parsed.roof || {};
    const wc = parsed.wall_construction || {};

    const doors = (parsed.doors || []).filter(d => d.structural_w_mm);
    const windows = (parsed.windows || []).filter(w => w.structural_w_mm);
    const openings = [
      ...doors.map(d => ({ label: `${d.ref||'Door'} — ${d.location||''}`, type: 'door', width_m: d.structural_w_mm/1000, height_m: (d.structural_h_mm||2100)/1000, qty: 1 })),
      ...windows.map(w => ({ label: `${w.ref||'Window'} — ${w.location||''}${w.type==='bay'?' (Bay)':''}`, type: 'window', width_m: w.structural_w_mm/1000, height_m: (w.structural_h_mm||1050)/1000, qty: 1 })),
    ];

    res.json({
      success: true,
      source: 'claude-fallback',
      data: {
        project_name: parsed.project_name,
        floor: { length_m: null, width_m: null, area_m2: fa.ground_m2, ceiling_height_m: ch.ground_floor_mm ? ch.ground_floor_mm/1000 : null },
        walls: [],
        openings,
        roof: { type: roof.type || 'pitched', pitch_degrees: roof.pitch_degrees, span_m: null, length_m: null, overhang_m: null },
        wall_construction: wc.type || 'cavity',
        floor_construction: parsed.floor_construction?.ground || 'concrete',
        extra: {
          house_type: parsed.house_type,
          floor_areas: fa,
          ceiling_heights: ch,
          wall_spec: wc,
          rooms: normaliseRooms(parsed.rooms || []),
          door_count: doors.length,
          window_count: windows.length,
        },
        confidence: { floor_dims: 'low', wall_dims: 'low', openings: doors.length > 0 ? 'high' : 'low', roof: roof.pitch_degrees ? 'high' : 'low', construction_type: wc.type ? 'high' : 'low' },
        missing: ['Overall building length — enter manually', 'Overall building width — enter manually', ...(parsed.cannot_determine || [])],
        notes: parsed.notes || [],
      }
    });
  } catch(err) {
    res.status(500).json({ error: 'Extraction failed: ' + err.message });
  }
}


// ── CLAUDE SCHEDULE EXTRACTION ────────────────────────────────────────────
async function extractSchedulesWithClaude(files, usageOut) {
  const fileParts = files.map(file => {
    const b64 = file.buffer.toString('base64');
    const isPDF = file.mimetype.includes('pdf') || file.originalname.toLowerCase().endsWith('.pdf');
    if (isPDF) return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } };
    return { type: 'image', source: { type: 'base64', media_type: file.mimetype, data: b64 } };
  });

  fileParts.push({
    type: 'text',
    text: `Extract ALL door and window opening sizes, AND a list of every room, from these architectural drawings.

STEP 1 — FIND AND READ THE SCHEDULE (this overrides every other source):
Look carefully through ALL uploaded sheets for a Door Schedule and/or Window Schedule:
- A sheet titled "Schedules", "Schedule & Detail List", "Door & Window Schedule"
- A table with columns like: Door Reference, Location, Structural Opening, Leaf Size
- A table with columns like: Window Ref, Location, Structural Opening, Lintel Type
If such a schedule table exists, it is the ONLY valid source of opening sizes. You MUST:
- Return EVERY row of the table. If the schedule lists 17 windows, return 17 window objects — never skip, merge, sample or stop early. The number of window objects you return MUST equal the number of window rows in the table (same for doors).
- Read each "Structural Opening" cell EXACTLY as printed. It is WIDTH x HEIGHT in millimetres — the FIRST number is width, the SECOND is height. Examples: "885 x 1500" => structural_w_mm 885, structural_h_mm 1500; "460 x 900" => 460 wide, 900 high; "2515 x 1500" => 2515 wide, 1500 high.
- Use the Window Ref / Door Reference exactly as printed (W01, W02, D01...), and the Location text from that same row.
- Do NOT measure, scale, estimate or round any size from elevations or floor plans when a schedule row exists for that opening. Schedule values ALWAYS win, even if an elevation looks different. Never output a measured span such as 1809 or 4285 for a window the schedule lists as 885 or 910, and never fall back to a default height like 1050 when the schedule gives a height.
- If a size cell is genuinely blank or illegible, return null for that dimension — never substitute a guess or an elevation reading.

METHOD for reading the schedule accurately — follow exactly:
1. FIRST transcribe the ENTIRE schedule table verbatim, one row per line, in order, before writing any JSON. Format each row as: REF | LOCATION | STRUCTURAL OPENING (copy the cell character-for-character) | (other columns). This forces you to read each row on its own line.
2. THEN build the JSON from your transcription, taking each opening's ref, location and dimensions from the SAME transcribed row. Never take a dimension from a different row than its ref.
3. The number of window objects MUST equal the number of window rows you transcribed (same for doors). If they differ, re-read.
4. Sanity-check every width: a standard house window is rarely wider than ~2600mm. If you have written a width like 2085, 2100 or 4285 for a ref, RE-READ that cell — a 3-digit width (885, 910, 460) is easy to misread as a 4-digit one. Copy the digits exactly.

STEP 2 — IF THERE IS NO SCHEDULE TABLE (or it omits some openings), read every external opening from the ELEVATIONS, SECTIONS and FLOOR PLANS together. Most house drawings have NO window schedule, so this path must always return openings whenever any are drawn — never come back empty when openings are visible. Cross-reference the three drawing types:

ELEVATIONS — primary source for WIDTH, and to find and count every opening:
- Every external window and door appears on a front, rear or side elevation. Find and return ALL of them.
- Read the horizontal dimension string across each opening for its width in mm.
- If no width is printed, estimate by scaling against a known dimension on the same elevation (a door leaf ~900mm, the floor-to-floor height, or the overall building width).
- Do not double-count the same opening shown on more than one elevation.

SECTIONS — primary source for HEIGHT (cross-reference these; do NOT just default every window to 1050):
- Section drawings carry the vertical dimensions: cill (sill) height above finished floor, window head height, and door head height.
- Window height = head height − cill height. Read the actual figures from the section. Window heights genuinely vary — ~900mm for a small WC/utility window up to ~1500mm+ for full-height or feature windows — so READ them, don't assume.
- Door head height is typically ~2100mm; confirm from the section.
- Use the floor-to-ceiling height on the section as a sanity check on opening proportions.
- Only fall back to a typical height when NO section or elevation gives a readable vertical dimension, and even then vary it by opening type (shorter for WC/ensuite, taller for living spaces).

FLOOR PLANS — for reference codes, locations, and a count cross-check:
- Window/door reference codes (W01, D01...) next to symbols and swings.
- The room each opening sits in — use it for the location field.
- Door swing arcs confirm doors and give an approximate width (the arc chord).
- The opening count on the plans should roughly match the elevation count — use it to catch any you missed.

Combine them: WIDTH from the elevation, HEIGHT from the section, REF and LOCATION from the plan. Label W01, W02... for windows and D01, D02... for doors in the order found, and set source to "elevation".

STEP 3 — ROOM SCHEDULE (IMPORTANT):
Read the room label printed inside every room on the floor plans (ground and first floor).
List each room once. For each room return:
- "name": the label exactly as drawn (e.g. "En-suite 2", "Utility", "W.C.")
- "type": classify into ONE of exactly these values:
    cloakroom  (any WC / W.C. / W/C / toilet / cloakroom / powder room — a small WC/basin room, often downstairs)
    bathroom   (any bath or shower room)
    ensuite    (a bathroom directly off a bedroom)
    kitchen    (kitchen or kitchen/diner)
    utility    (utility or laundry room)
    bedroom, living, dining, hall, garage, study, other  (everything else)
- "floor": "ground" or "first" if you can tell, else null
Count carefully — a typical house has one kitchen, sometimes a utility, and several bath/shower/WC rooms. Do not invent rooms that are not labelled; do not merge two rooms into one.

IMPORTANT — do your absolute best to extract sizes:
- Even if dimensions are small or partially obscured, make your best read
- When reading a SCHEDULE: if a cell is unclear, return null for that dimension — do NOT substitute a typical size. A wrong number is worse than a null the QS can fill in.
- Only when MEASURING elevations with NO schedule may you fall back to a typical size if a dimension is genuinely unreadable.
- Typical UK residential: external doors 900-1023mm wide x 2100mm high
- Typical windows: 600-1810mm wide x 900-1200mm high
- Bi-fold doors: 1800-3600mm wide x 2100mm high
- Never return empty arrays if openings are clearly visible in the drawings

IMPORTANT RULES:
- Read the STRUCTURAL OPENING size (width x height in mm) — NOT the leaf/frame size
- For schedules, this is usually listed separately from the leaf size
- Include EVERY opening — do not skip any
- Bi-fold and sliding doors: set type to "bifold"
- Bay windows: set type to "bay"
- Rooflights/Velux: set type to "rooflight"
- source field: "schedule", "plan", or "elevation"

Return ONLY this JSON, no markdown:
{
  "doors": [
    { "ref": "D01", "location": "Hall", "structural_w_mm": 1023, "structural_h_mm": 2100, "type": "single", "source": "schedule" }
  ],
  "windows": [
    { "ref": "W01", "location": "Living", "structural_w_mm": 836, "structural_h_mm": 1500, "type": "standard", "source": "elevation" }
  ],
  "rooms": [
    { "name": "Kitchen/Diner", "type": "kitchen", "floor": "ground" },
    { "name": "Utility", "type": "utility", "floor": "ground" },
    { "name": "W.C.", "type": "cloakroom", "floor": "ground" },
    { "name": "Bathroom", "type": "bathroom", "floor": "first" },
    { "name": "En-suite", "type": "ensuite", "floor": "first" }
  ]
}

Rules:
- Always read the STRUCTURAL OPENING size (width x height in mm) not the frame or leaf size
- Include every single opening found — do not skip any
- For bi-fold or sliding doors set type to "bifold"
- For bay windows set type to "bay"
- source field: use "schedule" if from a schedule table, "plan" if from floor plan dimensions, "elevation" if from elevation drawings
- If genuinely no opening sizes can be found anywhere, return empty arrays
- Roof windows and Velux units: include as windows with type "rooflight"
- If genuinely no room labels can be read, return an empty rooms array`
  });

  let raw = null, lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const txt = await anthropicStream({ model: 'claude-sonnet-4-5', max_tokens: 4000, messages: [{ role: 'user', content: fileParts }] }, usageOut);
      raw = txt.replace(/```json|```/g, '').trim();
      break;
    } catch (e) {
      lastErr = e;
      console.warn(`Schedule extraction attempt ${attempt}/3 failed: ${e.message}`);
      if (attempt < 3) await new Promise(r => setTimeout(r, 800 * attempt));
    }
  }
  if (raw === null) throw lastErr;
  try { return JSON.parse(raw); }
  catch(e) {
    const s = raw.indexOf('{'), epos = raw.lastIndexOf('}');
    if (s >= 0 && epos > s) { try { return JSON.parse(raw.slice(s, epos + 1)); } catch(e2) {} }
    return null;
  }
}



// ── LOG ORDER ─────────────────────────────────────────────────────────────
app.post('/log-order', async (req, res) => {
  try {
    const { ref, value, fee, date, supplier, logged } = req.body;
    if (!value) return res.status(400).json({ error: 'No order value' });

    // Email Signature with order confirmation
    if (RESEND_KEY) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${RESEND_KEY}` },
        body: JSON.stringify({
          from: 'Signature QS Platform <onboarding@resend.dev>',
          to: ['jerome@signature-construction.com'],
          reply_to: 'jerome@signature-construction.com',
          subject: `Order logged — ${ref || 'New order'} — £${Number(value).toLocaleString('en-GB')}`,
          html: `
            <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:2rem">
              <h2 style="color:#b8964e;margin-bottom:1rem">Order confirmed</h2>
              <table style="width:100%;border-collapse:collapse;font-size:14px">
                <tr><td style="padding:8px 0;color:#666;width:160px">Job reference</td><td style="padding:8px 0;font-weight:500">${ref||'—'}</td></tr>
                <tr><td style="padding:8px 0;color:#666">Order value</td><td style="padding:8px 0;font-weight:500">£${Number(value).toLocaleString('en-GB')}</td></tr>
                <tr><td style="padding:8px 0;color:#666">Signature fee (1.5%)</td><td style="padding:8px 0;font-weight:500;color:#b8964e">£${Number(fee).toLocaleString('en-GB')}</td></tr>
                <tr><td style="padding:8px 0;color:#666">Supplier</td><td style="padding:8px 0">${supplier||'—'}</td></tr>
                <tr><td style="padding:8px 0;color:#666">Order date</td><td style="padding:8px 0">${date||'—'}</td></tr>
                <tr><td style="padding:8px 0;color:#666">Logged at</td><td style="padding:8px 0">${new Date(logged).toLocaleString('en-GB')}</td></tr>
              </table>
              <div style="margin-top:1.5rem;padding:1rem;background:#f9f6f0;border-radius:6px;font-size:13px;color:#666">
                Please raise an invoice for £${Number(fee).toLocaleString('en-GB')} + VAT to the merchant.
              </div>
            </div>
          `
        })
      });
    }

    console.log(`Order logged: ${ref} — £${value} — fee: £${fee}`);
    res.json({ success: true });
  } catch(err) {
    console.error('Log order error:', err.message);
    res.status(500).json({ error: err.message });
  }
});


// ── USAGE LOGGING (Spinks billing, Supabase-backed) ──────────────────────
app.post('/log-usage', async (req, res) => {
  try {
    const { client, branch, project, houseType, results, ts } = req.body;
    const fee = 75;
    const record = {
      client: client || 'Spinks',
      branch: branch || '',
      project: project || 'Unnamed project',
      house_type: houseType || '',
      total_m2: (results && results.total_m2) ? String(results.total_m2) : '',
      doors: (results && results.doors) ? results.doors : 0,
      windows: (results && results.windows) ? results.windows : 0,
      fee: fee,
      ts: ts || new Date().toISOString()
    };

    // Persist to Supabase
    await supabaseInsert(record);

    // Email per-upload notification
    if (RESEND_KEY) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${RESEND_KEY}` },
        body: JSON.stringify({
          from: 'Signature QS Platform <onboarding@resend.dev>',
          to: ['jerome@signature-construction.com'],
          reply_to: 'jerome@signature-construction.com',
          subject: `Upload logged — ${record.client}${record.branch ? ' (branch ' + record.branch + ')' : ''} — ${record.project} — £${fee}`,
          html: `
            <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:2rem">
              <h2 style="color:#b8964e;margin-bottom:1rem">Drawing set uploaded &amp; analysed</h2>
              <table style="width:100%;border-collapse:collapse;font-size:14px">
                <tr><td style="padding:8px 0;color:#666;width:160px">Client</td><td style="padding:8px 0;font-weight:500">${record.client}</td></tr>
                <tr><td style="padding:8px 0;color:#666">Branch</td><td style="padding:8px 0;font-weight:500">${record.branch||'—'}</td></tr>
                <tr><td style="padding:8px 0;color:#666">Project</td><td style="padding:8px 0;font-weight:500">${record.project}</td></tr>
                <tr><td style="padding:8px 0;color:#666">House type</td><td style="padding:8px 0">${record.house_type||'—'}</td></tr>
                <tr><td style="padding:8px 0;color:#666">Total floor area</td><td style="padding:8px 0">${record.total_m2||'—'} m²</td></tr>
                <tr><td style="padding:8px 0;color:#666">Doors / Windows</td><td style="padding:8px 0">${record.doors} / ${record.windows}</td></tr>
                <tr><td style="padding:8px 0;color:#666">Fee</td><td style="padding:8px 0;font-weight:500;color:#b8964e">£${fee}</td></tr>
                <tr><td style="padding:8px 0;color:#666">Date / time</td><td style="padding:8px 0">${new Date(record.ts).toLocaleString('en-GB')}</td></tr>
              </table>
            </div>
          `
        })
      });
    }

    const monthCount = await supabaseMonthCount(record.client);
    res.json({ success: true, monthCount, fee });
  } catch(err) {
    console.error('Log usage error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Counter on page load
app.get('/usage-count', async (req, res) => {
  try {
    const client = req.query.client || '';
    const branch = req.query.branch || '';
    const monthCount = await supabaseMonthCount(client, branch);
    res.json({ monthCount });
  } catch(err) {
    res.json({ monthCount: 0 });
  }
});

// Cost summary — true cost-per-lookup from the cost_log. ?month=0 (this month) or -1 (last).
app.get('/cost-summary', async (req, res) => {
  try {
    const offset = parseInt(req.query.month || '0', 10);
    const rows = await supabaseMonthRecords(offset, 'cost_log');
    const n = rows.length;
    const sum = k => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0);
    const totalCost = sum('total_cost'), aiCost = sum('ai_cost'), docaiCost = sum('docai_cost');
    const vector = rows.filter(r => r.parse_path === 'vector').length;
    const claude = rows.filter(r => r.parse_path === 'claude').length;
    // per-branch breakdown
    const byBranch = {};
    rows.forEach(r => { const b = r.branch || '—'; (byBranch[b] = byBranch[b] || { n: 0, cost: 0 }); byBranch[b].n++; byBranch[b].cost += Number(r.total_cost) || 0; });
    res.json({
      month_offset: offset,
      lookups: n,
      avg_cost_per_lookup: n ? +(totalCost / n).toFixed(4) : 0,
      total_cost: +totalCost.toFixed(2),
      ai_cost: +aiCost.toFixed(2),
      docai_cost: +docaiCost.toFixed(2),
      vector_lookups: vector,
      claude_lookups: claude,
      note: 'Costs are estimates using configured unit rates (USD). Token counts and page counts are exact.',
      by_branch: Object.keys(byBranch).sort().map(b => ({ branch: b, lookups: byBranch[b].n, cost: +byBranch[b].cost.toFixed(2) })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Monthly summary — emails last month's total (call on the 1st or manually)
app.get('/monthly-summary', async (req, res) => {
  try {
    const records = await supabaseMonthRecords(-1); // last month
    const total = records.length * 75;
    const lastMonth = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1);
    const monthName = lastMonth.toLocaleString('en-GB', { month: 'long', year: 'numeric' });

    if (RESEND_KEY && records.length > 0) {
      const rows = records.map(r =>
        `<tr><td style="padding:6px 0;border-bottom:1px solid #eee">${new Date(r.ts).toLocaleDateString('en-GB')}</td><td style="padding:6px 0;border-bottom:1px solid #eee">${r.project}</td><td style="padding:6px 0;border-bottom:1px solid #eee">${r.house_type||'—'}</td><td style="padding:6px 0;border-bottom:1px solid #eee;text-align:right">£${r.fee}</td></tr>`
      ).join('');
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${RESEND_KEY}` },
        body: JSON.stringify({
          from: 'Signature QS Platform <onboarding@resend.dev>',
          to: ['jerome@signature-construction.com'],
          subject: `Monthly summary — ${monthName} — ${records.length} uploads — £${total}`,
          html: `
            <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:2rem">
              <h2 style="color:#b8964e">Monthly usage summary — ${monthName}</h2>
              <p style="font-size:14px;color:#666">${records.length} house drawing sets uploaded.</p>
              <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:1rem">
                <thead><tr><th style="text-align:left;padding:6px 0;border-bottom:2px solid #b8964e">Date</th><th style="text-align:left;padding:6px 0;border-bottom:2px solid #b8964e">Project</th><th style="text-align:left;padding:6px 0;border-bottom:2px solid #b8964e">House type</th><th style="text-align:right;padding:6px 0;border-bottom:2px solid #b8964e">Fee</th></tr></thead>
                <tbody>${rows}</tbody>
                <tfoot><tr><td colspan="3" style="padding:10px 0;font-weight:600">Total to invoice</td><td style="padding:10px 0;text-align:right;font-weight:600;color:#b8964e">£${total}</td></tr></tfoot>
              </table>
            </div>
          `
        })
      });
    }
    res.json({ success: true, month: monthName, count: records.length, total });
  } catch(err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── KITCHEN/BATHROOM LEAD CAPTURE ─────────────────────────────────────────
async function supabaseInsertLead(record) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  try {
    const r = await httpsRequest(`${SUPABASE_URL}/rest/v1/leads`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(record)
    });
    if (r.status < 200 || r.status >= 300) { console.error('Supabase lead insert failed:', r.status, r.text.slice(0, 200)); return null; }
    try { return JSON.parse(r.text); } catch (e) { return null; }
  } catch (e) { console.error('Supabase lead insert error:', e.message); return null; }
}

app.post('/log-lead', async (req, res) => {
  try {
    const { email, name, postcode, type, grade, value, spec, summary } = req.body;
    if (!email) return res.status(400).json({ error: 'No email provided' });

    const record = {
      email: email,
      name: name || '',
      postcode: postcode || '',
      lead_type: type || 'kitchen',
      grade: grade || '',
      configured_value: value || 0,
      spec: spec ? JSON.stringify(spec) : '',
      summary: summary || '',
      ts: new Date().toISOString()
    };

    await supabaseInsertLead(record);

    // Email the lead to Signature
    if (RESEND_KEY) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${RESEND_KEY}` },
        body: JSON.stringify({
          from: 'Signature QS Platform <onboarding@resend.dev>',
          to: ['jerome@signature-construction.com'],
          reply_to: email,
          subject: `New ${record.lead_type} lead — ${record.grade} — £${Number(record.configured_value).toLocaleString('en-GB')}`,
          html: `
            <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:2rem">
              <h2 style="color:#b8964e;margin-bottom:1rem">New ${record.lead_type} lead captured</h2>
              <table style="width:100%;border-collapse:collapse;font-size:14px">
                <tr><td style="padding:8px 0;color:#666;width:160px">Grade</td><td style="padding:8px 0;font-weight:600;color:#b8964e">${record.grade}</td></tr>
                <tr><td style="padding:8px 0;color:#666">Configured value</td><td style="padding:8px 0;font-weight:500">£${Number(record.configured_value).toLocaleString('en-GB')} (supply)</td></tr>
                <tr><td style="padding:8px 0;color:#666">Name</td><td style="padding:8px 0">${record.name||'—'}</td></tr>
                <tr><td style="padding:8px 0;color:#666">Email</td><td style="padding:8px 0">${record.email}</td></tr>
                <tr><td style="padding:8px 0;color:#666">Postcode</td><td style="padding:8px 0">${record.postcode||'—'}</td></tr>
              </table>
              <div style="margin-top:1.25rem;padding:1rem;background:#f9f6f0;border-radius:6px;font-size:13px;color:#444">
                <strong>Configured spec:</strong><br>${record.summary||'—'}
              </div>
            </div>
          `
        })
      });
    }

    res.json({ success: true });
  } catch(err) {
    console.error('Log lead error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── KB DESIGN ─────────────────────────────────────────────────────────────
app.post('/kb-design', async (req, res) => {
  try {
    const { drawings } = req.body;
    if (!drawings || !drawings.length) return res.status(400).json({ success: false, error: 'No drawings provided' });

    const fileParts = drawings.map(img => {
      if (img.type && img.type.includes('pdf')) {
        return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: img.data } };
      }
      return { type: 'image', source: { type: 'base64', media_type: img.type || 'image/jpeg', data: img.data } };
    });

    fileParts.push({ type: 'text', text: `You are an expert kitchen and bathroom designer and SVG coder. Analyse these architectural drawings carefully.

COORDINATE SYSTEM - follow this EXACTLY:
1. Canvas: viewBox='0 0 560 460'
2. Room border: 30px from edge on all sides
3. Room inner area: x=30, y=30, width=500, height=400
4. Scale: s = min(500/room_w_mm, 400/room_h_mm) — calculate this precisely
5. All coordinates: room_x = 30 + (mm_from_left * s), room_y = 30 + (mm_from_top * s)
6. Wall thickness in SVG: 12px

KITCHEN SVG — STEP BY STEP:
Step 1: Calculate s = min(500/room_width_mm, 400/room_height_mm)
Step 2: Draw room background rect at x='30' y='30' width=room_w_mm*s height=room_h_mm*s fill='#232320'
Step 3: Draw 4 walls as thick border lines stroke='#b8964e' stroke-width='12'
Step 4: Place base units (600mm deep, 560mm high) TOUCHING each wall:
  - Top wall units: y=30, height=600*s, run full width
  - Bottom wall units: y=30+room_h*s-600*s, height=600*s
  - Left wall units if L-shape: x=30, width=600*s
Step 5: Draw worktop as rect on top of each base unit run, height=40*s, fill='#3a3a38' stroke='#b8964e' stroke-width='2'
Step 6: Draw wall units (300mm deep) as dashed rect ABOVE base units: stroke-dasharray='4,2' height=300*s
Step 7: Mark sink: circle r='15' at sink position
Step 8: Mark hob: 4 small circles for burners
Step 9: Add dimension lines and mm labels
Step 10: Add room name label at bottom centre

BATHROOM SVG — STEP BY STEP:  
Step 1: Calculate s = min(500/room_width_mm, 400/room_height_mm)
Step 2: Draw room and walls same as kitchen
Step 3: Bath (1700x750mm): place along longest wall, touching wall
  - rect width=1700*s height=750*s, inner oval for bath shape
Step 4: WC (500x660mm): place on shortest wall or corner, cistern against wall
  - rect for cistern, rounded rect for pan
Step 5: Basin (600x480mm): wall-hung on remaining wall
  - rect with small circle for plug
Step 6: Shower (900x900mm): in corner if space allows
  - rect with dashed lines showing glass screen
Step 7: Show door swing as arc
Step 8: Add all dimension labels

LABELLING:
- Each item: short gold text fill='#b8964e' font-size='10' font-family='Arial,sans-serif'
- Dimensions: grey text fill='#6b6960' font-size='8'
- Room name: gold bold text at bottom fill='#b8964e' font-size='12' font-weight='bold'
- All text inside room boundary — never overflowing

COLOURS:
- Canvas bg: fill='#1a1a18'
- Room floor: fill='#232320'
- Walls/border: stroke='#b8964e' stroke-width='12' fill='none'
- Base units: fill='#2a2a28' stroke='#6b6960' stroke-width='1'
- Worktop: fill='#3a3a38' stroke='#b8964e' stroke-width='2'
- Wall units: fill='#222220' stroke='#4a4a48' stroke-width='1' stroke-dasharray='4,2'
- Sanitaryware: fill='#2e2e2c' stroke='#888' stroke-width='1'
- Shower glass: stroke='#6b9fd4' stroke-width='1' stroke-dasharray='3,2' fill='none'

ISLAND RULE: Only add if room_w_mm - 1200 >= 1800 (900mm clearance each side of 600mm deep units + island)
If island: place centred, 900x1200mm minimum, draw hob as 4 burner circles in centre

OPEN PLAN: If adjacent dining/living area visible, extend island to boundary, add breakfast bar overhang 300mm on dining side

IMPORTANT — JSON FORMATTING:
- Use ONLY single quotes inside SVG attributes
- No double quotes anywhere inside the svg string
- Escape any apostrophes in text as &apos;

CRITICAL SVG RULES:
- The SVG canvas is 500x400px. The room takes up the full canvas minus a 20px border.
- Calculate a scale factor: scale = min(460/room_width_mm, 360/room_height_mm)
- Draw ALL units and fittings AGAINST THE WALLS, not floating in the centre
- Room origin starts at x=20, y=20
- Wall thickness = 15px
- Units sit INSIDE the room touching the walls

KITCHEN LAYOUT RULES:
- Run base units along the longest walls, 600mm deep (scaled)
- Wall units are 300mm deep (scaled), directly above base units
- Sink goes under a window if possible (usually middle of a run)
- Tall units (fridge/oven) go at the end of a run
- ISLAND RULE: If room allows 900mm clearance on ALL sides between island and surrounding worktops, add a central island unit. Island minimum size 800x1200mm. Place hob in the island centre. Label island "Island+Hob". If clearance cannot be achieved, do NOT add island.
- Clearance check: room_width_mm - (2 x 600mm units depth) - island_depth >= 900mm AND room_length_mm - island_length >= 900mm each end
- OPEN PLAN RULE: If the kitchen opens into a dining or living area with no dividing wall (look for labels like DINING, LIVING, OPEN PLAN on the drawings), the kitchen layout can extend into that space. In this case:
  - Run base units along the kitchen walls as normal
  - Position the island at the boundary between kitchen and dining/living, acting as a natural divider
  - The island can be larger (up to 1000x2400mm) in open plan layouts
  - Place the hob in the island facing the dining area
  - Add a breakfast bar overhang (300mm) on the dining side of the island for seating
  - Show the dining area boundary with a dashed line on the SVG
  - Label the island "Island+Hob" and add "Bfast Bar" label on the dining side
- Show worktop as a thin line (3px) on top of base units and island
- Label each unit with short text: "B600", "W600", "Tall", "Sink", "Island+Hob"
- Show dimensions at bottom: width x height mm
- In the component list, add island unit, hob, and breakfast bar overhang if island is included

BATHROOM LAYOUT RULES:
- WC always goes against a wall, cistern touching the wall
- Bath goes along the longest wall
- Basin goes on a short wall or beside the bath
- Shower enclosure goes in a corner if room allows
- Never float items in the centre
- Label: "Bath", "WC", "Basin", "Shower"

SVG COLOUR SCHEME:
- Background: fill='#1a1a18'
- Room floor: fill='#232320'  
- Walls: fill='#2a2a28' stroke='#b8964e' stroke-width='15'
- Base units/sanitaryware: fill='#2e2e2c' stroke='#6b6960' stroke-width='1'
- Worktop line: stroke='#b8964e' stroke-width='3'
- Wall units: fill='#252523' stroke='#4a4a48' stroke-width='1' stroke-dasharray='3,2'
- Text labels: fill='#b8964e' font-size='9' font-family='Arial,sans-serif'
- Dimension text: fill='#6b6960' font-size='8'
- Room label at bottom: fill='#b8964e' font-size='11' font-weight='bold'

IMPORTANT: Use ONLY single quotes for ALL SVG attribute values. Double quotes will break the JSON.
Example: rect x='20' y='20' width='460' height='360' fill='#232320'

For EACH kitchen and bathroom/ensuite/WC found in the drawings:
1. Read the room dimensions from the floor plan
2. Suggest the best layout type (L-shape, galley, U-shape, single-run for kitchens; standard, wet room, ensuite for bathrooms)
3. Generate a simple SVG floor plan showing the layout (top-down view, max 500x400px)
4. List all components with sizes and quantities

SVG requirements:
- Use viewBox="0 0 500 400" xmlns="http://www.w3.org/2000/svg"
- Background: rect x="0" y="0" width="500" height="400" fill="#1a1a18"
- Walls: rect elements with fill="#2a2a28" stroke="#b8964e" stroke-width="8"
- Units/fittings: rect elements with fill="#2a2a28" stroke="#6b6960" stroke-width="1"
- Text labels: text fill="#ffffff" font-size="9" font-family="sans-serif"
- IMPORTANT: In the SVG, use single quotes for all attribute values to avoid breaking JSON
- Example: rect x='10' y='10' width='100' height='50' fill='#2a2a28'

Return ONLY valid JSON (no markdown, no code blocks):
{
  "kitchen": {
    "room_name": "Kitchen",
    "room_dims": "4500 x 3200mm",
    "layout_type": "L-shape",
    "total_run_m": 6.5,
    "svg": "<svg viewBox=\"0 0 500 400\" xmlns=\"http://www.w3.org/2000/svg\">...</svg>",
    "components": [
      {"item": "Base unit 600mm", "size": "600x720x560mm", "qty": 4, "note": "Soft-close doors"},
      {"item": "Wall unit 600mm", "size": "600x720x300mm", "qty": 4, "note": "Above base units"},
      {"item": "Worktop 40mm", "size": "3600x600mm", "qty": 2, "note": "Quartz or laminate"},
      {"item": "Sink unit 1000mm", "size": "1000x720x560mm", "qty": 1, "note": "1.5 bowl"},
      {"item": "Appliance housing 600mm", "size": "600x720mm", "qty": 2, "note": "Oven + fridge"}
    ]
  },
  "bathrooms": [
    {
      "room_name": "Bathroom",
      "room_dims": "2500 x 1800mm",
      "layout_type": "Standard",
      "svg": "<svg viewBox=\"0 0 500 400\" xmlns=\"http://www.w3.org/2000/svg\">...</svg>",
      "components": [
        {"item": "Bath 1700mm", "size": "1700x750mm", "qty": 1, "note": "Acrylic"},
        {"item": "Close-coupled WC", "size": "660x360mm", "qty": 1, "note": "Concealed cistern"},
        {"item": "Basin 600mm", "size": "600x480mm", "qty": 1, "note": "Wall-hung or pedestal"},
        {"item": "Shower screen", "size": "760x1900mm", "qty": 1, "note": "Over bath"}
      ]
    }
  ]
}` });

    const raw = (await anthropicStream({ model: 'claude-sonnet-4-5', max_tokens: 4000, messages: [{ role: 'user', content: fileParts }] })).replace(/```json|```/g, '').trim();
    let result;
    try {
      result = JSON.parse(raw);
    } catch(parseErr) {
      // Try to extract JSON from response if it has extra text
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Could not parse response: ' + parseErr.message);
      }
    }
    res.json({ success: true, data: result });

  } catch(err) {
    console.error('KB design error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── SEND QUOTE ─────────────────────────────────────────────────────────────
app.post('/send-quote', async (req, res) => {
  if (!RESEND_KEY) return res.status(500).json({ error: 'Resend API key not configured' });
  const { merchants, materials, project, drawings, csvData } = req.body;
  if (!merchants?.length) return res.status(400).json({ error: 'No merchants specified' });

  const CATS = {
    builders: ['Masonry','Timber Frame','Ground Floor (Concrete Slab)','Ground Floor (Beam & Block)','First Floor (Timber)','Floor (Concrete)','Floor (Timber)','Roof (Flat)','Roof (Pitched)','Boards & Linings','Structural','Rainwater Goods','Fixings & Sundries'],
    kitchen: ['Kitchen','Kitchen Fittings','Kitchen & Bathroom'],
    bathroom: ['Bathroom','Sanitaryware','Plumbing'],
    tiling: ['Tiling','Floor Tiles','Wall Tiles'],
    windows: ['Second Fix Joinery','Windows','Doors','Glazing'],
  };

  const results = [];
  for (const merchant of merchants) {
    try {
      // Use pre-configured supplier email from server env vars
      // Client only toggles type - never sees or enters email
      const supplierEmail = SUPPLIER_EMAILS[merchant.type] || merchant.email;
      if (!supplierEmail) {
        results.push({ merchant: merchant.name, status: 'skipped', error: 'No email configured for this supplier type' });
        continue;
      }
      const cats = CATS[merchant.type] || CATS.builders;
      const filtered = materials.filter(m => cats.some(c => m.cat.toLowerCase().includes(c.toLowerCase()) || c.toLowerCase().includes(m.cat.toLowerCase())));
      const matsToSend = filtered.length > 0 ? filtered : (merchant.type === 'builders' ? materials : null);
      if (!matsToSend) { results.push({ merchant: merchant.name, status: 'skipped', reason: 'No relevant materials' }); continue; }

      const rows = matsToSend.map(m => `<tr style="border-bottom:1px solid #e8e3da"><td style="padding:6px 10px;font-size:12px">${m.item}</td><td style="padding:6px 10px;font-size:12px;text-align:right">${m.unit}</td><td style="padding:6px 10px;font-size:12px;text-align:right;font-weight:600">${typeof m.qty==='number'?m.qty.toLocaleString('en-GB'):m.qty}</td><td style="padding:6px 10px;font-size:11px;color:#888">${m.note||''}</td><td style="padding:6px 10px"></td></tr>`).join('');

      const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="font-family:Georgia,serif;color:#2c2c2a;max-width:700px;margin:0 auto;padding:20px"><div style="border-bottom:3px solid #B8964E;padding-bottom:16px;margin-bottom:20px"><h2 style="font-size:22px;color:#B8964E;letter-spacing:.1em;font-weight:700;margin:0 0 3px">SIGNATURE CONSTRUCTION PROJECTS LTD</h2><p style="font-size:11px;color:#888;margin:0">QUANTITY SURVEYING CONSULTANCY</p></div><h1 style="font-size:18px;margin:0 0 5px">Materials Quotation Request</h1><p style="font-size:13px;color:#555;margin:0 0 20px"><strong>Project:</strong> ${project.name||'Project'}<br><strong>Client:</strong> ${project.client||'Client'}<br><strong>Date:</strong> ${new Date().toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})}</p><p style="font-size:13px;color:#333;line-height:1.7;margin-bottom:20px">Dear ${merchant.name},<br><br>Please find attached the architect's drawings and materials schedule. We would be grateful if you could provide your best trade pricing within <strong>5 working days</strong>.</p><table style="width:100%;border-collapse:collapse;margin-bottom:20px"><thead><tr style="background:#1c1c1a"><th style="padding:8px 10px;font-size:10px;color:#B8964E;text-align:left">MATERIAL</th><th style="padding:8px 10px;font-size:10px;color:#B8964E;text-align:right">UNIT</th><th style="padding:8px 10px;font-size:10px;color:#B8964E;text-align:right">QTY</th><th style="padding:8px 10px;font-size:10px;color:#B8964E;text-align:left">SPEC</th><th style="padding:8px 10px;font-size:10px;color:#B8964E;text-align:left">YOUR PRICE (£)</th></tr></thead><tbody>${rows}</tbody></table><p style="font-size:12px;color:#333">Please return to:<br><strong>Jerome</strong> — Signature Construction Projects Ltd<br><a href="mailto:jerome@signature-construction.com" style="color:#B8964E">jerome@signature-construction.com</a></p></body></html>`;

      const attachments = [];
      if (csvData) attachments.push({ filename: `Materials_${(project.name||'Project').replace(/\s+/g,'_')}.csv`, content: Buffer.from(csvData).toString('base64'), type: 'text/csv' });
      if (drawings?.length) drawings.slice(0,3).forEach(d => { if(d.base64&&d.name) attachments.push({ filename: d.name, content: d.base64, type: d.type||'application/pdf' }); });

      const er = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: 'Signature QS <onboarding@resend.dev>', to: [merchant.email], reply_to: 'jerome@signature-construction.com', subject: `Materials Quote Request — ${project.name||'Project'} — ${new Date().toLocaleDateString('en-GB')}`, html, attachments }),
      });
      const ed = await er.json();
      results.push(er.ok ? { merchant: merchant.name, status: 'sent', id: ed.id } : { merchant: merchant.name, status: 'error', error: ed.message||'Send failed' });
    } catch(err) {
      results.push({ merchant: merchant.name, status: 'error', error: err.message });
    }
  }
  res.json({ success: results.some(r => r.status==='sent'), results });
});

app.listen(PORT, () => {
  console.log(`Signature QS Proxy v6.0 running on port ${PORT}`);
  console.log(`Document AI: ${GOOGLE_SA_KEY ? 'ENABLED' : 'DISABLED (Claude fallback)'}`);
});
