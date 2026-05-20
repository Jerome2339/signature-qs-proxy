const express = require('express');
const multer = require('multer');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const RESEND_KEY = process.env.RESEND_API_KEY;
const GOOGLE_SA_KEY = process.env.GOOGLE_SERVICE_ACCOUNT_KEY; // JSON string of service account key
const DOCAI_PROCESSOR = 'https://eu-documentai.googleapis.com/v1/projects/843787881834/locations/eu/processors/b39e11de77cfc99e/processorVersions/pretrained-foundation-model-v1.5-pro-2025-06-20:process';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.get('/health', (req, res) => res.json({ status: 'ok', version: '6.2.0', docai: !!GOOGLE_SA_KEY }));
const PROXY_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
setInterval(() => fetch(`${PROXY_URL}/health`).catch(() => {}), 10 * 60 * 1000);

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

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });

  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error('Failed to get Google token: ' + JSON.stringify(tokenData));

  cachedToken = tokenData.access_token;
  tokenExpiry = Date.now() + (tokenData.expires_in * 1000);
  return cachedToken;
}

// ── ANALYSE DRAWING ────────────────────────────────────────────────────────
app.post('/analyse-drawing', upload.array('drawings', 10), async (req, res) => {
  if (!req.files || !req.files.length) return res.status(400).json({ error: 'No files uploaded' });

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
      const token = await getGoogleToken();

      const docaiRes = await fetch(DOCAI_PROCESSOR, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          skipHumanReview: true,
          rawDocument: {
            mimeType,
            content: b64,
          },
        }),
      });

      if (!docaiRes.ok) {
        const err = await docaiRes.text();
        console.error('Document AI error:', docaiRes.status, err);
        // Fall back to Claude for this file
        continue;
      }

      const docaiData = await docaiRes.json();
      results.push({ file: file.originalname, data: docaiData });
    }

    if (!results.length) {
      console.log('Document AI returned no results — falling back to Claude');
      return analyseWithClaude(req, res);
    }

    // Parse Document AI response into our standard format
    const merged = mergeDocAIResults(results);
    console.log(`Document AI extraction complete: ${merged.walls?.length || 0} walls, roof pitch: ${merged.roof?.pitch_degrees}°`);

    // Pass 2: Use Claude to extract door/window schedules (tables Claude reads reliably)
    if (ANTHROPIC_KEY && req.files.length > 0) {
      try {
        console.log('Running schedule extraction pass with Claude...');
        const scheduleData = await extractSchedulesWithClaude(req.files);
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
      } catch(err) {
        console.warn('Schedule extraction failed (non-critical):', err.message);
      }
    }

    res.json({ success: true, data: merged, source: 'google-document-ai' });

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
      // Use ground floor area for single storey, or ground for materials calc base
      // If ground < total, ground is correct. If they're the same, it may be total mislabelled.
      area_m2: groundArea && totalArea && groundArea < totalArea ? groundArea : groundArea || totalArea,
      ceiling_height_m: ceilGroundMm ? ceilGroundMm / 1000 : null,
    },

    walls: lengthMm && widthMm ? [
      { label: 'Front wall', length_m: lengthMm / 1000, height_m: ceilGroundMm ? ceilGroundMm / 1000 : 2.4, is_external: true },
      { label: 'Rear wall', length_m: lengthMm / 1000, height_m: ceilGroundMm ? ceilGroundMm / 1000 : 2.4, is_external: true },
      { label: 'Left wall', length_m: widthMm / 1000, height_m: ceilGroundMm ? ceilGroundMm / 1000 : 2.4, is_external: true },
      { label: 'Right wall', length_m: widthMm / 1000, height_m: ceilGroundMm ? ceilGroundMm / 1000 : 2.4, is_external: true },
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
  "rooms": [{ "name": null, "floor": null }],
  "notes": [],
  "cannot_determine": []
}

KEY RULES:
- Floor area table is in the title block — rows labelled GROUND/FIRST/TOTAL
- Roof pitch is the arc symbol at the eaves on section drawings (NOT staircase PITCH=41°)
- Door/window schedules are tables — read every row
- Do NOT attempt overall building dimensions — user will enter manually`
    });

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'pdfs-2024-09-25' },
      body: JSON.stringify({ model: 'claude-sonnet-4-5', max_tokens: 4000, messages: [{ role: 'user', content: fileParts }] }),
    });

    const data = await resp.json();
    const raw = data.content.map(c => c.text || '').join('').replace(/```json|```/g, '').trim();
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
          rooms: parsed.rooms || [],
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
async function extractSchedulesWithClaude(files) {
  const fileParts = files.map(file => {
    const b64 = file.buffer.toString('base64');
    const isPDF = file.mimetype.includes('pdf') || file.originalname.toLowerCase().endsWith('.pdf');
    if (isPDF) return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } };
    return { type: 'image', source: { type: 'base64', media_type: file.mimetype, data: b64 } };
  });

  fileParts.push({
    type: 'text',
    text: `Look for DOOR SCHEDULE and WINDOW SCHEDULE tables in these drawings. Read every row.

Return ONLY this JSON, no markdown:
{
  "doors": [
    { "ref": "D01", "location": "Hall", "structural_w_mm": 1023, "structural_h_mm": 2100, "type": "single" }
  ],
  "windows": [
    { "ref": "W01", "location": "Living", "structural_w_mm": 836, "structural_h_mm": 1500, "type": "bay" }
  ]
}

Rules:
- Read the STRUCTURAL OPENING size (width x height in mm) not the leaf size
- Include every single row from both schedules
- For bi-fold doors set type to "bifold"
- If no schedule found return empty arrays`
  });

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'pdfs-2024-09-25' },
    body: JSON.stringify({ model: 'claude-sonnet-4-5', max_tokens: 2000, messages: [{ role: 'user', content: fileParts }] }),
  });

  if (!resp.ok) throw new Error(`Claude schedule API ${resp.status}`);
  const data = await resp.json();
  const raw = data.content.map(c => c.text || '').join('').replace(/\`\`\`json|\`\`\`/g, '').trim();
  try { return JSON.parse(raw); } catch(e) { return null; }
}

// ── SEND QUOTE ─────────────────────────────────────────────────────────────
app.post('/send-quote', async (req, res) => {
  if (!RESEND_KEY) return res.status(500).json({ error: 'Resend API key not configured' });
  const { merchants, materials, project, drawings, csvData } = req.body;
  if (!merchants?.length) return res.status(400).json({ error: 'No merchants specified' });

  const CATS = {
    builders: ['Masonry','Timber Frame','Floor (Concrete)','Floor (Timber)','Roof (Flat)','Roof (Pitched)','Boards & Linings','Structural','Fixings & Sundries'],
    kitchen: ['Kitchen','Kitchen Fittings'],
    bathroom: ['Bathroom','Sanitaryware','Plumbing'],
    tiling: ['Tiling','Floor Tiles','Wall Tiles'],
  };

  const results = [];
  for (const merchant of merchants) {
    try {
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
