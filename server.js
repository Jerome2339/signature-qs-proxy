const express = require('express');
const multer = require('multer');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.ANTHROPIC_API_KEY;
const RESEND_KEY = process.env.RESEND_API_KEY;

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.get('/health', (req, res) => res.json({ status: 'ok', version: '4.0.0' }));
const PROXY_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
setInterval(() => fetch(`${PROXY_URL}/health`).catch(() => {}), 10 * 60 * 1000);

function getMediaType(mimetype, filename) {
  const m = mimetype.toLowerCase();
  const ext = (filename || '').split('.').pop().toLowerCase();
  if (m === 'application/pdf' || ext === 'pdf') return { type: 'document', media_type: 'application/pdf' };
  if (m === 'image/png' || ext === 'png') return { type: 'image', media_type: 'image/png' };
  if (['image/jpeg','image/jpg'].includes(m) || ['jpg','jpeg'].includes(ext)) return { type: 'image', media_type: 'image/jpeg' };
  if (m === 'image/webp' || ext === 'webp') return { type: 'image', media_type: 'image/webp' };
  return null;
}

function buildFilePart(file) {
  const mt = getMediaType(file.mimetype, file.originalname);
  if (!mt) return null;
  const b64 = file.buffer.toString('base64');
  if (mt.type === 'document') return { type: 'document', source: { type: 'base64', media_type: mt.media_type, data: b64 } };
  return { type: 'image', source: { type: 'base64', media_type: mt.media_type, data: b64 } };
}

async function callClaude(messages, maxTokens = 5000) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'pdfs-2024-09-25' },
    body: JSON.stringify({ model: 'claude-sonnet-4-5', max_tokens: maxTokens, messages }),
  });
  if (!res.ok) { const err = await res.text(); throw new Error(`Claude API ${res.status}: ${err.substring(0, 200)}`); }
  const data = await res.json();
  return data.content.map(c => c.text || '').join('').replace(/```json|```/g, '').trim();
}

function safeParseJSON(raw) {
  try { return JSON.parse(raw); } catch(e) {}
  const match = raw.match(/\{[\s\S]*\}/);
  if (match) { try { return JSON.parse(match[0]); } catch(e) {} }
  // Recovery
  const lines = raw.split('\n');
  for (let i = lines.length; i > 3; i--) {
    let attempt = lines.slice(0, i).join('\n').replace(/,\s*$/, '');
    const opens = (attempt.match(/\{/g)||[]).length, closes = (attempt.match(/\}/g)||[]).length;
    const ao = (attempt.match(/\[/g)||[]).length, ac = (attempt.match(/\]/g)||[]).length;
    attempt += ']'.repeat(Math.max(0, ao-ac)) + '}'.repeat(Math.max(0, opens-closes));
    try { const p = JSON.parse(attempt); p._truncated = true; return p; } catch(e) {}
  }
  return null;
}

// ── ANALYSE DRAWING ENDPOINT ──────────────────────────────────────────────
app.post('/analyse-drawing', upload.array('drawings', 10), async (req, res) => {
  if (!API_KEY) return res.status(500).json({ error: 'API key not configured' });
  if (!req.files || !req.files.length) return res.status(400).json({ error: 'No files uploaded' });

  try {
    const fileParts = req.files.map(buildFilePart).filter(Boolean);
    if (!fileParts.length) return res.status(400).json({ error: 'No supported file types' });

    console.log(`Starting extraction on ${fileParts.length} drawing(s)`);

    // ── PASS 1: MASTER EXTRACTION ──────────────────────────────────────────
    // Single comprehensive pass with highly specific QS-focused prompt
    const pass1Raw = await callClaude([{
      role: 'user',
      content: [
        ...fileParts,
        {
          type: 'text',
          text: `You are a senior UK quantity surveyor extracting data from architect's drawings for a materials calculator.

These are professional CAD drawings that will include some or all of: floor plans, elevations, sections, schedules, and substructure plans.

Your job is to read every number and label on every drawing and extract it accurately.

Return ONLY this JSON. No markdown. No explanation.

{
  "project_name": "project name from title block",
  "house_type": "house type name if shown",
  "client": "client name from title block",
  "plot_numbers": "plot numbers if shown",

  "floor_areas": {
    "ground_m2": ground floor area as decimal number or null,
    "first_m2": first floor area as decimal number or null,
    "second_m2": second floor area as decimal number or null,
    "total_m2": total floor area as decimal number or null
  },

  "overall_dimensions": {
    "length_mm": overall building length as integer mm or null,
    "width_mm": overall building width as integer mm or null
  },

  "external_walls": [
    {
      "label": "e.g. Front wall / South elevation",
      "length_mm": annotated length as integer mm,
      "height_mm": wall height as integer mm or null,
      "is_external": true
    }
  ],

  "internal_walls": [
    {
      "label": "e.g. Kitchen/Living partition",
      "length_mm": annotated length as integer mm,
      "height_mm": null,
      "is_external": false
    }
  ],

  "ceiling_heights": {
    "ground_floor_mm": ground floor ceiling height mm or null,
    "first_floor_mm": first floor ceiling height mm or null,
    "floor_to_floor_mm": FFL to FFL height mm or null
  },

  "roof": {
    "type": "pitched/flat/mono-pitch/hipped",
    "pitch_degrees": pitch angle as number or null,
    "span_mm": roof span mm or null,
    "length_mm": roof length mm or null,
    "ridge_height_mm": ridge height mm or null,
    "eaves_height_mm": eaves height mm or null,
    "overhang_mm": eaves overhang mm or null,
    "construction": "trussed rafter/cut roof/flat/unknown"
  },

  "wall_construction": {
    "type": "cavity/solid/timber frame",
    "outer_leaf": "brick/block/render/stone/timber",
    "outer_leaf_mm": thickness in mm or null,
    "cavity_mm": cavity width mm or null,
    "inner_leaf": "block/stud/unknown",
    "inner_leaf_mm": thickness in mm or null,
    "total_thickness_mm": total wall thickness mm or null,
    "insulation": "description of insulation if noted"
  },

  "floor_construction": {
    "ground": "beam and block/concrete slab/timber/unknown",
    "upper": "timber joists/concrete/unknown"
  },

  "doors": [
    {
      "ref": "D01",
      "location": "room name",
      "structural_opening_w_mm": width mm,
      "structural_opening_h_mm": height mm,
      "leaf_w_mm": leaf width mm or null,
      "leaf_h_mm": leaf height mm or null,
      "type": "single/double/bi-fold/french/sliding"
    }
  ],

  "windows": [
    {
      "ref": "W01",
      "location": "room name",
      "structural_opening_w_mm": width mm,
      "structural_opening_h_mm": height mm,
      "type": "standard/bay/rooflight/skylight"
    }
  ],

  "rooms": [
    {
      "name": "room name",
      "floor": "ground/first/second",
      "area_m2": area if annotated or null
    }
  ],

  "confidence": {
    "floor_areas": "high/medium/low — high means you read it from the drawing",
    "dimensions": "high/medium/low",
    "openings": "high/medium/low",
    "construction_spec": "high/medium/low"
  },

  "missing": ["list anything you could not find"],
  "notes": ["important observations about the drawings"]
}

RULES:
1. ALL dimensions must be in millimetres as integers
2. Floor areas must be in m² as decimals
3. Look for floor area table in the title block — it is usually labelled FLOOR AREA with GROUND / FIRST / TOTAL
4. Look for DOOR SCHEDULE and WINDOW SCHEDULE tables — read every row
5. Read every dimension string on every drawing
6. The overall building dimensions are usually shown as the outermost dimension chain
7. Ceiling heights are usually shown on section drawings as FFL to ceiling annotations
8. Wall construction is shown in the brick/blockwork legend and section drawings
9. Roof pitch is shown on section drawings — look for angle annotation
10. Never estimate — only extract values explicitly written on the drawing`
        }
      ]
    }], 6000);

    const pass1 = safeParseJSON(pass1Raw);
    if (!pass1) {
      console.error('Pass 1 failed to parse. Raw:', pass1Raw.substring(0, 500));
      return res.status(502).json({ error: 'Could not extract data from drawings. Try uploading fewer pages at once.', raw: pass1Raw.substring(0, 200) });
    }

    console.log(`Pass 1: floors=${JSON.stringify(pass1.floor_areas)}, walls=${pass1.external_walls?.length||0}, doors=${pass1.doors?.length||0}, windows=${pass1.windows?.length||0}`);

    // ── PASS 2: FILL GAPS ──────────────────────────────────────────────────
    // Only run if key data is missing
    const needsPass2 = !pass1.floor_areas?.total_m2 || !pass1.external_walls?.length || !pass1.ceiling_heights?.ground_floor_mm;

    let pass2 = null;
    if (needsPass2) {
      console.log('Running pass 2 to fill gaps...');
      const missingList = [];
      if (!pass1.floor_areas?.total_m2) missingList.push('total floor area (look for FLOOR AREA table in title block with GROUND / FIRST / TOTAL rows)');
      if (!pass1.external_walls?.length) missingList.push('external wall dimensions (look for the outermost dimension chain on floor plans)');
      if (!pass1.ceiling_heights?.ground_floor_mm) missingList.push('ceiling heights (look for section drawings with FFL annotations)');
      if (!pass1.doors?.length) missingList.push('door schedule (look for DOOR SCHEDULE table)');
      if (!pass1.windows?.length) missingList.push('window schedule (look for WINDOW SCHEDULE table)');

      const pass2Raw = await callClaude([{
        role: 'user',
        content: [
          ...fileParts,
          {
            type: 'text',
            text: `Look specifically at these drawings again. I need you to find the following information that was missed in the first pass:

${missingList.map((m, i) => `${i+1}. ${m}`).join('\n')}

Return ONLY JSON with these fields (use null for anything genuinely not found):
{
  "floor_areas": { "ground_m2": null, "first_m2": null, "total_m2": null },
  "overall_dimensions": { "length_mm": null, "width_mm": null },
  "external_walls": [],
  "ceiling_heights": { "ground_floor_mm": null, "first_floor_mm": null, "floor_to_floor_mm": null },
  "roof": { "pitch_degrees": null, "span_mm": null },
  "doors": [],
  "windows": [],
  "missing": []
}`
          }
        ]
      }], 4000);

      pass2 = safeParseJSON(pass2Raw);
      console.log(`Pass 2: floors=${JSON.stringify(pass2?.floor_areas)}, walls=${pass2?.external_walls?.length||0}`);
    }

    // ── MERGE AND FORMAT ───────────────────────────────────────────────────
    const p2 = pass2 || {};

    // Merge floor areas — prefer non-null values
    const fa = {
      ground_m2: pass1.floor_areas?.ground_m2 || p2.floor_areas?.ground_m2 || null,
      first_m2: pass1.floor_areas?.first_m2 || p2.floor_areas?.first_m2 || null,
      total_m2: pass1.floor_areas?.total_m2 || p2.floor_areas?.total_m2 || null,
    };

    // Overall dims
    const od = {
      length_mm: pass1.overall_dimensions?.length_mm || p2.overall_dimensions?.length_mm || null,
      width_mm: pass1.overall_dimensions?.width_mm || p2.overall_dimensions?.width_mm || null,
    };

    // External walls — combine and deduplicate
    const extWalls = [...(pass1.external_walls || []), ...(p2.external_walls || [])].filter((w, i, arr) =>
      arr.findIndex(w2 => w2.label === w.label && w2.length_mm === w.length_mm) === i
    );

    // Internal walls
    const intWalls = pass1.internal_walls || [];

    // Ceiling heights
    const ch = {
      ground_mm: pass1.ceiling_heights?.ground_floor_mm || p2.ceiling_heights?.ground_floor_mm || null,
      first_mm: pass1.ceiling_heights?.first_floor_mm || p2.ceiling_heights?.first_floor_mm || null,
      floor_to_floor_mm: pass1.ceiling_heights?.floor_to_floor_mm || p2.ceiling_heights?.floor_to_floor_mm || null,
    };

    // Roof
    const roof = {
      type: pass1.roof?.type || 'unknown',
      pitch_degrees: pass1.roof?.pitch_degrees || p2.roof?.pitch_degrees || null,
      span_mm: pass1.roof?.span_mm || p2.roof?.span_mm || null,
      length_mm: pass1.roof?.length_mm || null,
      overhang_mm: pass1.roof?.overhang_mm || null,
      construction: pass1.roof?.construction || 'unknown',
    };

    // Doors and windows — merge and deduplicate by ref
    const doors = mergeByRef([...(pass1.doors || []), ...(p2.doors || [])], 'ref');
    const windows = mergeByRef([...(pass1.windows || []), ...(p2.windows || [])], 'ref');

    // Build the response in the format the frontend expects
    const result = {
      project_name: pass1.project_name || null,
      drawing_type: ['floor plan', 'elevation', 'section', 'schedule'],

      floor: {
        // Use total for the main floor area — if two storey use ground floor as working area
        length_m: od.length_mm ? od.length_mm / 1000 : null,
        width_m: od.width_mm ? od.width_mm / 1000 : null,
        area_m2: fa.ground_m2 || (fa.total_m2 ? fa.total_m2 : null),
        ceiling_height_m: ch.ground_mm ? ch.ground_mm / 1000 : null,
      },

      // Combine external and internal walls
      walls: [
        ...extWalls.map(w => ({
          label: w.label,
          length_m: w.length_mm ? w.length_mm / 1000 : null,
          height_m: w.height_mm ? w.height_mm / 1000 : (ch.ground_mm ? ch.ground_mm / 1000 : null),
          is_external: true,
        })),
        ...intWalls.map(w => ({
          label: w.label,
          length_m: w.length_mm ? w.length_mm / 1000 : null,
          height_m: w.height_mm ? w.height_mm / 1000 : (ch.ground_mm ? ch.ground_mm / 1000 : null),
          is_external: false,
        })),
      ],

      openings: [
        ...doors.map(d => ({
          label: `${d.ref || 'Door'} — ${d.location || 'unknown'}`,
          type: d.type === 'bi-fold' || d.type === 'bifold' ? 'bifold' : 'door',
          width_m: d.structural_opening_w_mm ? d.structural_opening_w_mm / 1000 : null,
          height_m: d.structural_opening_h_mm ? d.structural_opening_h_mm / 1000 : null,
          qty: 1,
        })),
        ...windows.map(w => ({
          label: `${w.ref || 'Window'} — ${w.location || 'unknown'}${w.type === 'bay' ? ' (Bay)' : ''}`,
          type: w.type === 'bay' ? 'window' : (w.type === 'rooflight' ? 'rooflight' : 'window'),
          width_m: w.structural_opening_w_mm ? w.structural_opening_w_mm / 1000 : null,
          height_m: w.structural_opening_h_mm ? w.structural_opening_h_mm / 1000 : null,
          qty: 1,
        })),
      ],

      roof: {
        type: roof.type.includes('pitch') || roof.type.includes('hip') ? 'pitched' : (roof.type === 'flat' ? 'flat' : 'pitched'),
        span_m: roof.span_mm ? roof.span_mm / 1000 : (od.width_mm ? od.width_mm / 1000 : null),
        length_m: roof.length_mm ? roof.length_mm / 1000 : (od.length_mm ? od.length_mm / 1000 : null),
        pitch_degrees: roof.pitch_degrees || null,
        overhang_m: roof.overhang_mm ? roof.overhang_mm / 1000 : null,
      },

      wall_construction: pass1.wall_construction?.type || 'cavity',
      floor_construction: pass1.floor_construction?.ground?.includes('concrete') || pass1.floor_construction?.ground?.includes('beam') ? 'concrete' : 'concrete',

      // Extra data for display
      extra: {
        house_type: pass1.house_type,
        client: pass1.client,
        plot_numbers: pass1.plot_numbers,
        floor_areas: fa,
        ceiling_heights: ch,
        wall_spec: pass1.wall_construction,
        floor_spec: pass1.floor_construction,
        rooms: pass1.rooms || [],
        door_count: doors.length,
        window_count: windows.length,
      },

      confidence: pass1.confidence || {},
      missing: [...new Set([...(pass1.missing || []), ...(p2?.missing || [])])],
      notes: [...(pass1.notes || [])],
    };

    // If we got floor areas, add a note
    if (fa.total_m2) {
      result.notes.push(`Total floor area: ${fa.total_m2}m² (Ground: ${fa.ground_m2 || '?'}m², First: ${fa.first_m2 || '?'}m²)`);
    }

    console.log(`Final result: ${result.walls.length} walls, ${result.openings.length} openings, floor area: ${result.floor.area_m2}m²`);
    res.json({ success: true, data: result });

  } catch (err) {
    console.error('Extraction error:', err);
    res.status(500).json({ error: 'Extraction failed: ' + err.message });
  }
});

function mergeByRef(items, refField) {
  const seen = new Set();
  return items.filter(item => {
    const key = item[refField];
    if (!key || seen.has(key)) return !key; // keep items without refs, dedupe those with refs
    seen.add(key);
    return true;
  });
}

// ── SEND QUOTE TO MERCHANT ────────────────────────────────────────────────
app.post('/send-quote', async (req, res) => {
  if (!RESEND_KEY) return res.status(500).json({ error: 'Resend API key not configured' });
  const { merchants, materials, project, drawings, csvData } = req.body;
  if (!merchants?.length) return res.status(400).json({ error: 'No merchants specified' });

  const CATS = {
    builders: ['Masonry','Timber Frame','Floor (Concrete)','Floor (Timber)','Roof (Flat)','Roof (Pitched)','Boards & Linings','Structural','Fixings & Sundries'],
    kitchen:  ['Kitchen','Kitchen Fittings'],
    bathroom: ['Bathroom','Sanitaryware','Plumbing'],
    tiling:   ['Tiling','Floor Tiles','Wall Tiles'],
  };

  const results = [];
  for (const merchant of merchants) {
    try {
      const relevantCats = CATS[merchant.type] || CATS.builders;
      const filtered = materials.filter(m => relevantCats.some(c => m.cat.toLowerCase().includes(c.toLowerCase()) || c.toLowerCase().includes(m.cat.toLowerCase())));
      const matsToSend = (filtered.length > 0 || merchant.type === 'builders') ? (filtered.length > 0 ? filtered : materials) : null;
      if (!matsToSend) { results.push({ merchant: merchant.name, status: 'skipped', reason: 'No relevant materials' }); continue; }

      const rows = matsToSend.map(m => `<tr style="border-bottom:1px solid #e8e3da"><td style="padding:6px 10px;font-size:12px">${m.item}</td><td style="padding:6px 10px;font-size:12px;text-align:right">${m.unit}</td><td style="padding:6px 10px;font-size:12px;text-align:right;font-weight:600">${typeof m.qty==='number'?m.qty.toLocaleString('en-GB'):m.qty}</td><td style="padding:6px 10px;font-size:11px;color:#888">${m.note||''}</td><td style="padding:6px 10px;font-size:11px"></td></tr>`).join('');

      const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="font-family:Georgia,serif;color:#2c2c2a;max-width:700px;margin:0 auto;padding:20px"><div style="border-bottom:3px solid #B8964E;padding-bottom:16px;margin-bottom:20px"><h2 style="font-size:22px;color:#B8964E;letter-spacing:.1em;font-weight:700;margin:0 0 3px">SIGNATURE CONSTRUCTION PROJECTS LTD</h2><p style="font-size:11px;color:#888;margin:0">QUANTITY SURVEYING CONSULTANCY</p></div><h1 style="font-size:18px;margin:0 0 5px">Materials Quotation Request</h1><p style="font-size:13px;color:#555;margin:0 0 20px"><strong>Project:</strong> ${project.name||'Project'}<br><strong>Client:</strong> ${project.client||'Client'}<br><strong>Date:</strong> ${new Date().toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})}</p><p style="font-size:13px;color:#333;line-height:1.7;margin-bottom:20px">Dear ${merchant.name},<br><br>Please find attached the architect's drawings and materials schedule. We would be grateful if you could provide your best trade pricing for the items listed within <strong>5 working days</strong>.</p><table style="width:100%;border-collapse:collapse;margin-bottom:20px"><thead><tr style="background:#1c1c1a"><th style="padding:8px 10px;font-size:10px;color:#B8964E;text-align:left">MATERIAL</th><th style="padding:8px 10px;font-size:10px;color:#B8964E;text-align:right">UNIT</th><th style="padding:8px 10px;font-size:10px;color:#B8964E;text-align:right">QTY</th><th style="padding:8px 10px;font-size:10px;color:#B8964E;text-align:left">SPEC</th><th style="padding:8px 10px;font-size:10px;color:#B8964E;text-align:left">YOUR PRICE (£)</th></tr></thead><tbody>${rows}</tbody></table><div style="background:#f9f7f2;border:1px solid #e8e3da;border-radius:4px;padding:12px 16px;margin-bottom:20px;font-size:12px;color:#555;line-height:1.7"><strong>Notes:</strong><br>• All quantities include 10% wastage<br>• Architect's drawings attached<br>• CSV schedule also attached</div><p style="font-size:12px;color:#333">Please return to:<br><strong>Jerome</strong> — Signature Construction Projects Ltd<br><a href="mailto:jerome@signature-construction.com" style="color:#B8964E">jerome@signature-construction.com</a></p></body></html>`;

      const attachments = [];
      if (csvData) attachments.push({ filename: `Materials_${(project.name||'Project').replace(/\s+/g,'_')}.csv`, content: Buffer.from(csvData).toString('base64'), type: 'text/csv' });
      if (drawings?.length) drawings.slice(0, 3).forEach(d => { if (d.base64 && d.name) attachments.push({ filename: d.name, content: d.base64, type: d.type||'application/pdf' }); });

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
  console.log(`Signature QS Proxy v4.0 running on port ${PORT}`);
  if (!API_KEY) console.warn('WARNING: ANTHROPIC_API_KEY not set');
  if (!RESEND_KEY) console.warn('WARNING: RESEND_API_KEY not set');
});
