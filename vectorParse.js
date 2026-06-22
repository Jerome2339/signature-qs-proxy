// vectorParse.js — deterministic schedule/geometry reader for vector (CAD-exported) PDFs.
// Reads the architect's actual text + coordinates instead of measuring a picture.
// Exports parseVectorPDF(buffer) -> { vector, usable, openings, door_count, window_count,
//                                     rooms, floor_areas, roof_pitch }
// On any failure returns { vector:false, usable:false } so the caller falls back cleanly.

const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

// ── helpers ─────────────────────────────────────────────────────────────────
const isBool = s => /^(tba|n\/a|yes|no|-)$/i.test(s.trim());
const isType = s => /\b(bay|bi-?fold|slid|bow)/i.test(s);
const REF_RE = /^[WD]\d{1,2}$/;
const HEADER_RE = /^(schedule|window|door|location|structural|opening|lintel|escape|safety|obscure|glazing|notes|leaf|size|latch|handle|type|ref|reference)$/i;

async function pageItems(doc, p) {
  const page = await doc.getPage(p);
  const tc = await page.getTextContent();
  return tc.items.map(it => ({
    str: (it.str || '').trim(),
    x: +it.transform[4].toFixed(1),
    y: +it.transform[5].toFixed(1),
  })).filter(i => i.str !== '');
}
function clusterGroups(items, axis, tol = 3) {
  const s = items.slice().sort((a, b) => a[axis] - b[axis]);
  const g = []; let c = [];
  s.forEach(r => { if (!c.length || Math.abs(r[axis] - c[c.length - 1][axis]) <= tol) c.push(r); else { g.push(c); c = [r]; } });
  if (c.length) g.push(c);
  return g;
}
const largest = (items, axis, tol) => clusterGroups(items, axis, tol).sort((a, b) => b.length - a.length)[0] || [];
const median = a => { a = a.slice().sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; };
function pickAxis(refs) {
  const sd = a => { const m = a.reduce((s, v) => s + v, 0) / a.length; return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length); };
  return sd(refs.map(r => r.x)) >= sd(refs.map(r => r.y)) ? 'x' : 'y';
}
// Isolate the cross-axis cluster (table) that contains the ref band — prevents the
// window and door schedules (which share x-columns) from contaminating each other.
function tableItems(allItems, refs, cross, gap = 110) {
  const refC = refs.map(r => r[cross]).sort((a, b) => a - b);
  const med = refC[Math.floor(refC.length / 2)];
  const groups = clusterGroups(allItems, cross, gap);
  return groups.find(g => { const ys = g.map(i => i[cross]); return med >= Math.min(...ys) - 1 && med <= Math.max(...ys) + 1; }) || allItems;
}
function findLocation(ref, axis, cross, tbl) {
  const col = tbl.filter(i => Math.abs(i[axis] - ref[axis]) <= 4 && /[A-Za-z]/.test(i.str)
    && !REF_RE.test(i.str) && !isBool(i.str) && !isType(i.str) && !HEADER_RE.test(i.str) && !/^\d/.test(i.str));
  col.sort((a, b) => Math.abs(a[cross] - ref[cross]) - Math.abs(b[cross] - ref[cross]));
  return col[0] ? col[0].str : null;
}
function findType(ref, axis, tbl, re, val, fallback) {
  const t = tbl.find(i => Math.abs(i[axis] - ref[axis]) <= 4 && re.test(i.str));
  return t ? val : fallback;
}

// ── rooms (floor-plan labels) ─────────────────────────────────────────────────
const ROOM_RULES = [
  [/^kitchen/i, 'kitchen'], [/^bath/i, 'bathroom'], [/en.?suite/i, 'ensuite'],
  [/^w\.?c\.?$|toilet|cloak|powder/i, 'cloakroom'], [/utility|laundry/i, 'utility'],
  [/^dining/i, 'dining'], [/living|lounge/i, 'living'], [/^hall/i, 'hall'],
  [/garage/i, 'garage'], [/study|office/i, 'study'], [/^bed\s*room|^bedroom/i, 'bedroom'],
];
const classifyRoom = s => { for (const [re, t] of ROOM_RULES) if (re.test(s.trim())) return t; return null; };

// ── main ──────────────────────────────────────────────────────────────────────
async function parseVectorPDF(buffer) {
  try {
    const data = new Uint8Array(buffer);
    const doc = await pdfjsLib.getDocument({ data, useSystemFonts: true }).promise;

    // 1) vector / text-layer detection
    let totalItems = 0;
    const perPage = [];
    for (let p = 1; p <= doc.numPages; p++) { const its = await pageItems(doc, p); perPage.push(its); totalItems += its.length; }
    const hasTextLayer = totalItems / doc.numPages > 20;
    if (!hasTextLayer) return { vector: false, usable: false };

    // 2) schedule page
    let sp = null;
    for (let p = 1; p <= doc.numPages; p++) {
      if (perPage[p - 1].some(i => /window schedule|door schedule|schedule & detail/i.test(i.str))) { sp = p; break; }
    }
    const items = sp ? perPage[sp - 1] : [];
    const dims = items.map(i => { const m = i.str.match(/^(\d{3,4})\s*x\s*(\d{3,4})$/); return m ? { ...i, w: +m[1], h: +m[2] } : null; }).filter(Boolean);

    // 3) windows
    let windows = [];
    const wRefs = items.filter(i => /^W\d{1,2}$/.test(i.str));
    if (wRefs.length) {
      const ax = pickAxis(wRefs), cr = ax === 'x' ? 'y' : 'x';
      const sched = largest(wRefs, cr, 3);
      const wTbl = tableItems(items, sched, cr, 110);
      const wDims = dims.filter(d => d.h <= 1600);
      const used = new Set();
      windows = sched.sort((a, b) => a[ax] - b[ax]).map(r => {
        let best = null, bd = 1e9, bi = -1;
        wDims.forEach((d, idx) => { if (used.has(idx)) return; const dist = Math.abs(r[ax] - d[ax]); if (dist < bd) { bd = dist; best = d; bi = idx; } });
        if (best && bd <= 4) used.add(bi);
        return { ref: r.str, location: findLocation(r, ax, cr, wTbl), w: best && bd <= 4 ? best.w : null, h: best && bd <= 4 ? best.h : null, type: findType(r, ax, wTbl, /bay|bow/i, 'bay', 'standard') };
      }).sort((a, b) => a.ref.localeCompare(b.ref, undefined, { numeric: true }));
    }

    // 4) doors — structural opening = taller of the two dimension columns
    let doors = [];
    const dRefs = items.filter(i => /^D\d{1,2}$/.test(i.str));
    if (dRefs.length) {
      const ax = pickAxis(dRefs), cr = ax === 'x' ? 'y' : 'x';
      const sched = largest(dRefs, cr, 3);
      const dTbl = tableItems(items, sched, cr, 110);
      const dDims = dims.filter(d => d.h >= 1900);
      const bands = clusterGroups(dDims, cr, 5).map(g => ({ g, mh: median(g.map(d => d.h)) }));
      const struct = (bands.sort((a, b) => b.mh - a.mh)[0] || { g: [] }).g;
      doors = sched.sort((a, b) => a[ax] - b[ax]).map(r => {
        const m = struct.filter(d => Math.abs(d[ax] - r[ax]) <= 4).sort((a, b) => Math.abs(a[ax] - r[ax]) - Math.abs(b[ax] - r[ax]))[0];
        const colText = dTbl.filter(i => Math.abs(i[ax] - r[ax]) <= 4).map(i => i.str).join(' ').toLowerCase();
        let ty = findType(r, ax, dTbl, /bi-?fold|sliding|french/i, 'bifold', 'single');
        if (ty === 'single' && m && m.w >= 1500) ty = 'bifold';
        const loc = findLocation(r, ax, cr, dTbl) || '';
        const h = m ? m.h : null;
        // Fire-door flag wins (e.g. integral-garage door noted FD30) -> internal joinery
        const fireDoor = /\bfd\s?30\b|\bfd\s?60\b|\bfire\b/.test(colText);
        // External: head height >= 2100, bi-fold, garage (no fire note), or an external note keyword
        const external = !fireDoor && (
          (h && h >= 2100) || ty === 'bifold' || /garage/.test(loc) ||
          /bi-?fold|sliding|french|level threshold|patio|external/.test(colText)
        );
        return { ref: r.str, location: loc, w: m ? m.w : null, h, type: ty, external, fireDoor };
      }).sort((a, b) => a.ref.localeCompare(b.ref, undefined, { numeric: true }));
    }

    // 5) rooms (floor-plan labels)
    const rooms = []; const seen = new Set();
    for (let p = 1; p <= doc.numPages; p++) {
      const its = perPage[p - 1];
      const txt = its.map(i => i.str).join(' ');
      if (!/FLOOR PLAN/i.test(txt)) continue;
      const floor = /GROUND\s+FLOOR PLAN/i.test(txt) ? 'ground' : /FIRST\s+FLOOR PLAN/i.test(txt) ? 'first' : null;
      its.forEach(i => {
        const t = classifyRoom(i.str);
        if (!t) return;
        const k = i.str.toUpperCase() + '|' + floor;
        if (!seen.has(k)) { seen.add(k); rooms.push({ name: i.str, type: t, floor }); }
      });
    }

    // 6) geometry — floor areas + roof pitch
    let ga = null, fa = null, ta = null, pitch = null;
    for (let p = 1; p <= doc.numPages; p++) {
      const j = perPage[p - 1].map(i => i.str).join(' ');
      if (ga == null) { const m = j.match(/GROUND\s+([\d.]+)\s*m/i); if (m) ga = +m[1]; }
      if (fa == null) { const m = j.match(/FIRST\s+([\d.]+)\s*m/i); if (m) fa = +m[1]; }
      if (ta == null) { const m = j.match(/TOTAL\s+([\d.]+)\s*m/i); if (m) ta = +m[1]; }
      if (pitch == null) { const m = j.match(/(\d{2})\s*°/); if (m) pitch = +m[1]; }
    }

    // 7) map to the proxy's opening shape
    const openings = [
      ...doors.map(d => ({
        label: `${d.ref || 'Door'} — ${d.location || ''}`,
        type: d.type === 'bifold' ? 'bifold' : 'door',
        width_m: d.w ? d.w / 1000 : null,
        height_m: d.h ? d.h / 1000 : 2.1,
        qty: 1,
        external: !!d.external,
        fireDoor: !!d.fireDoor,
        location: d.location || '',
      })),
      ...windows.map(w => ({
        label: `${w.ref || 'Window'} — ${w.location || ''}${w.type === 'bay' ? ' (Bay)' : ''}`,
        type: 'window',
        width_m: w.w ? w.w / 1000 : null,
        height_m: w.h ? w.h / 1000 : 1.05,
        qty: 1,
        external: true,
        fireDoor: false,
        location: w.location || '',
      })),
    ].filter(o => o.width_m);

    // 8) sanity — only short-circuit the LLM pass if the read is clearly good
    const totalRefs = windows.length + doors.length;
    const sized = [...windows, ...doors].filter(o => o.w).length;
    const usable = totalRefs >= 3 && sized / Math.max(totalRefs, 1) >= 0.7 && openings.length >= 3;

    return {
      vector: true,
      usable,
      schedulePage: sp,
      openings,
      door_count: doors.length,
      window_count: windows.length,
      rooms,
      floor_areas: { ground_m2: ga, first_m2: fa, total_m2: ta },
      roof_pitch: pitch,
    };
  } catch (e) {
    return { vector: false, usable: false, error: e.message };
  }
}

module.exports = { parseVectorPDF };
