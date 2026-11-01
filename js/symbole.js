// Symbole für die Karte: Schiffsrümpfe, Pfeile und Flugzeug-Umrisse (von oben, Bug/Nase nach oben).
// Gezeichnet als Fläche und in ein „Distanzfeld“ (SDF) umgerechnet: so lassen sich die Symbole
// beliebig einfärben, mit Rand versehen und ohne Treppchen stark vergrößern (echte Größe beim Heranzoomen).

const PR = 2;      // Bildpunkte je logischem Punkt
const PUFFER = 4;  // logischer Rand für das Distanzfeld

/** logische Maße der Symbole (ohne Rand) – für die Umrechnung auf echte Größe */
export const MASS = {
  "s-rumpf": { w: 22, h: 128, laenge: 128 },
  "s-rumpf-breit": { w: 40, h: 128, laenge: 128 },
  "s-pfeil": { w: 16, h: 22 },
  "s-punkt": { w: 12, h: 12 },
  "f-jet2": { w: 48, h: 48, spann: 47 },
  "f-jet4": { w: 48, h: 48, spann: 47 },
  "f-heck": { w: 48, h: 48, spann: 46 },
  "f-prop2": { w: 48, h: 48, spann: 47 },
  "f-prop4": { w: 48, h: 48, spann: 47 },
  "f-prop1": { w: 48, h: 48, spann: 47 },
  "f-heli": { w: 48, h: 48, spann: 46 },
  "f-segler": { w: 48, h: 48, spann: 47 },
  "f-kampf": { w: 48, h: 48, spann: 40 },
  "f-ballon": { w: 48, h: 48, spann: 44 },
  "f-boden": { w: 48, h: 48, spann: 22 },
};

function zeichnen(name, g) {
  const p = new Path2D();
  switch (name) {
    case "s-rumpf": case "s-rumpf-breit": {
      const w = MASS[name].w, h = MASS[name].h;
      const r = w * 0.22, bug = name === "s-rumpf" ? 0.2 : 0.3;
      // Heck (unten) leicht abgerundet, Bug (oben) spitz zulaufend
      p.moveTo(w / 2, 0);
      p.bezierCurveTo(w * 0.78, h * bug * 0.25, w, h * bug * 0.62, w, h * bug);
      p.lineTo(w, h - r);
      p.quadraticCurveTo(w, h, w - r, h);
      p.lineTo(r, h);
      p.quadraticCurveTo(0, h, 0, h - r);
      p.lineTo(0, h * bug);
      p.bezierCurveTo(0, h * bug * 0.62, w * 0.22, h * bug * 0.25, w / 2, 0);
      p.closePath();
      g.fill(p);
      return;
    }
    case "s-pfeil": {
      p.moveTo(8, 0); p.lineTo(16, 22); p.lineTo(8, 17); p.lineTo(0, 22); p.closePath();
      g.fill(p); return;
    }
    case "s-punkt": {
      p.moveTo(6, 0); p.lineTo(12, 6); p.lineTo(6, 12); p.lineTo(0, 6); p.closePath();
      g.fill(p); return;
    }
    case "f-jet2": case "f-jet4": {
      // Rumpf
      p.moveTo(24, 0.5); p.bezierCurveTo(26.4, 2, 26.6, 6, 26.6, 9); p.lineTo(26.6, 38); p.bezierCurveTo(26.6, 42, 25.4, 46, 24, 47.5);
      p.bezierCurveTo(22.6, 46, 21.4, 42, 21.4, 38); p.lineTo(21.4, 9); p.bezierCurveTo(21.4, 6, 21.6, 2, 24, 0.5); p.closePath();
      // Flügel (gepfeilt)
      p.moveTo(26, 17); p.lineTo(47.5, 29.5); p.lineTo(47.5, 31.5); p.lineTo(26, 26); p.closePath();
      p.moveTo(22, 17); p.lineTo(0.5, 29.5); p.lineTo(0.5, 31.5); p.lineTo(22, 26); p.closePath();
      // Höhenleitwerk
      p.moveTo(25.5, 39); p.lineTo(34, 45); p.lineTo(34, 46.5); p.lineTo(25.5, 44.5); p.closePath();
      p.moveTo(22.5, 39); p.lineTo(14, 45); p.lineTo(14, 46.5); p.lineTo(22.5, 44.5); p.closePath();
      g.fill(p);
      // Triebwerke
      const tw = name === "f-jet4" ? [[33, 21.6], [41, 26.2], [15, 21.6], [7, 26.2]] : [[34, 22.2], [14, 22.2]];
      for (const [x, y] of tw) { g.beginPath(); g.ellipse(x, y, 1.9, 3.6, 0, 0, Math.PI * 2); g.fill(); }
      return;
    }
    case "f-heck": {
      p.moveTo(24, 1); p.bezierCurveTo(26.2, 3, 26.4, 7, 26.4, 10); p.lineTo(26.4, 40); p.bezierCurveTo(26.4, 43, 25.4, 46, 24, 47);
      p.bezierCurveTo(22.6, 46, 21.6, 43, 21.6, 40); p.lineTo(21.6, 10); p.bezierCurveTo(21.6, 7, 21.8, 3, 24, 1); p.closePath();
      p.moveTo(26, 19); p.lineTo(47, 29); p.lineTo(47, 31); p.lineTo(26, 27); p.closePath();
      p.moveTo(22, 19); p.lineTo(1, 29); p.lineTo(1, 31); p.lineTo(22, 27); p.closePath();
      p.moveTo(25, 42); p.lineTo(33, 45.5); p.lineTo(33, 47); p.lineTo(25, 46); p.closePath();
      p.moveTo(23, 42); p.lineTo(15, 45.5); p.lineTo(15, 47); p.lineTo(23, 46); p.closePath();
      g.fill(p);
      for (const x of [29, 19]) { g.beginPath(); g.ellipse(x, 36, 2, 4, 0, 0, Math.PI * 2); g.fill(); }
      return;
    }
    case "f-prop2": case "f-prop4": case "f-prop1": {
      const einmot = name === "f-prop1";
      const rb = einmot ? 2.2 : 2.6;
      p.moveTo(24, 2); p.bezierCurveTo(24 + rb, 3, 24 + rb, 7, 24 + rb, 10); p.lineTo(24 + rb * 0.7, 42); p.lineTo(24, 46);
      p.lineTo(24 - rb * 0.7, 42); p.lineTo(24 - rb, 10); p.bezierCurveTo(24 - rb, 7, 24 - rb, 3, 24, 2); p.closePath();
      const fy = einmot ? 13 : 16;
      p.moveTo(24, fy); p.lineTo(47.5, fy + 1); p.lineTo(47.5, fy + 6); p.lineTo(24, fy + 7); p.lineTo(0.5, fy + 6); p.lineTo(0.5, fy + 1); p.closePath();
      p.moveTo(24, 38); p.lineTo(34, 39); p.lineTo(34, 43); p.lineTo(24, 44); p.lineTo(14, 43); p.lineTo(14, 39); p.closePath();
      g.fill(p);
      const mot = einmot ? [] : name === "f-prop4" ? [[33, fy - 1], [41, fy], [15, fy - 1], [7, fy]] : [[34, fy - 1.5], [14, fy - 1.5]];
      for (const [x, y] of mot) { g.beginPath(); g.ellipse(x, y + 3, 1.9, 5, 0, 0, Math.PI * 2); g.fill(); g.fillRect(x - 4.5, y - 2.4, 9, 1.2); }
      if (einmot) g.fillRect(19, 1.2, 10, 1.3);
      return;
    }
    case "f-heli": {
      g.beginPath(); g.arc(24, 18, 23, 0, Math.PI * 2); g.lineWidth = 1.6; g.stroke(); // Rotorkreis
      g.beginPath(); g.ellipse(24, 18, 5, 8.5, 0, 0, Math.PI * 2); g.fill();       // Kabine
      g.fillRect(23, 24, 2, 21);                                                 // Heckausleger
      g.fillRect(19.5, 42, 9, 2.2);                                              // Heckrotor
      g.lineWidth = 2.2;
      g.beginPath(); g.moveTo(24 - 16, 18 - 16); g.lineTo(24 + 16, 18 + 16); g.moveTo(24 + 16, 18 - 16); g.lineTo(24 - 16, 18 + 16); g.stroke();
      return;
    }
    case "f-segler": {
      p.moveTo(24, 6); p.bezierCurveTo(25.5, 7, 25.6, 10, 25.4, 13); p.lineTo(24.6, 42); p.lineTo(23.4, 42); p.lineTo(22.6, 13); p.bezierCurveTo(22.4, 10, 22.5, 7, 24, 6); p.closePath();
      p.moveTo(24, 15); p.lineTo(47.5, 16.5); p.lineTo(47.5, 18.5); p.lineTo(24, 19.5); p.lineTo(0.5, 18.5); p.lineTo(0.5, 16.5); p.closePath();
      p.moveTo(24, 39.5); p.lineTo(30, 40); p.lineTo(30, 42); p.lineTo(18, 42); p.lineTo(18, 40); p.closePath();
      g.fill(p); return;
    }
    case "f-kampf": {
      p.moveTo(24, 0.5); p.bezierCurveTo(25.6, 4, 26, 10, 26, 14); p.lineTo(44, 34); p.lineTo(44, 37); p.lineTo(27, 35); p.lineTo(27, 40);
      p.lineTo(34, 46); p.lineTo(34, 47.5); p.lineTo(24, 46); p.lineTo(14, 47.5); p.lineTo(14, 46); p.lineTo(21, 40); p.lineTo(21, 35);
      p.lineTo(4, 37); p.lineTo(4, 34); p.lineTo(22, 14); p.bezierCurveTo(22, 10, 22.4, 4, 24, 0.5); p.closePath();
      g.fill(p); return;
    }
    case "f-ballon": {
      g.beginPath(); g.arc(24, 24, 22, 0, Math.PI * 2); g.fill(); return;
    }
    case "f-boden": {
      const x = 13, y = 6, w = 22, h = 36, r = 4;
      p.moveTo(x + r, y); p.lineTo(x + w - r, y); p.quadraticCurveTo(x + w, y, x + w, y + r); p.lineTo(x + w, y + h - r); p.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      p.lineTo(x + r, y + h); p.quadraticCurveTo(x, y + h, x, y + h - r); p.lineTo(x, y + r); p.quadraticCurveTo(x, y, x + r, y); p.closePath();
      g.fill(p); return;
    }
    default:
  }
}

// ------------------------------------------------------------------ Distanzfeld (nach Felzenszwalb & Huttenlocher, wie TinySDF)
const INF = 1e20;
function edt1d(grid, offset, stride, length, f, v, z) {
  v[0] = 0; z[0] = -INF; z[1] = INF;
  for (let i = 0; i < length; i++) f[i] = grid[offset + i * stride];
  for (let q = 1, k = 0, s = 0; q < length; q++) {
    do { const r = v[k]; s = (f[q] - f[r] + q * q - r * r) / (q - r) / 2; } while (s <= z[k] && --k > -1);
    k++; v[k] = q; z[k] = s; z[k + 1] = INF;
  }
  for (let q = 0, k = 0; q < length; q++) {
    while (z[k + 1] < q) k++;
    const r = v[k], qr = q - r;
    grid[offset + q * stride] = f[r] + qr * qr;
  }
}
function edt(data, w, h) {
  const n = Math.max(w, h), f = new Float64Array(n), v = new Uint16Array(n), z = new Float64Array(n + 1);
  for (let x = 0; x < w; x++) edt1d(data, x, w, h, f, v, z);
  for (let y = 0; y < h; y++) edt1d(data, y * w, 1, w, f, v, z);
}

/** Symbol als SDF-Bild { width, height, data } für map.addImage(…, { sdf: true, pixelRatio }) */
export function sdfBild(name) {
  const m = MASS[name];
  const W = Math.ceil((m.w + 2 * PUFFER) * PR), H = Math.ceil((m.h + 2 * PUFFER) * PR);
  const c = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(W, H) : Object.assign(document.createElement("canvas"), { width: W, height: H });
  const g = c.getContext("2d");
  g.setTransform(PR, 0, 0, PR, PUFFER * PR, PUFFER * PR);
  g.fillStyle = "#fff"; g.strokeStyle = "#fff";
  zeichnen(name, g);
  const a = g.getImageData(0, 0, W, H).data;
  const aussen = new Float64Array(W * H), innen = new Float64Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const al = a[i * 4 + 3] / 255;
    if (al === 1) { aussen[i] = 0; innen[i] = INF; }
    else if (al === 0) { aussen[i] = INF; innen[i] = 0; }
    else { const d = Math.max(0, 0.5 - al); aussen[i] = d * d; const e = Math.max(0, al - 0.5); innen[i] = e * e; }
  }
  edt(aussen, W, H); edt(innen, W, H);
  const radius = PUFFER * PR, cutoff = 0.25;
  const out = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const d = Math.sqrt(aussen[i]) - Math.sqrt(innen[i]);
    out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = 255;
    out[i * 4 + 3] = Math.max(0, Math.min(255, Math.round(255 - 255 * (d / radius + cutoff))));
  }
  return { width: W, height: H, data: out };
}

export const BILD_PR = PR;

/** Alle Symbole in die Karte laden */
export function symboleLaden(map) {
  for (const name of Object.keys(MASS)) {
    if (map.hasImage(name)) continue;
    map.addImage(name, sdfBild(name), { sdf: true, pixelRatio: PR });
  }
}

/** Kleines farbiges Vorschaubild (für Listen, Legende, Infobox) als Data-URL */
const vorschauCache = new Map();
export function vorschau(name, farbe, groesse = 28, drehung = 0) {
  const k = name + farbe + groesse + drehung;
  if (vorschauCache.has(k)) return vorschauCache.get(k);
  const m = MASS[name];
  const s = groesse * 2;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const g = c.getContext("2d");
  const f = Math.min(s / (m.w + 4), s / (m.h + 4));
  g.translate(s / 2, s / 2);
  g.rotate(drehung * Math.PI / 180);
  g.scale(f, f);
  g.translate(-m.w / 2, -m.h / 2);
  g.fillStyle = farbe; g.strokeStyle = farbe;
  g.shadowColor = "rgba(0,0,0,.6)"; g.shadowBlur = 2;
  zeichnen(name, g);
  const url = c.toDataURL();
  vorschauCache.set(k, url);
  return url;
}
