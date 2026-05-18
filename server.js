
Copy

const express = require('express');
const multer = require('multer');
const fetch = require('node-fetch');
const cors = require('cors');
 
const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.ANTHROPIC_API_KEY;
const RESEND_KEY = process.env.RESEND_API_KEY;
 
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});
 
app.use(cors());
app.use(express.json({ limit: '50mb' }));
 
app.get('/health', (req, res) => res.json({ status: 'ok', version: '3.0.0' }));
 
const PROXY_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
setInterval(() => {
  fetch(`${PROXY_URL}/health`).catch(() => {});
}, 10 * 60 * 1000);
 
// ── HELPERS ───────────────────────────────────────────────────────────────
 
function getMediaType(mimetype, filename) {
  const m = mimetype.toLowerCase();
  const ext = (filename || '').split('.').pop().toLowerCase();
  if (m === 'application/pdf' || ext === 'pdf') return { type: 'document', media_type: 'application/pdf' };
  if (m === 'image/png' || ext === 'png') return { type: 'image', media_type: 'image/png' };
  if (m === 'image/jpeg' || m === 'image/jpg' || ext === 'jpg' || ext === 'jpeg') return { type: 'image', media_type: 'image/jpeg' };
  if (m === 'image/webp' || ext === 'webp') return { type: 'image', media_type: 'image/webp' };
  return null;
}
 
function buildFilePart(file) {
  const mt = getMediaType(file.mimetype, file.originalname);
  if (!mt) return null;
  const b64 = file.buffer.toString('base64');
  if (mt.type === 'document') {
    return { type: 'document', source: { type: 'base64', media_type: mt.media_type, data: b64 } };
  }
  return { type: 'image', source: { type: 'base64', media_type: mt.media_type, data: b64 } };
}
 
async function callClaude(messages, maxTokens = 4000) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'pdfs-2024-09-25',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: maxTokens,
      messages,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API ${res.status}: ${err.substring(0, 200)}`);
  }
  const data = await res.json();
  return data.content.map(c => c.text || '').join('').replace(/```json|```/g, '').trim();
}
 
function safeParseJSON(raw) {
  // First try direct parse
  try { return JSON.parse(raw); } catch (e) {}
 
  // Try to extract JSON object from the text
  const match = raw.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch (e) {}
  }
 
  // Try recovery — trim back line by line
  const lines = raw.split('\n');
  for (let i = lines.length; i > 3; i--) {
    let attempt = lines.slice(0, i).join('\n').replace(/,\s*$/, '');
    const opens = (attempt.match(/\{/g) || []).length;
    const closes = (attempt.match(/\}/g) || []).length;
    const arrOpens = (attempt.match(/\[/g) || []).length;
    const arrCloses = (attempt.match(/\]/g) || []).length;
    // Close open arrays first
    attempt += ']'.repeat(Math.max(0, arrOpens - arrCloses));
    attempt += '}'.repeat(Math.max(0, opens - closes));
    try {
      const parsed = JSON.parse(attempt);
      parsed._truncated = true;
      return parsed;
    } catch (e) {}
  }
  return null;
}
 
function mergeExtractions(pass1, pass2, pass3) {
  // Merge results from three passes intelligently
  const merged = {
    project_name: pass1.project_name || pass2.project_name || pass3.project_name || null,
    drawing_type: [...new Set([...(pass1.drawing_type||[]), ...(pass2.drawing_type||[]), ...(pass3.drawing_type||[])])],
    floor: {
      length_m: pass1.floor?.length_m || pass2.floor?.length_m || null,
      width_m: pass1.floor?.width_m || pass2.floor?.width_m || null,
      area_m2: pass1.floor?.area_m2 || pass2.floor?.area_m2 || null,
      ceiling_height_m: pass3.ceiling_height_m || pass2.ceiling_height_m || pass1.floor?.ceiling_height_m || null,
    },
    // Walls: prefer pass1 (floor plan) but supplement with pass2 (elevations)
    walls: (pass1.walls && pass1.walls.length > 0) ? pass1.walls : (pass2.walls || []),
    // Openings: merge from floor plan and elevations, deduplicate by label
    openings: mergeOpenings(pass1.openings || [], pass2.openings || []),
    roof: {
      type: pass3.roof_type || pass1.roof?.type || 'unknown',
      span_m: pass1.roof?.span_m || pass3.roof_span_m || null,
      length_m: pass1.roof?.length_m || null,
      pitch_degrees: pass3.roof_pitch || pass1.roof?.pitch_degrees || null,
      overhang_m: pass3.eaves_overhang_m || pass1.roof?.overhang_m || null,
    },
    wall_construction: pass3.wall_construction || pass1.wall_construction || 'unknown',
    floor_construction: pass3.floor_construction || pass1.floor_construction || 'unknown',
    wall_thickness_mm: pass3.wall_thickness_mm || null,
    insulation_spec: pass3.insulation_spec || null,
    floor_finish: pass3.floor_finish || null,
    internal_wall_finish: pass3.internal_wall_finish || null,
    room_schedule: pass1.room_schedule || [],
    notes: [...(pass1.notes||[]), ...(pass2.notes||[]), ...(pass3.notes||[])],
    confidence: {
      floor_dims: pass1.confidence?.floor_dims || 'low',
      wall_dims: pass1.confidence?.wall_dims || 'low',
      openings: pass2.confidence?.openings || pass1.confidence?.openings || 'low',
      roof: pass3.confidence?.roof || pass1.confidence?.roof || 'low',
      construction_type: pass3.confidence?.construction_type || 'low',
    },
    missing: [...new Set([...(pass1.missing||[]), ...(pass2.missing||[]), ...(pass3.missing||[])])],
  };
  if (pass1._truncated || pass2._truncated || pass3._truncated) {
    merged.missing.push('Some drawing data may be incomplete due to response length limits');
  }
  return merged;
}
 
function mergeOpenings(a, b) {
  const all = [...a];
  b.forEach(ob => {
    const exists = all.find(oa =>
      oa.label && ob.label &&
      oa.label.toLowerCase().includes(ob.label.toLowerCase().split(' ')[0])
    );
    if (!exists) all.push(ob);
  });
  return all;
}
 
// ── ANALYSE DRAWING ENDPOINT ──────────────────────────────────────────────
// Three-pass extraction:
// Pass 1 — Floor plan: all dimensions, room schedule, wall lengths, openings, floor area
// Pass 2 — Elevations: window/door heights, wall heights, roof outline
// Pass 3 — Sections & spec: construction spec, ceiling heights, insulation, wall build-up
 
app.post('/analyse-drawing', upload.array('drawings', 10), async (req, res) => {
  if (!API_KEY) return res.status(500).json({ error: 'API key not configured' });
  if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No files uploaded' });
 
  try {
    const fileParts = req.files.map(f => buildFilePart(f)).filter(Boolean);
    if (fileParts.length === 0) return res.status(400).json({ error: 'No supported file types' });
 
    console.log(`Starting 3-pass extraction on ${fileParts.length} file(s)`);
 
    // ── PASS 1: FLOOR PLAN DIMENSIONS ──────────────────────────────────────
    const pass1Raw = await callClaude([{
      role: 'user',
      content: [
        ...fileParts,
        {
          type: 'text',
          text: `You are an expert quantity surveyor reading architect's drawings.
 
TASK: Extract all FLOOR PLAN information. Focus entirely on plan view dimensions and room data.
 
Return ONLY this JSON structure, no markdown, no explanation:
{
  "project_name": "project name or address if shown, else null",
  "drawing_type": ["list all drawing sheet types you can see"],
  "floor": {
    "length_m": largest overall floor plan length in metres or null,
    "width_m": largest overall floor plan width in metres or null,
    "area_m2": total floor area if annotated or null,
    "ceiling_height_m": null
  },
  "walls": [
    {
      "label": "descriptive label e.g. North external wall",
      "length_m": annotated dimension in metres,
      "height_m": null,
      "is_external": true or false based on position on plan
    }
  ],
  "openings": [
    {
      "label": "e.g. French doors to garden",
      "type": "window/door/bifold/rooflight/sliding",
      "width_m": annotated width in metres,
      "height_m": null,
      "qty": number of identical openings
    }
  ],
  "roof": { "type": "flat/pitched/unknown", "span_m": null, "length_m": null, "pitch_degrees": null, "overhang_m": null },
  "wall_construction": "cavity/solid/timber/unknown",
  "floor_construction": "concrete/timber/unknown",
  "room_schedule": [
    { "name": "room name", "area_m2": area if annotated or null }
  ],
  "notes": ["important observations"],
  "confidence": {
    "floor_dims": "high/medium/low",
    "wall_dims": "high/medium/low",
    "openings": "high/medium/low",
    "roof": "low",
    "construction_type": "high/medium/low"
  },
  "missing": ["list of dimensions clearly shown on plan but that could not be extracted"]
}
 
CRITICAL RULES:
- Only extract dimensions with explicit number annotations (e.g. 3600, 4.2m, 14'-6")
- Convert all mm to metres (divide by 1000)
- Convert feet/inches to metres (1ft = 0.3048m)
- Do NOT estimate from scale bars
- For walls: extract every dimensioned wall run you can find
- For openings: look for door swings, window symbols, and any width annotations
- List every room or space you can identify with its name`
        }
      ]
    }], 4000);
 
    const pass1 = safeParseJSON(pass1Raw) || { walls: [], openings: [], floor: {}, missing: ['Pass 1 failed to parse'], notes: [], room_schedule: [], confidence: {} };
    console.log(`Pass 1 complete: ${pass1.walls?.length || 0} walls, ${pass1.openings?.length || 0} openings`);
 
    // ── PASS 2: ELEVATIONS — HEIGHTS AND OPENING DETAILS ───────────────────
    const pass2Raw = await callClaude([{
      role: 'user',
      content: [
        ...fileParts,
        {
          type: 'text',
          text: `You are an expert quantity surveyor reading architect's drawings.
 
TASK: Extract all ELEVATION and HEIGHT information. Focus on vertical dimensions from elevation drawings.
 
Return ONLY this JSON structure, no markdown:
{
  "drawing_type": ["elevation types visible e.g. North Elevation, South Elevation"],
  "floor": { "ceiling_height_m": floor-to-ceiling height in metres or null },
  "wall_heights": [
    {
      "label": "e.g. North elevation wall",
      "height_m": annotated wall height in metres,
      "is_external": true
    }
  ],
  "openings": [
    {
      "label": "descriptive name e.g. Kitchen window",
      "type": "window/door/bifold/rooflight",
      "width_m": annotated width in metres or null,
      "height_m": annotated height in metres or null,
      "cill_height_m": height of cill from floor or null,
      "qty": number of identical openings
    }
  ],
  "roof": {
    "type": "flat/pitched/mono-pitch/hipped/unknown",
    "span_m": roof span in metres or null,
    "length_m": roof length in metres or null,
    "pitch_degrees": pitch angle if annotated or null,
    "ridge_height_m": ridge height above ground or null,
    "eaves_height_m": eaves height above ground or null,
    "overhang_m": eaves overhang in metres or null
  },
  "project_name": null,
  "notes": ["observations from elevations"],
  "confidence": {
    "floor_dims": "low",
    "wall_dims": "high/medium/low",
    "openings": "high/medium/low",
    "roof": "high/medium/low",
    "construction_type": "low"
  },
  "missing": ["heights or details visible but not extracted"]
}
 
CRITICAL RULES:
- Focus ONLY on elevation drawings — ignore plan views for this pass
- Extract every height dimension you can find
- Window and door heights are critical — look for height annotations next to each opening
- Note the roof type carefully — flat, pitched, mono-pitch, hipped etc
- Look for eaves level, ridge level, floor level datums`
        }
      ]
    }], 4000);
 
    const pass2 = safeParseJSON(pass2Raw) || { openings: [], roof: {}, floor: {}, missing: [], notes: [], confidence: {} };
    // Merge wall heights into walls from pass1
    if (pass2.wall_heights && pass2.wall_heights.length > 0 && pass1.walls) {
      pass2.wall_heights.forEach(wh => {
        const match = pass1.walls.find(w =>
          w.label && wh.label &&
          (w.label.toLowerCase().includes(wh.label.toLowerCase().split(' ')[0]) ||
           wh.label.toLowerCase().includes(w.label.toLowerCase().split(' ')[0]))
        );
        if (match && wh.height_m) {
          match.height_m = wh.height_m;
        } else if (wh.height_m && !pass1.walls.some(w => w.height_m)) {
          // Apply height to all external walls if none have heights
          pass1.walls.filter(w => w.is_external).forEach(w => { if (!w.height_m) w.height_m = wh.height_m; });
        }
      });
    }
    console.log(`Pass 2 complete: ${pass2.openings?.length || 0} openings from elevations, roof type: ${pass2.roof?.type}`);
 
    // ── PASS 3: SECTIONS AND CONSTRUCTION SPEC ─────────────────────────────
    const pass3Raw = await callClaude([{
      role: 'user',
      content: [
        ...fileParts,
        {
          type: 'text',
          text: `You are an expert quantity surveyor reading architect's drawings.
 
TASK: Extract CONSTRUCTION SPECIFICATION and SECTION information. Focus on build-up details, materials, and section drawings.
 
Return ONLY this JSON structure, no markdown:
{
  "ceiling_height_m": floor-to-ceiling height from any section drawing or null,
  "wall_construction": "cavity/solid/timber/unknown",
  "wall_thickness_mm": total wall thickness in mm or null,
  "cavity_width_mm": cavity width in mm or null,
  "outer_leaf": "brick/block/timber/render/stone/unknown",
  "inner_leaf": "block/timber stud/unknown",
  "insulation_spec": "description of insulation if shown e.g. 100mm PIR full fill cavity",
  "floor_construction": "concrete/timber/unknown",
  "floor_build_up": "description of floor layers if shown in section",
  "roof_type": "flat/pitched/mono-pitch/hipped/unknown",
  "roof_pitch": pitch in degrees if shown or null,
  "roof_span_m": span in metres or null,
  "eaves_overhang_m": eaves overhang in metres or null,
  "roof_build_up": "description of roof layers if shown",
  "floor_finish": "description if specified",
  "internal_wall_finish": "plasterboard/wet plaster/unknown",
  "ceiling_finish": "plasterboard/wet plaster/unknown",
  "structural_system": "masonry/timber frame/steel/unknown",
  "foundation_type": "strip/pad/raft/piled/unknown",
  "notes": ["any spec notes, material callouts, or annotations not covered above"],
  "confidence": {
    "floor_dims": "low",
    "wall_dims": "low",
    "openings": "low",
    "roof": "high/medium/low",
    "construction_type": "high/medium/low"
  },
  "missing": ["spec details that appear to be on the drawings but could not be read"]
}
 
CRITICAL RULES:
- Focus on SECTION drawings and any spec/detail callouts
- Look for wall build-up diagrams showing layer thicknesses
- Look for floor build-up sections (slab, insulation, screed etc)
- Look for roof section details (joists, insulation, deck, membrane)
- Extract material callout notes and specification text
- Note any NBS spec references or British Standard references if visible
- If you see a thermal/U-value table extract the wall/floor/roof U-values`
        }
      ]
    }], 3000);
 
    const pass3 = safeParseJSON(pass3Raw) || { missing: [], notes: [], confidence: {} };
    console.log(`Pass 3 complete: wall type: ${pass3.wall_construction}, floor: ${pass3.floor_construction}, roof: ${pass3.roof_type}`);
 
    // ── MERGE AND RETURN ────────────────────────────────────────────────────
    const merged = mergeExtractions(pass1, pass2, pass3);
 
    // Calculate total wall perimeter from extracted walls
    if (merged.walls && merged.walls.length > 0) {
      const extWalls = merged.walls.filter(w => w.is_external);
      if (extWalls.length > 0) {
        merged.calculated_perimeter_m = extWalls.reduce((t, w) => t + (w.length_m || 0), 0);
      }
    }
 
    // If we have rooms, calculate total area from them if floor area not found
    if (!merged.floor.area_m2 && merged.room_schedule && merged.room_schedule.length > 0) {
      const roomTotal = merged.room_schedule.reduce((t, r) => t + (r.area_m2 || 0), 0);
      if (roomTotal > 0) {
        merged.floor.area_m2 = roomTotal;
        merged.notes.push(`Floor area calculated from room schedule total: ${roomTotal.toFixed(1)}m²`);
      }
    }
 
    console.log(`Extraction complete: ${merged.walls?.length || 0} walls, ${merged.openings?.length || 0} openings, floor area: ${merged.floor?.area_m2 || 'unknown'}`);
 
    res.json({ success: true, data: merged, passes: { pass1_walls: pass1.walls?.length || 0, pass2_openings: pass2.openings?.length || 0, pass3_spec: pass3.wall_construction || 'unknown' } });
 
  } catch (err) {
    console.error('Extraction error:', err);
    res.status(500).json({ error: 'Extraction failed: ' + err.message });
  }
});
 
// ── SEND QUOTE TO MERCHANT ENDPOINT ──────────────────────────────────────
app.post('/send-quote', async (req, res) => {
  if (!RESEND_KEY) return res.status(500).json({ error: 'Resend API key not configured' });
  const { merchants, materials, project, drawings, csvData } = req.body;
  if (!merchants || !merchants.length) return res.status(400).json({ error: 'No merchants specified' });
 
  const MERCHANT_CATEGORIES = {
    builders: ['Masonry','Timber Frame','Floor (Concrete)','Floor (Timber)','Roof (Flat)','Roof (Pitched)','Boards & Linings','Structural','Fixings & Sundries','Insulation (Walls)'],
    kitchen:  ['Kitchen','Kitchen Fittings','Kitchen & Joinery'],
    bathroom: ['Bathroom','Bathroom Fittings','Sanitaryware','Plumbing'],
    tiling:   ['Tiling','Floor Tiles','Wall Tiles','Tiles & Tiling'],
  };
 
  const results = [];
 
  for (const merchant of merchants) {
    try {
      const relevantCats = MERCHANT_CATEGORIES[merchant.type] || MERCHANT_CATEGORIES.builders;
      const filteredMats = materials.filter(m => relevantCats.some(cat =>
        m.cat.toLowerCase().includes(cat.toLowerCase()) || cat.toLowerCase().includes(m.cat.toLowerCase())
      ));
      const matsToSend = (filteredMats.length > 0 || merchant.type === 'builders') ? (filteredMats.length > 0 ? filteredMats : materials) : null;
      if (!matsToSend) { results.push({ merchant: merchant.name, status: 'skipped', reason: 'No relevant materials' }); continue; }
 
      const tableRows = matsToSend.map(m =>
        `<tr style="border-bottom:1px solid #e8e3da">
          <td style="padding:6px 10px;font-size:12px">${m.item}</td>
          <td style="padding:6px 10px;font-size:12px;text-align:right">${m.unit}</td>
          <td style="padding:6px 10px;font-size:12px;text-align:right;font-weight:600">${typeof m.qty==='number'?m.qty.toLocaleString('en-GB'):m.qty}</td>
          <td style="padding:6px 10px;font-size:11px;color:#888">${m.note||''}</td>
          <td style="padding:6px 10px;font-size:11px;color:#888"></td>
        </tr>`).join('');
 
      const emailHTML = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="font-family:Georgia,serif;color:#2c2c2a;max-width:700px;margin:0 auto;padding:20px">
<div style="border-bottom:3px solid #B8964E;padding-bottom:16px;margin-bottom:20px">
  <h2 style="font-size:22px;color:#B8964E;letter-spacing:.1em;font-weight:700;margin:0 0 3px">SIGNATURE CONSTRUCTION PROJECTS LTD</h2>
  <p style="font-size:11px;color:#888;margin:0;letter-spacing:.12em">QUANTITY SURVEYING CONSULTANCY</p>
</div>
<h1 style="font-size:18px;color:#1c1c1a;margin:0 0 5px">Materials Quotation Request</h1>
<p style="font-size:13px;color:#555;margin:0 0 20px">
  <strong>Project:</strong> ${project.name||'Residential Project'}<br>
  <strong>Client:</strong> ${project.client||'Client'}<br>
  <strong>Date:</strong> ${new Date().toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})}
</p>
<p style="font-size:13px;color:#333;line-height:1.7;margin-bottom:20px">
  Dear ${merchant.name},<br><br>
  Please find attached the architect's drawings and materials schedule for the above project.
  We would be grateful if you could provide your best trade pricing for the items listed below
  within <strong>5 working days</strong>.
</p>
<table style="width:100%;border-collapse:collapse;margin-bottom:20px">
  <thead><tr style="background:#1c1c1a">
    <th style="padding:8px 10px;font-size:10px;color:#B8964E;text-align:left;letter-spacing:.07em">MATERIAL / ITEM</th>
    <th style="padding:8px 10px;font-size:10px;color:#B8964E;text-align:right;letter-spacing:.07em">UNIT</th>
    <th style="padding:8px 10px;font-size:10px;color:#B8964E;text-align:right;letter-spacing:.07em">QTY</th>
    <th style="padding:8px 10px;font-size:10px;color:#B8964E;text-align:left;letter-spacing:.07em">SPECIFICATION</th>
    <th style="padding:8px 10px;font-size:10px;color:#B8964E;text-align:left;letter-spacing:.07em">YOUR PRICE (£)</th>
  </tr></thead>
  <tbody>${tableRows}</tbody>
</table>
<div style="background:#f9f7f2;border:1px solid #e8e3da;border-radius:4px;padding:12px 16px;margin-bottom:20px;font-size:12px;color:#555;line-height:1.7">
  <strong>Notes:</strong><br>
  • All quantities include 10% wastage allowance<br>
  • Please price per unit and confirm availability<br>
  • Architect's drawings attached for reference<br>
  • CSV schedule also attached for convenience
</div>
<p style="font-size:12px;color:#333;line-height:1.7">
  Please return your quotation to:<br><strong>Jerome</strong><br>
  Signature Construction Projects Ltd<br>
  <a href="mailto:jerome@signature-construction.com" style="color:#B8964E">jerome@signature-construction.com</a>
</p>
</body></html>`;
 
      const attachments = [];
      if (csvData) attachments.push({ filename: `Materials_${(project.name||'Project').replace(/\s+/g,'_')}.csv`, content: Buffer.from(csvData).toString('base64'), type: 'text/csv' });
      if (drawings && drawings.length > 0) {
        drawings.slice(0, 3).forEach(dwg => {
          if (dwg.base64 && dwg.name) attachments.push({ filename: dwg.name, content: dwg.base64, type: dwg.type||'application/pdf' });
        });
      }
 
      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Signature QS <onboarding@resend.dev>',
          to: [merchant.email],
          reply_to: 'jerome@signature-construction.com',
          subject: `Materials Quotation Request — ${project.name||'Residential Project'} — ${new Date().toLocaleDateString('en-GB')}`,
          html: emailHTML,
          attachments,
        }),
      });
 
      const emailData = await emailRes.json();
      results.push(emailRes.ok ? { merchant: merchant.name, status: 'sent', id: emailData.id } : { merchant: merchant.name, status: 'error', error: emailData.message||'Send failed' });
 
    } catch (err) {
      results.push({ merchant: merchant.name, status: 'error', error: err.message });
    }
  }
 
  res.json({ success: results.some(r => r.status==='sent'), results });
});
 
app.listen(PORT, () => {
  console.log(`Signature QS Proxy v3.0 running on port ${PORT}`);
  if (!API_KEY) console.warn('WARNING: ANTHROPIC_API_KEY not set');
  if (!RESEND_KEY) console.warn('WARNING: RESEND_API_KEY not set');
});
 
