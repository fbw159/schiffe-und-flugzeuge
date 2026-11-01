// Erdmessung: Entfernung, Richtung, Ost-Nord-Oben, Koppelnavigation, Tag/Nacht-Grenze

export const RAD = Math.PI / 180;
export const DEG = 180 / Math.PI;
export const R = 6371008.8;               // mittlerer Erdradius [m]
export const KN = 0.514444;               // 1 Knoten in m/s
export const FT = 0.3048;                 // 1 Fuß in m
export const NM = 1852;                   // 1 Seemeile in m

export const wrap360 = (a) => ((a % 360) + 360) % 360;
export const wrap180 = (a) => { const x = wrap360(a); return x > 180 ? x - 360 : x; };

/** Großkreis-Entfernung [m] */
export function entfernung(lat1, lon1, lat2, lon2) {
  const p1 = lat1 * RAD, p2 = lat2 * RAD, dp = p2 - p1, dl = (lon2 - lon1) * RAD;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Anfangsrichtung von 1 nach 2 [°, 0 = Nord] */
export function richtung(lat1, lon1, lat2, lon2) {
  const p1 = lat1 * RAD, p2 = lat2 * RAD, dl = (lon2 - lon1) * RAD;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return wrap360(Math.atan2(y, x) * DEG);
}

/** Punkt in Richtung brg [°] und Entfernung d [m] */
export function zielpunkt(lat, lon, brg, d) {
  const p1 = lat * RAD, l1 = lon * RAD, t = brg * RAD, dr = d / R;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(dr) + Math.cos(p1) * Math.sin(dr) * Math.cos(t));
  const l2 = l1 + Math.atan2(Math.sin(t) * Math.sin(dr) * Math.cos(p1), Math.cos(dr) - Math.sin(p1) * Math.sin(p2));
  return [wrap180(l2 * DEG), p2 * DEG];
}

/** Punkte auf dem Großkreis zwischen zwei Orten (für Flugrouten) */
export function grosskreis(lat1, lon1, lat2, lon2, n = 64) {
  const d = entfernung(lat1, lon1, lat2, lon2) / R;
  if (d < 1e-6) return [[lon1, lat1], [lon2, lat2]];
  const p1 = lat1 * RAD, l1 = lon1 * RAD, p2 = lat2 * RAD, l2 = lon2 * RAD;
  const pts = [];
  let vorher = null;
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(p1) * Math.cos(l1) + B * Math.cos(p2) * Math.cos(l2);
    const y = A * Math.cos(p1) * Math.sin(l1) + B * Math.cos(p2) * Math.sin(l2);
    const z = A * Math.sin(p1) + B * Math.sin(p2);
    let lon = Math.atan2(y, x) * DEG;
    const lat = Math.atan2(z, Math.hypot(x, y)) * DEG;
    // über die Datumsgrenze hinweg stetig bleiben (MapLibre zeichnet dann richtig)
    if (vorher != null) { while (lon - vorher > 180) lon -= 360; while (lon - vorher < -180) lon += 360; }
    vorher = lon;
    pts.push([lon, lat]);
  }
  return pts;
}

/** Meter je Bildpunkt bei Zoom 0 (MapLibre: 512er-Kacheln) */
export const mppZoom0 = (lat) => 40075016.686 * Math.cos(lat * RAD) / 512;

/** Koppelnavigation: Position nach t Sekunden bei Fahrt v [m/s] und Kurs k [°] */
export function koppeln(lat, lon, v, k, t) {
  if (!v || !t) return [lon, lat];
  const d = v * t;
  const dn = d * Math.cos(k * RAD), de = d * Math.sin(k * RAD);
  return [lon + de / (R * Math.cos(lat * RAD)) * DEG, lat + dn / R * DEG];
}

// ------------------------------------------------------------------ Ost-Nord-Oben (für den Live-Blick)
const A_WGS = 6378137, E2 = 6.69437999014e-3;
export function ecef(lat, lon, h = 0) {
  const p = lat * RAD, l = lon * RAD, s = Math.sin(p);
  const N = A_WGS / Math.sqrt(1 - E2 * s * s);
  return [(N + h) * Math.cos(p) * Math.cos(l), (N + h) * Math.cos(p) * Math.sin(l), (N * (1 - E2) + h) * s];
}
/** Beobachter vorbereiten (Ort + Drehmatrix) */
export function beobachter(lat, lon, h = 1.6) {
  const p = lat * RAD, l = lon * RAD;
  return { lat, lon, h, o: ecef(lat, lon, h), sp: Math.sin(p), cp: Math.cos(p), sl: Math.sin(l), cl: Math.cos(l) };
}
/** Vektor Ost-Nord-Oben [m] vom Beobachter zu einem Punkt */
export function enu(b, lat, lon, h = 0) {
  const q = ecef(lat, lon, h);
  const dx = q[0] - b.o[0], dy = q[1] - b.o[1], dz = q[2] - b.o[2];
  const e = -b.sl * dx + b.cl * dy;
  const n = -b.sp * b.cl * dx - b.sp * b.sl * dy + b.cp * dz;
  const u = b.cp * b.cl * dx + b.cp * b.sl * dy + b.sp * dz;
  return [e, n, u];
}
/** Richtung (Azimut, Höhe) mit einfacher Lichtbrechung (k = 0,13) */
export function azEl(b, lat, lon, h = 0) {
  const [e, n, u] = enu(b, lat, lon, h);
  const d = Math.hypot(e, n);
  const uk = u + 0.13 * d * d / (2 * R); // Lichtbrechung hebt ferne Ziele leicht an
  return { az: wrap360(Math.atan2(e, n) * DEG), el: Math.atan2(uk, d) * DEG, d: Math.hypot(d, u), boden: d };
}
/** Sichtweite bis zum Horizont [m] für Augenhöhe h1 und Zielhöhe h2 */
export const horizont = (h1, h2 = 0) => 3570 * (Math.sqrt(Math.max(0, h1)) + Math.sqrt(Math.max(0, h2))) * Math.sqrt(1 / 0.87);

/** Wann und wie nah kommt ein fahrendes Objekt an mir vorbei? (flache Näherung) */
export function naechsteAnnaeherung(latB, lonB, lat, lon, vMs, kurs) {
  if (!vMs || vMs < 0.3) return null;
  const e = (lon - lonB) * RAD * R * Math.cos(latB * RAD), n = (lat - latB) * RAD * R;
  const ve = vMs * Math.sin(kurs * RAD), vn = vMs * Math.cos(kurs * RAD);
  const t = -(e * ve + n * vn) / (vMs * vMs);
  if (t <= 0) return { t: 0, d: Math.hypot(e, n), vorbei: true };
  return { t, d: Math.hypot(e + ve * t, n + vn * t), vorbei: false };
}

// ------------------------------------------------------------------ Sonne, Tag und Nacht
/** Bildpunkt der Sonne (wo sie senkrecht steht): Breite = Deklination, Länge aus der Zeitgleichung */
export function sonnenPunkt(ms) {
  const n = ms / 86400000 + 2440587.5 - 2451545.0;
  const L = (280.460 + 0.9856474 * n) * RAD;
  const g = (357.528 + 0.9856003 * n) * RAD;
  const lam = L + (1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * RAD;
  const eps = (23.439 - 0.0000004 * n) * RAD;
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam));
  const dec = Math.asin(Math.sin(eps) * Math.sin(lam));
  const gmst = wrap360(280.46061837 + 360.98564736629 * n);
  return { lat: dec * DEG, lon: wrap180(ra * DEG - gmst) };
}
/** Sonnenhöhe [°] an einem Ort */
export function sonnenHoehe(lat, lon, ms) {
  const s = sonnenPunkt(ms);
  const p = lat * RAD, d = s.lat * RAD, H = (lon - s.lon) * RAD;
  return Math.asin(Math.sin(p) * Math.sin(d) + Math.cos(p) * Math.cos(d) * Math.cos(H)) * DEG;
}
/**
 * Fläche, in der die Sonne tiefer als h0 [°] steht – als Polygon für die Karte
 * (Breite der Grenze für jede Länge, dann zum dunklen Pol hin geschlossen)
 */
export function nachtFlaeche(ms, h0 = -0.83) {
  const s = sonnenPunkt(ms);
  const d = s.lat * RAD, sh = Math.sin(h0 * RAD);
  const pts = [];
  const dunklerPolSued = s.lat > 0; // Nordsommer: Südpol im Dunkeln
  for (let lon = -180; lon <= 180; lon += 2) {
    const H = (lon - s.lon) * RAD;
    // sin h0 = sin φ sin δ + cos φ cos δ cos H  →  A sin φ + B cos φ = sh
    const A = Math.sin(d), B = Math.cos(d) * Math.cos(H);
    const r = Math.hypot(A, B);
    let lat;
    if (Math.abs(sh / r) > 1) lat = (sh / r > 0) === dunklerPolSued ? -89.9 : 89.9;
    else {
      const phi0 = Math.atan2(B, A);
      const c = Math.asin(sh / r) - phi0;           // eine Lösung
      let cand = [c, Math.PI - Math.asin(sh / r) - phi0].map((x) => Math.atan2(Math.sin(x), Math.cos(x)));
      cand = cand.filter((x) => Math.abs(x) <= Math.PI / 2 + 1e-9);
      lat = (cand.length ? cand[0] : 0) * DEG;
    }
    pts.push([lon, Math.max(-85, Math.min(85, lat))]);
  }
  const pol = dunklerPolSued ? -85 : 85;
  const ring = [...pts, [180, pol], [-180, pol], pts[0]];
  return { type: "Feature", properties: { h0 }, geometry: { type: "Polygon", coordinates: [ring] } };
}
