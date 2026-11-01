// Flugdaten: Positionen von adsb.lol (über den eigenen Vermittler, weil die Dienste kein CORS erlauben),
// Route (adsbdb, sonst adsb.lol), Flugzeug-Stammdaten (adsbdb), Fotos (planespotters.net)
import { entfernung, NM, RAD, DEG } from "./geo.js";

const MAX_NM = 250;

/** Kreise (Mitte + Radius in Seemeilen), die einen Ausschnitt abdecken – höchstens n Stück */
export function kreiseFuer(lat, lon, radiusM, n = 7) {
  const rNm = radiusM / NM;
  const raster = (x, s) => Math.round(x / s) * s;
  if (rNm <= MAX_NM - 10) {
    const s = rNm < 40 ? 0.02 : rNm < 120 ? 0.05 : 0.1;
    return [{ lat: raster(lat, s), lon: raster(lon, s), nm: Math.max(25, Math.min(MAX_NM, Math.ceil(rNm * 1.08 / 10) * 10)) }];
  }
  // Wabenmuster aus 250-sm-Kreisen um die Mitte (Mitte auf 0,5° gerastert, damit sich Abfragen wiederholen)
  const R = MAX_NM * NM, schritt = R * 1.6;
  const kreise = [];
  const c0 = { lat: raster(lat, 0.5), lon: raster(lon, 0.5) };
  const ringe = Math.ceil(radiusM / schritt) + 1;
  for (let q = -ringe; q <= ringe; q++) {
    for (let r = -ringe; r <= ringe; r++) {
      const x = schritt * (q + r / 2), y = schritt * r * Math.sqrt(3) / 2;
      const d = Math.hypot(x, y);
      if (d > radiusM + R) continue;
      const la = c0.lat + (y / 6371000) * DEG;
      if (Math.abs(la) > 85) continue;
      const lo = c0.lon + (x / (6371000 * Math.cos(c0.lat * RAD))) * DEG;
      kreise.push({ lat: Math.round(la * 10) / 10, lon: Math.round((((lo + 540) % 360) - 180) * 10) / 10, nm: MAX_NM, d });
    }
  }
  kreise.sort((a, b) => a.d - b.d);
  return kreise.slice(0, n);
}

export class FlugDaten {
  constructor(opt) {
    this.opt = opt;
    this.relay = opt.relay;
    this.flieger = new Map();
    this.kreise = [];
    this.zusatz = null;   // zusätzlicher Kreis (z. B. um mich im Live-Blick)
    this.aktiv = false;
    this.stand = 0;
    this.fehler = 0;
    this._laeuft = false;
    this._infos = new Map();
    this._routen = new Map();
    this._fotos = new Map();
  }

  setKreise(kreise, zusatz = this.zusatz) {
    const neu = JSON.stringify(kreise) !== JSON.stringify(this.kreise) || JSON.stringify(zusatz) !== JSON.stringify(this.zusatz);
    this.kreise = kreise;
    this.zusatz = zusatz;
    if (neu && this.aktiv) this.jetzt();
  }
  start() { this.aktiv = true; this.jetzt(); }
  stop() { this.aktiv = false; clearTimeout(this._timer); }
  jetzt() { clearTimeout(this._timer); this._runde(); }

  async _runde() {
    if (!this.aktiv) return;
    if (this._laeuft) { this._nochmal = true; return; }
    this._laeuft = true;
    const alle = [...this.kreise];
    if (this.zusatz) alle.unshift(this.zusatz);
    let ok = 0, fehler = "";
    for (let i = 0; i < alle.length; i++) {
      const k = alle[i];
      try {
        const r = await fetch(`${this.relay}/adsb/v2/lat/${k.lat}/lon/${k.lon}/dist/${k.nm}`);
        if (!r.ok) throw new Error("HTTP " + r.status);
        const j = await r.json();
        this._uebernehmen(j);
        ok++;
      } catch (e) { fehler = e.message; }
      if (i < alle.length - 1) await new Promise((res) => setTimeout(res, 250));
    }
    this._laeuft = false;
    if (ok) { this.fehler = 0; this.stand = Date.now(); this.aufraeumen(); this.opt.onDaten && this.opt.onDaten(); }
    else if (alle.length) { this.fehler++; this.opt.onFehler && this.opt.onFehler(fehler || "keine Antwort"); }
    if (this._nochmal) { this._nochmal = false; this._runde(); return; }
    if (this.aktiv) {
      const pause = alle.length > 2 ? 20000 : this.zusatz ? 4000 : 5000;
      this._timer = setTimeout(() => { if (!document.hidden) this._runde(); else this._timer = setTimeout(() => this._runde(), 2000); }, this.fehler ? Math.min(30000, pause * (1 + this.fehler)) : pause);
    }
  }

  _uebernehmen(j) {
    const jetzt = j.now || Date.now();
    for (const a of j.ac || []) {
      if (a.lat == null || a.lon == null) continue;
      const hex = a.hex;
      const tPos = jetzt - (a.seen_pos ?? a.seen ?? 0) * 1000;
      let f = this.flieger.get(hex);
      if (!f) { f = { hex, spur: [] }; this.flieger.set(hex, f); }
      else if (f.t && tPos <= f.t) continue;
      if (f.lat != null && (f.lat !== a.lat || f.lon !== a.lon)) {
        const l = f.spur[f.spur.length - 1];
        if (!l || tPos - l[3] > 4000) { f.spur.push([f.lon, f.lat, f.altM, f.t]); if (f.spur.length > 900) f.spur.shift(); }
      }
      f.lat = a.lat; f.lon = a.lon; f.t = tPos;
      f.boden = a.alt_baro === "ground";
      f.altFt = f.boden ? 0 : (typeof a.alt_baro === "number" ? a.alt_baro : a.alt_geom ?? null);
      f.altM = f.boden ? -1 : f.altFt != null ? f.altFt * 0.3048 : null;
      f.altGeoFt = a.alt_geom ?? null;
      f.gs = a.gs ?? null; f.trk = a.track ?? a.true_heading ?? f.trk ?? null; f.vr = a.baro_rate ?? a.geom_rate ?? null;
      f.cs = (a.flight || "").trim(); f.reg = a.r || f.reg || ""; f.typ = a.t || f.typ || ""; f.desc = a.desc || f.desc || "";
      f.kat = a.category || f.kat || ""; f.sq = a.squawk || ""; f.notfall = a.emergency && a.emergency !== "none" ? a.emergency : null;
      f.mil = a.dbFlags ? (a.dbFlags & 1) === 1 : f.mil || false;
      f.quelle = a.type || ""; f.roh = a;
    }
  }

  aufraeumen() {
    const grenze = Date.now() - (this.kreise.length > 2 ? 150000 : 75000);
    for (const [hex, f] of this.flieger) if (f.t < grenze) this.flieger.delete(hex);
  }

  /** Flugzeug nach Kennung gezielt nachladen (wenn es aus dem Bereich fliegt) */
  async einzeln(hex) {
    try {
      const r = await fetch(`${this.relay}/adsb/v2/hex/${hex}`);
      if (!r.ok) return null;
      const j = await r.json();
      this._uebernehmen(j);
      return this.flieger.get(hex) || null;
    } catch { return null; }
  }

  // ------------------------------------------------------------------ Zusatzinfos
  info(hex) {
    if (!this._infos.has(hex)) {
      this._infos.set(hex, fetch(`https://api.adsbdb.com/v0/aircraft/${hex}`).then((r) => (r.ok ? r.json() : null)).then((j) => (j && j.response && j.response.aircraft) || null).catch(() => null));
    }
    return this._infos.get(hex);
  }

  /** Route zum Rufzeichen: zuerst adsbdb (direkt), sonst adsb.lol (Vermittler, mit Plausibilitätsprüfung) */
  route(cs, lat, lon) {
    if (!cs || cs.length < 3) return Promise.resolve(null);
    if (this._routen.has(cs)) return this._routen.get(cs);
    const p = (async () => {
      try {
        const r = await fetch(`https://api.adsbdb.com/v0/callsign/${encodeURIComponent(cs)}`);
        if (r.ok) {
          const j = await r.json();
          const fr = j.response && j.response.flightroute;
          if (fr && fr.origin && fr.destination) {
            const ap = (a) => ({ name: a.name, ort: a.municipality, land: a.country_name, iso: a.country_iso_name, iata: a.iata_code, icao: a.icao_code, lat: a.latitude, lon: a.longitude });
            return { von: ap(fr.origin), nach: ap(fr.destination), airline: fr.airline ? fr.airline.name : null, nummer: fr.callsign_iata || null, quelle: "adsbdb" };
          }
        }
      } catch { /* weiter */ }
      try {
        const r = await fetch(`${this.relay}/adsb/api/0/routeset`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planes: [{ callsign: cs, lat, lng: lon }] }) });
        if (r.ok) {
          const j = await r.json();
          const e = Array.isArray(j) ? j[0] : null;
          if (e && e._airports && e._airports.length >= 2 && e.plausible !== false) {
            const ap = (a) => ({ name: a.name, ort: a.location, land: null, iso: a.countryiso2, iata: a.iata, icao: a.icao, lat: a.lat, lon: a.lon });
            const n = e._airports.length;
            return { von: ap(e._airports[0]), nach: ap(e._airports[n - 1]), ueber: n > 2 ? e._airports.slice(1, -1).map(ap) : [], airline: null, nummer: null, quelle: "adsb.lol" };
          }
        }
      } catch { /* nichts */ }
      return null;
    })();
    this._routen.set(cs, p);
    return p;
  }

  foto(hex) {
    if (!this._fotos.has(hex)) {
      this._fotos.set(hex, fetch(`https://api.planespotters.net/pub/photos/hex/${hex}`).then((r) => (r.ok ? r.json() : null)).then((j) => {
        const p = j && j.photos && j.photos[0];
        if (!p) return null;
        return { bild: (p.thumbnail_large || p.thumbnail).src, seite: p.link, urheber: p.photographer };
      }).catch(() => null));
    }
    return this._fotos.get(hex);
  }
}

/** Fortschritt auf der Route (Anteil der Strecke, Restweg) */
export function fortschritt(route, lat, lon) {
  if (!route || !route.von || !route.nach || route.von.lat == null) return null;
  const ges = entfernung(route.von.lat, route.von.lon, route.nach.lat, route.nach.lon);
  const rest = entfernung(lat, lon, route.nach.lat, route.nach.lon);
  const weg = entfernung(route.von.lat, route.von.lon, lat, lon);
  if (!ges) return null;
  return { anteil: Math.max(0, Math.min(1, weg / (weg + rest))), restM: rest, gesM: ges, wegM: weg };
}
