// Schiffsdaten von Open Waters AIS (frei für private Nutzung, CORS offen):
// Positionen im Ausschnitt (REST), Live-Strom (WebSocket), Einzelheiten, Fahrtverlauf
import { schiffGruppe } from "./texte.js";

export const OW = "https://ais.openwaters.io";
const STROM = "wss://ais.openwaters.io/v1/stream";
const MAX_FLAECHE = 95; // anonym: höchstens 100 Quadratgrad je Abfrage

const fehlt = (v, wert) => v == null || v === wert;
const sauber = (s) => (s == null ? "" : String(s).replace(/@+/g, " ").replace(/\s+/g, " ").trim());

/** Ausschnitt begrenzen: höchstens MAX_FLAECHE Quadratgrad, um die Mitte herum */
export function begrenzeBox(b, rand = 0.12) {
  let { w, e, s, n } = b;
  const dw = (e - w) * rand, dh = (n - s) * rand;
  w -= dw; e += dw; s -= dh; n += dh;
  s = Math.max(-85, s); n = Math.min(85, n);
  if (e - w > 359) { w = -179.9; e = 179.9; }
  let fl = (e - w) * (n - s);
  if (fl > MAX_FLAECHE) {
    const f = Math.sqrt(MAX_FLAECHE / fl);
    const cx = (w + e) / 2, cy = (s + n) / 2, hw = (e - w) / 2 * f, hh = (n - s) / 2 * f;
    w = cx - hw; e = cx + hw; s = cy - hh; n = cy + hh;
  }
  // in den gültigen Bereich (die Abfrage kennt keine Datumsgrenze)
  w = Math.max(-180, w); e = Math.min(180, e);
  return { w, e, s, n, flaeche: (e - w) * (n - s) };
}
const enthalten = (a, b) => a && b && b.w >= a.w && b.e <= a.e && b.s >= a.s && b.n <= a.n;
const r4 = (x) => Math.round(x * 1e4) / 1e4;

export class SchiffDaten {
  constructor(opt = {}) {
    this.opt = opt;
    this.schiffe = new Map();
    this.box = null;          // gewünschter Ausschnitt
    this.geladen = null;      // zuletzt per REST geladener Ausschnitt
    this.ws = null;
    this.wsBox = null;
    this.aktiv = false;
    this.letzteMeldung = 0;
    this.fehler = 0;
    this.stand = 0;
    this._zuletztAbo = 0;
    this._details = new Map();
  }

  /** Einzelschiff-Modus an/aus mit Ausschnitt */
  setBereich(box, aktiv) {
    this.aktiv = aktiv;
    if (!aktiv) { this._stromZu(); return; }
    const b = begrenzeBox(box);
    this.box = b;
    if (!enthalten(this.geladen, begrenzeBox(box, 0))) this.laden();
    this._abo();
  }

  /** Mehrere Ausschnitte zusammen (z. B. Karte + Live-Blick um mich) */
  async laden() {
    const b = this.box;
    if (!b) return;
    const url = `${OW}/v1/vessels?bbox=${r4(b.s)},${r4(b.w)},${r4(b.n)},${r4(b.e)}&kind=vessel,sar`;
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error("HTTP " + r.status);
      const j = await r.json();
      this.geladen = b;
      this.fehler = 0;
      for (const f of j.features || []) this._ausRest(f);
      this.stand = Date.now();
      this.opt.onDaten && this.opt.onDaten();
    } catch (e) {
      this.fehler++;
      this.opt.onFehler && this.opt.onFehler("Schiffsdaten: " + e.message);
    }
  }

  _ausRest(f) {
    const p = f.properties || {};
    if (!f.geometry || !f.geometry.coordinates) return;
    const id = p.mmsi || f.id;
    const alt = this.schiffe.get(id);
    const t = Date.parse(p.seen) || Date.now();
    if (alt && alt.t > t + 1000) return; // Live-Daten sind neuer
    const s = alt || { mmsi: id, spur: [] };
    s.lon = f.geometry.coordinates[0]; s.lat = f.geometry.coordinates[1]; s.t = t;
    s.sog = p.sog ?? null; s.cog = p.cog ?? null; s.hdg = p.heading ?? null; s.nav = p.nav_status ?? null;
    s.name = p.name || s.name || ""; s.typ = p.type ?? s.typ ?? null; s.kind = p.kind || s.kind || "vessel";
    s.len = p.length || s.len || null; s.beam = p.beam || s.beam || null;
    s.tb = p.to_bow ?? s.tb; s.ts = p.to_stern ?? s.ts; s.tp = p.to_port ?? s.tp; s.tsb = p.to_starboard ?? s.tsb;
    s.ziel = p.destination ?? s.ziel; s.eta = p.eta ?? s.eta; s.tief = p.draught ?? s.tief; s.imo = p.imo ?? s.imo;
    s.ruf = p.callsign ?? s.ruf; s.flagge = p.flag ?? s.flagge; s.klasse = p.class ?? s.klasse; s.quelle = p.source;
    s.g = schiffGruppe(s.typ, s.kind);
    this.schiffe.set(id, s);
  }

  // ------------------------------------------------------------------ Live-Strom
  _abo() {
    if (!this.box || !this.aktiv) return;
    if (!this.ws || this.ws.readyState > 1) { this._stromAuf(); return; }
    if (this.ws.readyState !== 1) return;
    const b = this.box;
    if (this.wsBox && Math.abs(this.wsBox.w - b.w) + Math.abs(this.wsBox.e - b.e) + Math.abs(this.wsBox.s - b.s) + Math.abs(this.wsBox.n - b.n) < 1e-4) return;
    const jetzt = Date.now();
    const warte = 1100 - (jetzt - this._zuletztAbo); // höchstens ein Abo pro Sekunde
    clearTimeout(this._aboTimer);
    if (warte > 0) { this._aboTimer = setTimeout(() => this._abo(), warte); return; }
    this._zuletztAbo = jetzt;
    this.wsBox = b;
    this.ws.send(JSON.stringify({ type: "subscribe", bbox: [[r4(b.s), r4(b.w), r4(b.n), r4(b.e)]] }));
  }

  _stromAuf() {
    clearTimeout(this._neuTimer);
    let ws;
    try { ws = new WebSocket(STROM); } catch { this._neuVersuch(); return; }
    this.ws = ws;
    this.wsBox = null;
    ws.onopen = () => { this.fehler = 0; this._abo(); };
    ws.onmessage = (e) => {
      if (typeof e.data !== "string") return;
      let j;
      try { j = JSON.parse(e.data); } catch { return; }
      if (j.type === "event") this._ausStrom(j);
      else if (j.type === "error") this.opt.onFehler && this.opt.onFehler("Live-Strom: " + (j.message || j.error || ""));
    };
    ws.onclose = () => { if (this.ws === ws) { this.ws = null; if (this.aktiv) this._neuVersuch(); } };
    ws.onerror = () => {};
  }
  _neuVersuch() {
    clearTimeout(this._neuTimer);
    this._neuTimer = setTimeout(() => { if (this.aktiv && !document.hidden) this._stromAuf(); }, Math.min(30000, 2000 * 2 ** Math.min(4, this.fehler++)));
  }
  _stromZu() {
    clearTimeout(this._neuTimer);
    if (this.ws) { const w = this.ws; this.ws = null; try { w.close(); } catch { /* egal */ } }
    this.wsBox = null;
  }
  /** Seite verdeckt: Strom schließen, sichtbar: wieder öffnen */
  pause(an) {
    if (an) this._stromZu();
    else if (this.aktiv) { this.laden(); this._abo(); }
  }

  _ausStrom(ev) {
    const id = ev.mmsi;
    if (!id) return;
    const m = ev.message || {};
    const typ = ev.msg_type;
    let s = this.schiffe.get(id);
    const t = Date.parse(ev.time) || Date.now();
    if (!s) { s = { mmsi: id, spur: [], name: "", kind: "vessel" }; this.schiffe.set(id, s); }
    if (typ === "PositionReport" || typ === "StandardClassBPositionReport" || typ === "ExtendedClassBPositionReport") {
      const lat = m.Latitude ?? ev.lat, lon = m.Longitude ?? ev.lon;
      if (lat == null || lon == null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return;
      if (s.lat != null && s.t && t > s.t) {
        // Spur mitschreiben (höchstens alle 20 s)
        const l = s.spur[s.spur.length - 1];
        if (!l || t - l[2] > 20000) { s.spur.push([s.lon, s.lat, s.t]); if (s.spur.length > 400) s.spur.shift(); }
      }
      if (s.t && t < s.t - 1000) return;
      s.lat = lat; s.lon = lon; s.t = t;
      s.sog = fehlt(m.Sog, 102.3) ? null : m.Sog;
      s.cog = fehlt(m.Cog, 360) ? null : m.Cog;
      s.hdg = fehlt(m.TrueHeading, 511) ? null : m.TrueHeading;
      if (m.NavigationalStatus != null) s.nav = m.NavigationalStatus === 15 ? null : m.NavigationalStatus;
      if (m.RateOfTurn != null && m.RateOfTurn !== -128) s.rot = m.RateOfTurn;
      if (typ !== "PositionReport") s.klasse = "B";
      else s.klasse = "A";
      if (typ === "ExtendedClassBPositionReport") {
        if (m.Name) s.name = sauber(m.Name);
        if (m.Type) s.typ = m.Type;
        if (m.Dimension) this._mass(s, m.Dimension);
      }
    } else if (typ === "ShipStaticData") {
      if (m.Name) s.name = sauber(m.Name);
      if (m.CallSign) s.ruf = sauber(m.CallSign);
      if (m.ImoNumber) s.imo = m.ImoNumber;
      if (m.Type != null) s.typ = m.Type;
      if (m.Dimension) this._mass(s, m.Dimension);
      if (m.Destination != null) s.ziel = sauber(m.Destination);
      if (m.MaximumStaticDraught) s.tief = m.MaximumStaticDraught;
      const eta = m.Eta;
      if (eta && eta.Month && eta.Day) s.eta = `${String(eta.Month).padStart(2, "0")}-${String(eta.Day).padStart(2, "0")}` + (eta.Hour < 24 && eta.Minute < 60 ? ` ${String(eta.Hour).padStart(2, "0")}:${String(eta.Minute).padStart(2, "0")}` : "");
      if (s.lat == null && ev.lat != null) { s.lat = ev.lat; s.lon = ev.lon; s.t = t; }
    } else if (typ === "StaticDataReport") {
      if (m.ReportA && m.ReportA.Valid && m.ReportA.Name) s.name = sauber(m.ReportA.Name);
      if (m.ReportB && m.ReportB.Valid) {
        if (m.ReportB.ShipType) s.typ = m.ReportB.ShipType;
        if (m.ReportB.CallSign) s.ruf = sauber(m.ReportB.CallSign);
        if (m.ReportB.Dimension) this._mass(s, m.ReportB.Dimension);
      }
    } else return;
    s.quelle = ev.source;
    s.g = schiffGruppe(s.typ, s.kind);
    this.letzteMeldung = Date.now();
    this.opt.onLive && this.opt.onLive(s);
  }
  _mass(s, d) {
    if (!d || !(d.A + d.B > 0)) return;
    s.tb = d.A; s.ts = d.B; s.tp = d.C; s.tsb = d.D;
    s.len = d.A + d.B; if (d.C + d.D > 0) s.beam = d.C + d.D;
  }

  /** alte Einträge entfernen (unterwegs > 40 min, liegend > 8 Tage) */
  aufraeumen() {
    const jetzt = Date.now();
    for (const [id, s] of this.schiffe) {
      const alter = jetzt - (s.t || 0);
      const faehrt = s.sog != null && s.sog > 1;
      if ((faehrt && alter > 40 * 60000) || alter > 8 * 86400000) this.schiffe.delete(id);
    }
  }

  // ------------------------------------------------------------------ Einzelheiten
  async details(mmsi) {
    if (this._details.has(mmsi)) return this._details.get(mmsi);
    const p = fetch(`${OW}/v1/vessels/${mmsi}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    this._details.set(mmsi, p);
    const d = await p;
    if (!d) this._details.delete(mmsi);
    else if (d.geometry) this._ausRest(d);
    return d;
  }
  async verlauf(mmsi, stunden = 24) {
    const von = new Date(Date.now() - stunden * 3600000).toISOString();
    try {
      const r = await fetch(`${OW}/v1/vessels/${mmsi}/track?from=${encodeURIComponent(von)}`);
      if (!r.ok) return null;
      return await r.json();
    } catch { return null; }
  }
  async suche(q, lat, lon) {
    const u = `${OW}/v1/vessels?q=${encodeURIComponent(q)}` + (lat != null ? `&around=${r4(lat)},${r4(lon)}` : "");
    try { const r = await fetch(u); if (!r.ok) return []; const j = await r.json(); return j.features || []; } catch { return []; }
  }
}

// ------------------------------------------------------------------ Fotos von Wikimedia Commons
const fotoCache = new Map();
export async function commonsFoto(seite) {
  if (!seite) return null;
  const m = /\/wiki\/(File:[^?#]+)/.exec(seite);
  if (!m) return null;
  const titel = decodeURIComponent(m[1]);
  if (fotoCache.has(titel)) return fotoCache.get(titel);
  const u = "https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=800&titles=" + encodeURIComponent(titel);
  const p = fetch(u).then((r) => r.json()).then((j) => {
    const pg = Object.values((j.query && j.query.pages) || {})[0];
    const ii = pg && pg.imageinfo && pg.imageinfo[0];
    if (!ii) return null;
    const md = ii.extmetadata || {};
    const text = (x) => (x && x.value ? String(x.value).replace(/<[^>]+>/g, "").trim() : "");
    return { bild: ii.thumburl || ii.url, seite: ii.descriptionurl || seite, urheber: text(md.Artist).slice(0, 80), lizenz: text(md.LicenseShortName) };
  }).catch(() => null);
  fotoCache.set(titel, p);
  return p;
}

// ------------------------------------------------------------------ Häfen (UN/LOCODE) für Ziele wie „DEWIS“
let haefen = null, haefenLaedt = null;
export function haefenLaden() {
  if (haefen) return Promise.resolve(haefen);
  if (!haefenLaedt) haefenLaedt = fetch("data/haefen.json").then((r) => (r.ok ? r.json() : {})).then((j) => (haefen = j)).catch(() => (haefen = {}));
  return haefenLaedt;
}
/** Ziel-Text deuten: UN/LOCODE (DEWIS, DE WIS, DE-WIS) → { name, land, lat, lon } */
export function hafen(ziel) {
  if (!ziel || !haefen) return null;
  const z = ziel.toUpperCase().replace(/[^A-Z0-9 >\-]/g, "").trim();
  // „DEROS>DKGED“ = von > nach: das Ziel steht hinten
  const teil = z.includes(">") ? z.split(">").pop().trim() : z;
  const m = /^([A-Z]{2})[ \-]?([A-Z2-9]{3})$/.exec(teil);
  if (!m) return null;
  const e = haefen[m[1] + m[2]];
  if (!e) return null;
  return { code: m[1] + m[2], land: m[1], name: e[0], lat: e[1], lon: e[2] };
}
