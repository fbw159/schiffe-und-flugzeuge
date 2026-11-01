// Figuren für den Live-Blick: Schiffe in Seitenansicht je nach Art (Bug rechts), Flugzeuge als Umriss von oben.
// Fertig gezeichnete Bilder werden je Art, Farbe und Größe zwischengespeichert (mit dunklem Rand, gut auf dem Kamerabild).
import { MASS, symbolPfad } from "./symbole.js";

export const SEITE_W = 64, SEITE_H = 26; // logisches Feld der Seitenansicht, Wasserlinie bei y = 19

/** Welche Seitenansicht passt zum Schiff? */
export function seitenArt(s) {
  if (s.kind === "sar") return "heli";
  const t = Number(s.typ) || 0;
  if (t === 36) return "segel";
  if (t === 37) return "motor";
  if (t === 52 || t === 31 || t === 32) return "schlepper";
  if (t === 30) return "fischer";
  if (t === 35) return "marine";
  switch (s.g) {
    case "fracht": return "fracht";
    case "tanker": return "tanker";
    case "passagier": return (s.len || 0) > 0 && s.len < 70 ? "ausflug" : "faehre";
    case "schnell": return "schnell";
    case "dienst": return t === 33 ? "bagger" : "arbeit";
    case "behoerde": return t === 51 ? "retter" : "behoerde";
    case "sport": return "motor";
    default: return "sonst";
  }
}
export const SEITEN_NAMEN = {
  fracht: "Containerschiff", tanker: "Tanker", faehre: "Fähre / Kreuzfahrt", ausflug: "Fahrgastschiff", schnell: "Schnellboot", fischer: "Fischkutter",
  schlepper: "Schlepper", arbeit: "Arbeitsschiff", bagger: "Bagger", behoerde: "Behördenschiff", retter: "Seenotretter", marine: "Marineschiff",
  segel: "Segelboot", motor: "Motorboot", heli: "Rettungsflugzeug", sonst: "Schiff",
};

function mische(farbe, ziel, f) {
  const h = (x) => parseInt(x, 16);
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(farbe);
  if (!m) return farbe;
  const z = ziel === "w" ? 255 : 0;
  const k = (i) => Math.round(h(m[i]) * (1 - f) + z * f);
  return `rgb(${k(1)},${k(2)},${k(3)})`;
}

// ------------------------------------------------------------------ Seitenansichten (Bug rechts)
const poly = (g, pts) => { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath(); g.fill(); };
const rect = (g, x, y, w, h) => g.fillRect(x, y, w, h);
function fenster(g, f, x0, x1, y, h = 1.1, schritt = 2.2) { if (f.schatten) return; g.fillStyle = f.detail; for (let x = x0; x < x1 - 0.8; x += schritt) g.fillRect(x, y, 1.2, h); }

const SEITE = {
  fracht(g, f) {
    g.fillStyle = f.rumpf; poly(g, [[1, 15.5], [60, 15.5], [64, 11.5], [61, 25], [6, 25], [1, 20]]);
    const hoehen = [3, 4, 4, 3, 4, 4, 3, 4, 2];
    hoehen.forEach((hh, i) => { g.fillStyle = f.schatten ? f.rumpf : (i % 2 ? f.dunkel : f.hell); rect(g, 13 + i * 4.8, 15.5 - hh * 1.7, 4.4, hh * 1.7); });
    g.fillStyle = f.aufbau; rect(g, 3.5, 3.5, 7.5, 12); g.fillStyle = f.rumpf; rect(g, 5, 1, 3, 3);
    fenster(g, f, 4.2, 10.5, 5.2); fenster(g, f, 4.2, 10.5, 8);
  },
  tanker(g, f) {
    g.fillStyle = f.rumpf; poly(g, [[1, 15], [60, 15], [64, 11], [61, 25], [6, 25], [1, 20]]);
    g.fillStyle = f.hell; rect(g, 14, 13.4, 42, 1.6); for (let x = 16; x < 56; x += 6) rect(g, x, 11.5, 1, 2);
    g.fillStyle = f.aufbau; rect(g, 3, 4.5, 9, 10.5); g.fillStyle = f.rumpf; rect(g, 4.5, 1.8, 3, 3);
    g.fillStyle = f.aufbau; poly(g, [[56, 15], [60, 15], [61, 12.5], [56, 12.5]]);
    fenster(g, f, 3.8, 11.5, 6.2); fenster(g, f, 3.8, 11.5, 9);
  },
  faehre(g, f) {
    g.fillStyle = f.rumpf; poly(g, [[1, 15], [57, 15], [64, 9.5], [60, 25], [6, 25], [1, 20]]);
    g.fillStyle = f.aufbau; poly(g, [[5, 15], [5, 4], [44, 4], [50, 7], [54, 11], [56, 15]]);
    g.fillStyle = f.rumpf; rect(g, 33, 0.8, 5, 3.4);
    fenster(g, f, 7, 46, 6.2); fenster(g, f, 7, 50, 9); fenster(g, f, 7, 53, 12, 1.1, 2);
    if (!f.schatten) { g.fillStyle = f.detail; rect(g, 3, 17, 55, 0.9); }
  },
  ausflug(g, f) {
    g.fillStyle = f.rumpf; poly(g, [[6, 17], [54, 17], [60, 14], [56, 24], [10, 24], [6, 20]]);
    g.fillStyle = f.aufbau; poly(g, [[10, 17], [10, 9], [42, 9], [48, 12], [50, 17]]);
    g.fillStyle = f.aufbau; rect(g, 14, 5.5, 18, 3.5);
    fenster(g, f, 12, 46, 11.5, 1.8, 3);
  },
  schnell(g, f) {
    g.fillStyle = f.rumpf; poly(g, [[2, 17.5], [54, 17.5], [64, 14], [57, 22.5], [7, 22.5], [2, 20.5]]);
    g.fillStyle = f.aufbau; poly(g, [[18, 17.5], [21, 11], [40, 11], [47, 17.5]]);
    fenster(g, f, 22, 42, 13, 1.6, 3);
  },
  fischer(g, f) {
    g.fillStyle = f.rumpf; poly(g, [[3, 15.5], [52, 15.5], [62, 9], [57, 25], [8, 25], [3, 19]]);
    g.fillStyle = f.aufbau; rect(g, 38, 7, 12, 8.5);
    g.fillStyle = f.hell; rect(g, 22, 1, 1.2, 14.5); rect(g, 22, 4, 12, 0.9); rect(g, 4, 6, 1.2, 9.5); rect(g, 4, 6, 7, 1);
    fenster(g, f, 39, 49, 9, 1.4, 2.6);
  },
  schlepper(g, f) {
    g.fillStyle = f.rumpf; poly(g, [[8, 14], [50, 14], [58, 9.5], [54, 25], [12, 25], [8, 19]]);
    g.fillStyle = f.aufbau; rect(g, 26, 5, 15, 9); rect(g, 28, 2, 10, 3);
    g.fillStyle = f.hell; rect(g, 33, 0, 1.2, 2);
    fenster(g, f, 27, 40, 6.8, 1.6, 2.6);
    if (!f.schatten) { g.fillStyle = f.detail; for (let x = 10; x < 50; x += 5) rect(g, x, 18.5, 3, 1.4); }
  },
  arbeit(g, f) {
    g.fillStyle = f.rumpf; poly(g, [[2, 15], [56, 15], [63, 11], [59, 25], [6, 25], [2, 19]]);
    g.fillStyle = f.aufbau; rect(g, 40, 6, 14, 9);
    g.fillStyle = f.hell; poly(g, [[14, 15], [16, 15], [30, 2], [28.5, 1]]); rect(g, 12, 12, 8, 3);
    fenster(g, f, 41, 53, 8, 1.4, 2.4);
  },
  bagger(g, f) {
    g.fillStyle = f.rumpf; poly(g, [[2, 15], [58, 15], [63, 12], [60, 25], [5, 25], [2, 19]]);
    g.fillStyle = f.aufbau; rect(g, 4, 6, 10, 9);
    g.fillStyle = f.hell; poly(g, [[18, 15], [20, 15], [44, 3], [43, 1.5]]); rect(g, 42, 2, 1.2, 9);
    fenster(g, f, 5, 13, 8, 1.4, 2.4);
  },
  behoerde(g, f) {
    g.fillStyle = f.rumpf; poly(g, [[1, 16], [57, 16], [64, 11.5], [60, 24], [6, 24], [1, 20]]);
    g.fillStyle = f.aufbau; poly(g, [[12, 16], [14, 8], [36, 8], [40, 12], [42, 16]]);
    g.fillStyle = f.hell; rect(g, 25, 1, 1.2, 7); rect(g, 22, 3, 7, 1);
    fenster(g, f, 16, 37, 10, 1.4, 2.6);
    if (!f.schatten) { g.fillStyle = f.detail; rect(g, 3, 18.5, 52, 1.6); }
  },
  retter(g, f) {
    g.fillStyle = f.rumpf; poly(g, [[4, 16], [50, 16], [60, 10.5], [55, 24], [9, 24], [4, 20]]);
    g.fillStyle = f.aufbau; poly(g, [[18, 16], [20, 8], [38, 8], [44, 16]]);
    g.fillStyle = f.hell; rect(g, 29, 2, 1.2, 6);
    fenster(g, f, 21, 40, 10, 1.6, 2.8);
    if (!f.schatten) { g.fillStyle = "#ff8c3a"; rect(g, 6, 18, 46, 1.6); }
  },
  marine(g, f) {
    g.fillStyle = f.rumpf; poly(g, [[1, 16], [56, 16], [64, 12], [60, 24], [5, 24], [1, 20]]);
    g.fillStyle = f.aufbau; poly(g, [[14, 16], [16, 9], [24, 9], [26, 5], [34, 5], [36, 9], [40, 9], [42, 16]]);
    g.fillStyle = f.hell; rect(g, 29.5, 0, 1.2, 5); rect(g, 48, 14, 4, 2); rect(g, 51, 14.5, 6, 0.9);
  },
  segel(g, f) {
    g.fillStyle = f.rumpf; poly(g, [[12, 20], [50, 20], [57, 17], [50, 25], [17, 25]]);
    g.fillStyle = f.hell; rect(g, 31.5, 0, 1.2, 20);
    g.fillStyle = f.aufbau; poly(g, [[31, 1.5], [31, 19], [15, 19]]); poly(g, [[33.4, 3], [33.4, 19], [49, 19]]);
  },
  motor(g, f) {
    g.fillStyle = f.rumpf; poly(g, [[10, 19], [50, 19], [60, 15.5], [54, 25], [14, 25]]);
    g.fillStyle = f.aufbau; poly(g, [[20, 19], [22, 13.5], [36, 13.5], [42, 19]]);
    fenster(g, f, 24, 38, 15, 1.6, 3);
  },
  heli(g, f) {
    g.fillStyle = f.rumpf; poly(g, [[16, 14], [40, 14], [46, 18], [40, 21], [22, 21], [16, 18]]);
    rect(g, 4, 15.5, 14, 2); rect(g, 3, 12, 2, 6);
    g.fillStyle = f.hell; rect(g, 6, 9, 46, 1.2); rect(g, 29, 9, 1.4, 5);
  },
  sonst(g, f) {
    g.fillStyle = f.rumpf; poly(g, [[2, 15.5], [57, 15.5], [63, 11.5], [59, 25], [6, 25], [2, 19.5]]);
    g.fillStyle = f.aufbau; rect(g, 6, 7, 12, 8.5);
    g.fillStyle = f.hell; rect(g, 11, 2, 1.2, 5);
    fenster(g, f, 7, 17, 9.5, 1.4, 2.4);
  },
};

function farben(farbe, schatten) {
  if (schatten) { const d = "rgba(0,0,0,0.88)"; return { rumpf: d, aufbau: d, hell: d, dunkel: d, detail: d, schatten: true }; }
  return { rumpf: farbe, aufbau: mische(farbe, "w", 0.62), hell: mische(farbe, "w", 0.35), dunkel: mische(farbe, "s", 0.3), detail: "rgba(8,12,22,0.55)", schatten: false };
}

// ------------------------------------------------------------------ Bilder mit Rand, zwischengespeichert
const cache = new Map();
function leinwand(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
/**
 * Fertiges Bild einer Figur. art: "seite-<art>" oder ein Flugzeug-Symbol ("f-jet2" …).
 * px = Breite in CSS-Pixeln (Seitenansicht: Länge, Flugzeug: Kantenlänge). Liefert Canvas mit .w, .h, .pad (CSS-Pixel)
 */
export function figur(art, farbe, px) {
  const stufe = px < 40 ? Math.round(px / 2) * 2 : px < 100 ? Math.round(px / 4) * 4 : Math.round(px / 8) * 8;
  const pr = Math.min(2, window.devicePixelRatio || 1);
  const key = `${art}|${farbe}|${stufe}|${pr}`;
  let c = cache.get(key);
  if (c) return c;
  c = rendern(art, farbe, stufe, pr, false);
  if (cache.size > 600) cache.clear();
  cache.set(key, c);
  return c;
}

/** Zeichnen mit dunklem Rand; spiegeln = Bug nach links */
function rendern(art, farbe, px, pr, spiegeln) {
  const seite = art.startsWith("seite-");
  const lw = seite ? SEITE_W : MASS[art].w, lh = seite ? SEITE_H : MASS[art].h;
  const k = px / lw, pad = 3;
  const W = Math.ceil((lw * k + 2 * pad) * pr), H = Math.ceil((lh * k + 2 * pad) * pr);
  const zeichne = (g, schatten) => {
    if (spiegeln) g.setTransform(-pr * k, 0, 0, pr * k, W - pad * pr, pad * pr);
    else g.setTransform(pr * k, 0, 0, pr * k, pad * pr, pad * pr);
    if (seite) (SEITE[art.slice(6)] || SEITE.sonst)(g, farben(farbe, schatten));
    else { g.fillStyle = schatten ? "rgba(0,0,0,0.88)" : farbe; g.strokeStyle = g.fillStyle; symbolPfad(art, g); }
  };
  const dunkel = leinwand(W, H);
  zeichne(dunkel.getContext("2d"), true);
  const c = leinwand(W, H);
  const g = c.getContext("2d");
  const r = 1.3 * pr;
  for (const [dx, dy] of [[-r, 0], [r, 0], [0, -r], [0, r], [-r * 0.7, -r * 0.7], [r * 0.7, -r * 0.7], [-r * 0.7, r * 0.7], [r * 0.7, r * 0.7]]) g.drawImage(dunkel, dx, dy);
  zeichne(g, false);
  c.w = W / pr; c.h = H / pr; c.pad = pad; c.innenH = lh * k;
  return c;
}

/** Abstand Wasserlinie → Unterkante des Kartenbilds (logische Pixel bei Bildbreite 64) */
export const KARTE_UNTEN = 3 + (SEITE_H - 19);
/** Kartenbild für MapLibre (map.addImage, pixelRatio 2): Name „fig-<art>-<gruppe>-<r|l>“ */
export function kartenBild(art, farbe, rechts) {
  const c = rendern("seite-" + art, farbe, SEITE_W, 2, !rechts);
  return { width: c.width, height: c.height, data: c.getContext("2d").getImageData(0, 0, c.width, c.height).data };
}

const vorschauCache = new Map();
/** kleines Bild als Data-URL (Listen, Chips) */
export function figurBild(art, farbe, px = 28) {
  const k = art + farbe + px;
  if (!vorschauCache.has(k)) vorschauCache.set(k, figur(art, farbe, px).toDataURL());
  return vorschauCache.get(k);
}
