// Kleine Helfer für Anzeige und Formatierung (deutsch)

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const zf = new Map();
export function zahl(x, nk = 0) {
  if (x == null || !Number.isFinite(x)) return "–";
  const k = nk;
  if (!zf.has(k)) zf.set(k, new Intl.NumberFormat("de-DE", { minimumFractionDigits: k, maximumFractionDigits: k }));
  return zf.get(k).format(x).replace("-", "−");
}
export const km = (x) => `${zahl(x)} km`;
export const grad = (x, nk = 0) => `${zahl(x, nk)}°`;
export const mag = (x) => (x == null || x > 50 ? "–" : `${zahl(x, 1)} mag`);

const z2 = (n) => String(n).padStart(2, "0");
export function uhr(ms, sek = false) {
  const d = new Date(ms);
  return `${z2(d.getHours())}:${z2(d.getMinutes())}${sek ? ":" + z2(d.getSeconds()) : ""}`;
}
const WT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const WT_LANG = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
export function tag(ms, jetzt = Date.now()) {
  const d = new Date(ms), h = new Date(jetzt);
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const b = new Date(h.getFullYear(), h.getMonth(), h.getDate()).getTime();
  const diff = Math.round((a - b) / 86400000);
  if (diff === 0) return "heute";
  if (diff === 1) return "morgen";
  if (diff === -1) return "gestern";
  return `${WT[d.getDay()]} ${z2(d.getDate())}.${z2(d.getMonth() + 1)}.`;
}
export const wochentag = (ms) => WT_LANG[new Date(ms).getDay()];
export function datum(ms) {
  const d = new Date(ms);
  return `${z2(d.getDate())}.${z2(d.getMonth() + 1)}.${d.getFullYear()}`;
}
export function dauer(sek) {
  sek = Math.round(sek);
  if (sek < 60) return `${sek} s`;
  const m = Math.floor(sek / 60), s = sek % 60;
  if (m < 60) return s ? `${m} min ${s} s` : `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} Std. ${m % 60} min`;
}
export function relativ(ms, jetzt = Date.now()) {
  const d = (ms - jetzt) / 1000;
  const a = Math.abs(d);
  let t;
  if (a < 60) t = `${Math.round(a)} s`;
  else if (a < 3600) t = `${Math.round(a / 60)} min`;
  else if (a < 86400 * 2) t = `${zahl(a / 3600, a < 36000 ? 1 : 0)} Std.`;
  else t = `${Math.round(a / 86400)} Tagen`;
  return d >= 0 ? `in ${t}` : `vor ${t}`;
}
export function alterText(ms, jetzt = Date.now()) {
  const h = (jetzt - ms) / 3600000;
  if (h < 1) return "weniger als 1 Stunde";
  if (h < 1.5) return "1 Stunde";
  if (h < 48) return `${Math.round(h)} Stunden`;
  return `${Math.round(h / 24)} Tagen`;
}
export function helligkeitWort(m) {
  if (m == null) return "";
  if (m < -2) return "sehr hell";
  if (m < 0.5) return "hell";
  if (m < 2.5) return "gut zu sehen";
  if (m < 4) return "eher schwach";
  if (m < 5.5) return "schwach";
  return "nur mit Fernglas";
}

let meldungTimer = 0;
export function melde(text, sek = 5, knopf = null) {
  const el = document.getElementById("meldung");
  el.innerHTML = esc(text);
  if (knopf) {
    const b = document.createElement("button");
    b.textContent = knopf.text;
    b.onclick = () => { el.hidden = true; knopf.aktion(); };
    el.appendChild(b);
  }
  el.hidden = false;
  clearTimeout(meldungTimer);
  if (sek) meldungTimer = setTimeout(() => (el.hidden = true), sek * 1000);
}

export const speicher = {
  lies(k, ersatz = null) {
    try { const v = localStorage.getItem(k); return v == null ? ersatz : JSON.parse(v); } catch { return ersatz; }
  },
  schreib(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* privat/voll – egal */ }
  },
};

// ------------------------------------------------------------------ Einheiten (Schiffe und Flugzeuge)
export const einheiten = { tempo: "beides", hoehe: "m" };
/** Knoten → Text nach Einstellung */
export function tempo(kn, kurz = false) {
  if (kn == null || !Number.isFinite(kn)) return "–";
  const kmh = kn * 1.852;
  if (einheiten.tempo === "kmh") return `${zahl(kmh)} km/h`;
  if (einheiten.tempo === "kn") return `${zahl(kn, kn < 10 ? 1 : 0)} kn`;
  return kurz ? `${zahl(kn, kn < 10 ? 1 : 0)} kn` : `${zahl(kn, kn < 10 ? 1 : 0)} kn · ${zahl(kmh)} km/h`;
}
/** Meter → Höhe nach Einstellung */
export function hoehe(m, ft) {
  if (m == null && ft == null) return "–";
  if (m == null) m = ft * 0.3048;
  if (ft == null) ft = m / 0.3048;
  if (einheiten.hoehe === "ft") return `${zahl(Math.round(ft / 25) * 25)} ft`;
  return `${zahl(Math.round(m / 10) * 10)} m`;
}
/** Entfernung in m → „850 m“, „12,4 km“ */
export function weite(m) {
  if (m == null || !Number.isFinite(m)) return "–";
  if (m < 950) return `${zahl(Math.round(m / 10) * 10)} m`;
  if (m < 20000) return `${zahl(m / 1000, 1)} km`;
  return `${zahl(m / 1000)} km`;
}
export const RICHTUNG16 = ["N", "NNO", "NO", "ONO", "O", "OSO", "SO", "SSO", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
export const richtungKurz = (az) => RICHTUNG16[Math.round((((az % 360) + 360) % 360) / 22.5) % 16];
const RICHTUNG8 = ["Norden", "Nordosten", "Osten", "Südosten", "Süden", "Südwesten", "Westen", "Nordwesten"];
export const richtungLang = (az) => RICHTUNG8[Math.round((((az % 360) + 360) % 360) / 45) % 8];
const RICHTUNG8_NACH = ["nach Norden", "nach Nordosten", "nach Osten", "nach Südosten", "nach Süden", "nach Südwesten", "nach Westen", "nach Nordwesten"];
export const richtungNach = (az) => RICHTUNG8_NACH[Math.round((((az % 360) + 360) % 360) / 45) % 8];
export function seit(ms, jetzt = Date.now()) {
  const s = Math.max(0, (jetzt - ms) / 1000);
  if (s < 10) return "gerade eben";
  if (s < 60) return `vor ${Math.round(s)} s`;
  if (s < 3600) return `vor ${Math.round(s / 60)} min`;
  if (s < 86400) return `vor ${zahl(s / 3600, s < 36000 ? 1 : 0)} Std.`;
  return `vor ${Math.round(s / 86400)} Tagen`;
}
