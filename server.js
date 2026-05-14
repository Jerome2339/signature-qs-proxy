const express = require('express');
const multer = require('multer');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.ANTHROPIC_API_KEY;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

app.use(cors());
app.use(express.json({ limit: '20mb' }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '1.3.0' });
});

// Keep-alive ping every 10 minutes to prevent Render free tier sleeping
const PROXY_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
setInterval(() => {
  fetch(`${PROXY_URL}/health`)
    .then(() => console.log('Keep-alive ping sent'))
    .catch(err => console.warn('Keep-alive failed:', err.message));
}, 10 * 60 * 1000);

// ── DRAWING ANALYSIS ENDPOINT ─────────────────────────────────────────────
app.post('/analyse-drawing', upload.array('drawings', 10), async (req, res) => {
  if (!API_KEY) {
    return res.status(500).json({ error: 'API key not configured on server' });
  }
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No drawing files uploaded' });
  }

  try {
    const contentParts = [];

    for (const file of req.files) {
      const b64 = file.buffer.toString('base64');
      const mimetype = file.mimetype.toLowerCase();
      const ext = (file.originalname || '').split('.').pop().toLowerCase();
      const isPDF = mimetype === 'application/pdf' || ext === 'pdf';

      if (isPDF) {
        // PDFs use document type
        contentParts.push({
          type: 'document',
          source: {
            type: 'base64',
            media_type: 'application/pdf',
            data: b64,
          },
        });
      } else {
        // Images use image type
        const imageType = getImageMediaType(mimetype, ext);
        if (!imageType) {
          return res.status(400).json({
            error: `Unsupported file type: ${mimetype}. Please upload PDF, PNG, JPG or WebP.`
          });
        }
        contentParts.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: imageType,
            data: b64,
          },
        });
      }
    }

    contentParts.push({
      type: 'text',
      text: `You are a senior quantity surveyor reviewing architect's drawings for a residential extension.

Extract ALL of the following from the drawings provided. Return ONLY valid JSON, no markdown, no preamble.

{
  "project_name": "address or project name if visible or null",
  "drawing_type": ["list all drawing types visible: floor plan, elevation, section, roof plan, site plan, schedule"],
  "floor": {
    "length_m": number_or_null,
    "width_m": number_or_null,
    "area_m2": number_or_null,
    "ceiling_height_m": number_or_null
  },
  "walls": [
    { "label": "wall description e.g. Front wall", "length_m": number, "height_m": number, "is_external": true_or_false }
  ],
  "openings": [
    { "label": "e.g. Bifolding doors", "type": "window/door/bifold/rooflight", "width_m": number, "height_m": number, "qty": number }
  ],
  "roof": {
    "type": "flat/pitched/unknown",
    "span_m": number_or_null,
    "length_m": number_or_null,
    "pitch_degrees": number_or_null,
    "overhang_m": number_or_null
  },
  "wall_construction": "cavity/solid/timber/unknown",
  "floor_construction": "concrete/timber/unknown",
  "notes": ["any important assumptions or warnings"],
  "confidence": {
    "floor_dims": "high/medium/low",
    "wall_dims": "high/medium/low",
    "openings": "high/medium/low",
    "roof": "high/medium/low",
    "construction_type": "high/medium/low"
  },
  "missing": ["list of dimensions or info that could not be found in the drawings"]
}

Strict rules:
- ONLY extract dimensions explicitly annotated as numbers on the drawings
- DO NOT estimate or scale from a scale bar
- Dimensions in mm: divide by 1000 to convert to metres
- Dimensions in feet/inches: convert to metres
- If a value is not shown, set to null and add to missing array
- Be conservative — null is better than a wrong number`
    });

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'pdfs-2024-09-25',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 2000,
        messages: [{ role: 'user', content: contentParts }],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      console.error('Anthropic API error:', anthropicRes.status, errText);
      return res.status(502).json({
        error: `AI API error: ${anthropicRes.status}`,
        detail: errText.substring(0, 300),
      });
    }

    const data = await anthropicRes.json();
    const raw = data.content.map(c => c.text || '').join('').replace(/```json|```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      console.error('JSON parse error. Raw:', raw.substring(0, 500));
      return res.status(502).json({
        error: 'Could not parse AI response as JSON',
        raw: raw.substring(0, 500),
      });
    }

    res.json({ success: true, data: parsed });

  } catch (err) {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

function getImageMediaType(mimetype, ext) {
  if (mimetype === 'image/jpeg' || mimetype === 'image/jpg' || ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (mimetype === 'image/png' || ext === 'png') return 'image/png';
  if (mimetype === 'image/webp' || ext === 'webp') return 'image/webp';
  return null;
}

app.listen(PORT, () => {
  console.log(`Signature QS Proxy v1.2 running on port ${PORT}`);
  if (!API_KEY) console.warn('WARNING: ANTHROPIC_API_KEY not set');
});
