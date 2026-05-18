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
 
// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '2.0.0' });
});
 
// Keep-alive ping every 10 minutes
const PROXY_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
setInterval(() => {
  fetch(`${PROXY_URL}/health`)
    .then(() => console.log('Keep-alive ping sent'))
    .catch(err => console.warn('Keep-alive failed:', err.message));
}, 10 * 60 * 1000);
 
// ── DRAWING ANALYSIS ENDPOINT ─────────────────────────────────────────────
app.post('/analyse-drawing', upload.array('drawings', 10), async (req, res) => {
  if (!API_KEY) return res.status(500).json({ error: 'API key not configured' });
  if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No files uploaded' });
 
  try {
    const contentParts = [];
 
    for (const file of req.files) {
      const b64 = file.buffer.toString('base64');
      const mimetype = file.mimetype.toLowerCase();
      const ext = (file.originalname || '').split('.').pop().toLowerCase();
      const isPDF = mimetype === 'application/pdf' || ext === 'pdf';
 
      if (isPDF) {
        contentParts.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } });
      } else {
        const imageType = getImageType(mimetype, ext);
        if (!imageType) return res.status(400).json({ error: `Unsupported file type: ${mimetype}` });
        contentParts.push({ type: 'image', source: { type: 'base64', media_type: imageType, data: b64 } });
      }
    }
 
    contentParts.push({
      type: 'text',
      text: `You are a senior quantity surveyor reviewing architect's drawings for a residential extension.
Extract ALL of the following. Return ONLY valid JSON, no markdown.
{"project_name":null,"drawing_type":[],"floor":{"length_m":null,"width_m":null,"area_m2":null,"ceiling_height_m":null},"walls":[{"label":"string","length_m":0,"height_m":0,"is_external":true}],"openings":[{"label":"string","type":"window/door/bifold","width_m":0,"height_m":0,"qty":1}],"roof":{"type":"flat/pitched/unknown","span_m":null,"length_m":null,"pitch_degrees":null,"overhang_m":null},"wall_construction":"cavity/solid/timber/unknown","floor_construction":"concrete/timber/unknown","notes":[],"confidence":{"floor_dims":"high/medium/low","wall_dims":"high/medium/low","openings":"high/medium/low","roof":"high/medium/low","construction_type":"high/medium/low"},"missing":[]}
Rules: Only extract explicitly annotated dimensions. Convert mm to m. Never estimate from scale. Return null for missing values.`
    });
 
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'pdfs-2024-09-25' },
      body: JSON.stringify({ model: 'claude-sonnet-4-5', max_tokens: 2000, messages: [{ role: 'user', content: contentParts }] }),
    });
 
    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      return res.status(502).json({ error: `AI API error: ${anthropicRes.status}`, detail: errText.substring(0, 300) });
    }
 
    const data = await anthropicRes.json();
    const raw = data.content.map(c => c.text || '').join('').replace(/```json|```/g, '').trim();
    let parsed;
    try { parsed = JSON.parse(raw); } catch (e) {
      return res.status(502).json({ error: 'Could not parse AI response', raw: raw.substring(0, 500) });
    }
 
    res.json({ success: true, data: parsed });
  } catch (err) {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});
 
// ── SEND QUOTE TO MERCHANT ENDPOINT ──────────────────────────────────────
// POST /send-quote
// Body: { merchants: [...], materials: [...], project: {...}, drawings: [{name, base64, type}], csvData: '...' }
app.post('/send-quote', async (req, res) => {
  if (!RESEND_KEY) return res.status(500).json({ error: 'Resend API key not configured' });
 
  const { merchants, materials, project, drawings, csvData } = req.body;
  if (!merchants || !merchants.length) return res.status(400).json({ error: 'No merchants specified' });
 
  // Merchant routing rules — which categories each merchant receives
  const MERCHANT_CATEGORIES = {
    builders: ['Masonry', 'Timber Frame', 'Floor (Concrete)', 'Floor (Timber)', 'Roof (Flat)', 'Roof (Pitched)', 'Boards & Linings', 'Structural', 'Fixings & Sundries', 'Insulation (Walls)'],
    kitchen:  ['Kitchen', 'Kitchen Fittings', 'Kitchen & Joinery'],
    bathroom: ['Bathroom', 'Bathroom Fittings', 'Sanitaryware', 'Plumbing'],
    tiling:   ['Tiling', 'Floor Tiles', 'Wall Tiles', 'Tiles & Tiling'],
  };
 
  const results = [];
 
  for (const merchant of merchants) {
    try {
      // Filter materials relevant to this merchant type
      const relevantCats = MERCHANT_CATEGORIES[merchant.type] || MERCHANT_CATEGORIES.builders;
      const filteredMats = materials.filter(m => relevantCats.some(cat =>
        m.cat.toLowerCase().includes(cat.toLowerCase()) ||
        cat.toLowerCase().includes(m.cat.toLowerCase())
      ));
 
      // If no matching materials, skip this merchant unless it's the builders merchant
      if (filteredMats.length === 0 && merchant.type !== 'builders') {
        results.push({ merchant: merchant.name, status: 'skipped', reason: 'No relevant materials' });
        continue;
      }
 
      const matsToSend = filteredMats.length > 0 ? filteredMats : materials;
 
      // Build materials table HTML
      const tableRows = matsToSend.map(m =>
        `<tr style="border-bottom:1px solid #e8e3da">
          <td style="padding:6px 10px;font-size:12px">${m.item}</td>
          <td style="padding:6px 10px;font-size:12px;text-align:right">${m.unit}</td>
          <td style="padding:6px 10px;font-size:12px;text-align:right;font-weight:600">${typeof m.qty === 'number' ? m.qty.toLocaleString('en-GB') : m.qty}</td>
          <td style="padding:6px 10px;font-size:11px;color:#888">${m.note || ''}</td>
          <td style="padding:6px 10px;font-size:11px;color:#888"></td>
        </tr>`
      ).join('');
 
      // Build email HTML
      const emailHTML = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:Georgia,serif;color:#2c2c2a;max-width:700px;margin:0 auto;padding:20px">
  <div style="border-bottom:3px solid #B8964E;padding-bottom:16px;margin-bottom:20px">
    <h2 style="font-size:22px;color:#B8964E;letter-spacing:.1em;font-weight:700;margin:0 0 3px">SIGNATURE CONSTRUCTION PROJECTS LTD</h2>
    <p style="font-size:11px;color:#888;margin:0;letter-spacing:.12em">QUANTITY SURVEYING CONSULTANCY</p>
  </div>
 
  <h1 style="font-size:18px;color:#1c1c1a;margin:0 0 5px">Materials Quotation Request</h1>
  <p style="font-size:13px;color:#555;margin:0 0 20px">
    <strong>Project:</strong> ${project.name || 'Residential Extension'}<br>
    <strong>Client:</strong> ${project.client || 'Client'}<br>
    <strong>Date:</strong> ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
  </p>
 
  <p style="font-size:13px;color:#333;line-height:1.7;margin-bottom:20px">
    Dear ${merchant.name},<br><br>
    We are writing on behalf of our client in connection with the above project.
    Please find attached the architect's drawings and materials schedule for your review.
    We would be grateful if you could provide your best trade pricing for the items listed below.<br><br>
    Please return your quotation within <strong>5 working days</strong>. If you have any queries
    regarding specifications or quantities, please do not hesitate to contact us.
  </p>
 
  <h3 style="font-size:13px;font-weight:700;color:#1c1c1a;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px">
    Materials Schedule ${merchant.type !== 'builders' ? '— ' + merchant.name + ' Items' : ''}
  </h3>
 
  <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
    <thead>
      <tr style="background:#1c1c1a">
        <th style="padding:8px 10px;font-size:10px;color:#B8964E;text-align:left;letter-spacing:.07em">MATERIAL / ITEM</th>
        <th style="padding:8px 10px;font-size:10px;color:#B8964E;text-align:right;letter-spacing:.07em">UNIT</th>
        <th style="padding:8px 10px;font-size:10px;color:#B8964E;text-align:right;letter-spacing:.07em">QTY</th>
        <th style="padding:8px 10px;font-size:10px;color:#B8964E;text-align:left;letter-spacing:.07em">SPECIFICATION</th>
        <th style="padding:8px 10px;font-size:10px;color:#B8964E;text-align:left;letter-spacing:.07em">YOUR PRICE (£)</th>
      </tr>
    </thead>
    <tbody>${tableRows}</tbody>
  </table>
 
  <div style="background:#f9f7f2;border:1px solid #e8e3da;border-radius:4px;padding:12px 16px;margin-bottom:20px;font-size:12px;color:#555;line-height:1.7">
    <strong>Notes:</strong><br>
    • All quantities include 10% wastage allowance<br>
    • Please price per unit and confirm availability<br>
    • Architect's drawings are attached for reference<br>
    • A CSV version of this schedule is also attached for your convenience
  </div>
 
  <p style="font-size:12px;color:#333;line-height:1.7">
    Please return your quotation to:<br>
    <strong>Jerome</strong><br>
    Signature Construction Projects Ltd<br>
    <a href="mailto:jerome@signature-construction.com" style="color:#B8964E">jerome@signature-construction.com</a>
  </p>
 
  <div style="border-top:1px solid #e8e3da;margin-top:20px;padding-top:12px;font-size:10px;color:#aaa">
    This quotation request was generated by Signature QS Platform. All quantities are indicative and should be verified against drawings before ordering.
  </div>
</body>
</html>`;
 
      // Build attachments array
      const attachments = [];
 
      // Add CSV attachment
      if (csvData) {
        attachments.push({
          filename: `Materials_Schedule_${(project.name || 'Project').replace(/\s+/g, '_')}.csv`,
          content: Buffer.from(csvData).toString('base64'),
          type: 'text/csv',
        });
      }
 
      // Add drawings (up to 3 to keep email size manageable)
      if (drawings && drawings.length > 0) {
        const drawingsToAttach = drawings.slice(0, 3);
        for (const dwg of drawingsToAttach) {
          if (dwg.base64 && dwg.name) {
            attachments.push({
              filename: dwg.name,
              content: dwg.base64,
              type: dwg.type || 'application/pdf',
            });
          }
        }
      }
 
      // Send via Resend
      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Signature QS <onboarding@resend.dev>',
          to: [merchant.email],
          reply_to: 'jerome@signature-construction.com',
          subject: `Materials Quotation Request — ${project.name || 'Residential Project'} — ${new Date().toLocaleDateString('en-GB')}`,
          html: emailHTML,
          attachments,
        }),
      });
 
      const emailData = await emailRes.json();
 
      if (!emailRes.ok) {
        results.push({ merchant: merchant.name, status: 'error', error: emailData.message || 'Send failed' });
      } else {
        results.push({ merchant: merchant.name, status: 'sent', id: emailData.id });
      }
 
    } catch (err) {
      results.push({ merchant: merchant.name, status: 'error', error: err.message });
    }
  }
 
  const allSent = results.every(r => r.status === 'sent');
  const anySent = results.some(r => r.status === 'sent');
  res.json({ success: anySent, results });
});
 
function getImageType(mimetype, ext) {
  if (mimetype === 'image/jpeg' || mimetype === 'image/jpg' || ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (mimetype === 'image/png' || ext === 'png') return 'image/png';
  if (mimetype === 'image/webp' || ext === 'webp') return 'image/webp';
  return null;
}
 
app.listen(PORT, () => {
  console.log(`Signature QS Proxy v2.0 running on port ${PORT}`);
  if (!API_KEY) console.warn('WARNING: ANTHROPIC_API_KEY not set');
  if (!RESEND_KEY) console.warn('WARNING: RESEND_API_KEY not set');
});
 
