// Live-Blick: Handy auf ein Schiff oder Flugzeug halten – Name und Infos erscheinen genau dort, wo es ist.
// Lagesensoren + Kompass (mit Missweisung WMM2025), optional Kamerabild. Ohne Sensoren (PC): Umsehen durch Ziehen.
import { beobachter, azEl, horizont, wrap180, wrap360, RAD, DEG, koppeln, KN, entfernung } from "./geo.js";
import { speicher, esc, zahl, weite, richtungLang, richtungKurz } from "./ui.js";
import { Etiketten } from "./etiketten.js";
import { figur, figurBild, SEITE_H } from "./figuren.js";

const SICHTWINKEL = 62, KAMERAWINKEL = 68;

// ------------------------------------------------------------------ kleine Quaternionen-Rechnung
const qEuler = (x, y, z) => { // Reihenfolge ZXY wie three.js (beta, gamma, alpha)
  const c1 = Math.cos(x / 2), c2 = Math.cos(y / 2), c3 = Math.cos(z / 2), s1 = Math.sin(x / 2), s2 = Math.sin(y / 2), s3 = Math.sin(z / 2);
  return [s1 * c2 * c3 - c1 * s2 * s3, c1 * s2 * c3 + s1 * c2 * s3, c1 * c2 * s3 + s1 * s2 * c3, c1 * c2 * c3 - s1 * s2 * s3];
};
const qMal = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
const qAchse = (ax, ay, az, w) => { const s = Math.sin(w / 2); return [ax * s, ay * s, az * s, Math.cos(w / 2)]; };
function qDreh(q, v) {
  const [x, y, z, w] = q, [vx, vy, vz] = v;
  const ix = w * vx + y * vz - z * vy, iy = w * vy + z * vx - x * vz, iz = w * vz + x * vy - y * vx, iw = -x * vx - y * vy - z * vz;
  return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x];
}
function qSlerp(a, b, t) {
  let [x, y, z, w] = b;
  let cos = a[0] * x + a[1] * y + a[2] * z + a[3] * w;
  if (cos < 0) { x = -x; y = -y; z = -z; w = -w; cos = -cos; }
  if (cos > 0.9995) { const r = [a[0] + t * (x - a[0]), a[1] + t * (y - a[1]), a[2] + t * (z - a[2]), a[3] + t * (w - a[3])]; const n = Math.hypot(...r); return r.map((c) => c / n); }
  const th = Math.acos(cos), s = Math.sin(th), f1 = Math.sin((1 - t) * th) / s, f2 = Math.sin(t * th) / s;
  return [a[0] * f1 + x * f2, a[1] * f1 + y * f2, a[2] * f1 + z * f2, a[3] * f1 + w * f2];
}
const enuAus = (az, el) => [Math.sin(az * RAD) * Math.cos(el * RAD), Math.cos(az * RAD) * Math.cos(el * RAD), Math.sin(el * RAD)];
const azElAus = (e, n, u) => ({ az: wrap360(Math.atan2(e, n) * DEG), el: Math.atan2(u, Math.hypot(e, n)) * DEG });

/** Reichweite: Schieberegler 0…100 → km (logarithmisch) */
const WEITE = { schiffe: [1, 60, 20], flugzeuge: [10, 350, 120] };
const zuKm = (art, v) => { const [a, b] = WEITE[art]; return a * Math.pow(b / a, v / 100); };
const zuRegler = (art, km) => { const [a, b] = WEITE[art]; return Math.round(100 * Math.log(km / a) / Math.log(b / a)); };

export class LiveBlick {
  constructor(opt) {
    this.opt = opt;
    this.el = document.getElementById("live");
    this.c = document.getElementById("live-bild");
    this.video = document.getElementById("live-video");
    this.offen = false;
    this.q = [0, 0, 0, 1];
    this.blick = { az: 0, el: 2 };
    this.zoom = 1;
    this.korrektur = speicher.lies("sf.kompassKorrektur", 0) || 0;
    this.weite = speicher.lies("sf.liveWeite", { schiffe: WEITE.schiffe[2], flugzeuge: WEITE.flugzeuge[2] });
    this.ziel = null;
    this.gewaehlt = null;
    this._ereignis = this._ereignis.bind(this);
    this._bild = this._bild.bind(this);
    this._knoepfe();
    this._gesten();
  }

  get art() { return this.opt.modus(); }

  _knoepfe() {
    document.getElementById("live-zu").onclick = () => this.schliessen();
    document.getElementById("live-kamera").onclick = () => this.kamera(!this.stream);
    document.getElementById("live-kompass").onclick = () => this._kompassFeld(!this.kompassOffen);
    document.getElementById("live-minus").onclick = () => this.korrigiere(-2);
    document.getElementById("live-plus").onclick = () => this.korrigiere(2);
    document.getElementById("live-abgleich").onclick = () => this.abgleichen();
    document.getElementById("live-modus").onclick = () => { this.ziel = null; this.gewaehlt = null; this._infoZu(); this.opt.wechsleModus(); this.modusGeaendert(); };
    const r = document.getElementById("live-weite");
    r.oninput = () => { this.weite[this.art] = Math.round(zuKm(this.art, Number(r.value)) * 10) / 10; this._weiteText(); speicher.schreib("sf.liveWeite", this.weite); this.opt.bereichGeaendert && this.opt.bereichGeaendert(); };
    document.getElementById("live-chips").addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-id]");
      if (!b) return;
      const o = (this._objekte || []).find((x) => String(x.id) === b.dataset.id);
      if (o) { this.setzeZiel(this.ziel && this.ziel.id === o.id ? null : o); }
    });
    document.getElementById("live-info").addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-aktion]");
      if (!b || !this.gewaehlt) return;
      const a = b.dataset.aktion, el = document.getElementById("live-info");
      if (a === "hin") { this.setzeZiel(this.gewaehlt); el.classList.add("eingeklappt"); el.scrollTop = 0; }
      else if (a === "karte") { const o = this.gewaehlt; this.schliessen(); this.opt.zeigeAufKarte(o); }
      else if (a === "zu") this._infoZu();
      else if (a === "klappen") { el.classList.toggle("eingeklappt"); el.scrollTop = 0; }
      else if (a === "teilen") this.opt.teilen && this.opt.teilen(this.gewaehlt);
    });
  }

  modusGeaendert() {
    document.querySelector("#live-modus use").setAttribute("href", this.art === "schiffe" ? "#i-flug" : "#i-schiff");
    document.getElementById("live-modus").title = this.art === "schiffe" ? "Zu den Flugzeugen wechseln" : "Zu den Schiffen wechseln";
    document.getElementById("live-weite").value = zuRegler(this.art, this.weite[this.art]);
    this._weiteText();
  }
  reichweiteKm() { return this.weite[this.art]; }
  _weiteText() { document.getElementById("live-weite-text").textContent = `${zahl(this.weite[this.art], this.weite[this.art] < 10 ? 1 : 0)} km`; }

  // ------------------------------------------------------------------ Öffnen / Schließen
  /** Muss direkt im Klick aufgerufen werden (iOS fragt nur dann nach Erlaubnis) */
  erlaubnis() {
    const D = window.DeviceOrientationEvent;
    if (!D) return Promise.resolve(false);
    if (typeof D.requestPermission === "function") return D.requestPermission().then((r) => r !== "denied").catch(() => true);
    return Promise.resolve(true);
  }

  oeffnen(ziel = null) {
    this.el.hidden = false;
    this.offen = true;
    this.hatDaten = false;
    this.absolutDa = false;
    this.iosVersatz = null;
    this.ohneSensoren = false;
    document.getElementById("live-kamera").hidden = false;
    document.getElementById("live-kompass").hidden = false;
    this._kompassFeld(false);
    this._infoZu();
    this.modusGeaendert();
    const b = this.opt.beobachter();
    this.deklination = b ? this.opt.missweisung(b.lat, b.lon) : 0;
    this._korrekturText();
    this.setzeZiel(ziel);
    const ereignis = "ondeviceorientationabsolute" in window ? "deviceorientationabsolute" : "deviceorientation";
    this.ereignisName = ereignis;
    window.addEventListener(ereignis, this._ereignis, true);
    if (ereignis === "deviceorientationabsolute") window.addEventListener("deviceorientation", this._ereignis, true);
    this.wartet = setTimeout(() => { if (!this.hatDaten) this._ohneSensoren(); }, 1600);
    if (navigator.wakeLock) navigator.wakeLock.request("screen").then((w) => (this.wach = w)).catch(() => {});
    if (speicher.lies("sf.liveKamera", true) && navigator.mediaDevices) this.kamera(true, true);
    this.opt.onAuf && this.opt.onAuf();
    requestAnimationFrame(this._bild);
  }

  schliessen() {
    if (!this.offen) return;
    this.offen = false;
    this.el.hidden = true;
    window.removeEventListener("deviceorientationabsolute", this._ereignis, true);
    window.removeEventListener("deviceorientation", this._ereignis, true);
    clearTimeout(this.wartet);
    this.kamera(false, true);
    if (this.wach) { this.wach.release().catch(() => {}); this.wach = null; }
    this.opt.onZu && this.opt.onZu();
  }

  async kamera(an, still = false) {
    const knopf = document.getElementById("live-kamera");
    if (!an) {
      if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
      this.video.classList.remove("an");
      this.video.srcObject = null;
      knopf.setAttribute("aria-pressed", "false");
      if (!still) speicher.schreib("sf.liveKamera", false);
      return;
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      if (!this.offen) { this.stream.getTracks().forEach((t) => t.stop()); this.stream = null; return; }
      this.video.srcObject = this.stream;
      await this.video.play().catch(() => {});
      this.video.classList.add("an");
      knopf.setAttribute("aria-pressed", "true");
      speicher.schreib("sf.liveKamera", true);
    } catch {
      if (!still) this.opt.melde("Die Kamera ließ sich nicht starten. Erlaubnis im Browser prüfen.");
    }
  }

  // ------------------------------------------------------------------ Kompass
  korrigiere(grad) {
    this.korrektur = wrap180(this.korrektur + grad);
    speicher.schreib("sf.kompassKorrektur", this.korrektur);
    this._korrekturText();
  }
  _korrekturText() { document.getElementById("live-korrektur").textContent = `${this.korrektur > 0 ? "+" : ""}${Math.round(this.korrektur)}°`; }
  _kompassFeld(an) {
    this.kompassOffen = an;
    document.getElementById("live-kompass-feld").hidden = !an;
    document.getElementById("live-kompass").setAttribute("aria-pressed", String(an));
    if (an) this._infoZu();
  }
  /** Objekt in der Bildmitte → Kompassfehler bestimmen */
  abgleichen() {
    const f = this._vorne();
    if (!f) { this.opt.melde("Ohne Lagesensoren geht der Abgleich nicht."); return; }
    const mitte = azElAus(f[0], f[1], f[2]);
    let best = null, bd = 14;
    for (const o of this._objekte || []) {
      if (o._az == null) continue;
      const d = Math.hypot(wrap180(o._az - mitte.az) * Math.cos(o._el * RAD), o._el - mitte.el);
      const w = this.ziel && this.ziel.id === o.id ? d * 0.5 : d;
      if (w < bd) { bd = w; best = o; }
    }
    if (!best) { this.opt.melde("Kein Schiff oder Flugzeug im Kreis. Nimm eins, das du sicher erkennst, genau in die Mitte und tippe noch einmal."); return; }
    this.korrigiere(wrap180(best._az - mitte.az));
    this.opt.melde(`Mit ${best.name} abgeglichen: Korrektur jetzt ${Math.round(this.korrektur)}°.`);
    this._kompassFeld(false);
  }

  // ------------------------------------------------------------------ Sensoren
  _ereignis(e) {
    if (e.alpha == null || e.beta == null || e.gamma == null) return;
    if (e.type === "deviceorientation" && this.ereignisName === "deviceorientationabsolute" && this.absolutDa) return;
    if (e.type === "deviceorientationabsolute") this.absolutDa = true;
    let alpha = e.alpha;
    const beta = e.beta, gamma = e.gamma;
    let absolut = e.type === "deviceorientationabsolute" || e.absolute === true;
    if (typeof e.webkitCompassHeading === "number" && !Number.isNaN(e.webkitCompassHeading)) {
      // iOS: Versatz nur in eindeutiger Haltung bestimmen (beim Hochhalten springt die Kompassrichtung)
      if (Math.abs(gamma) < 20 && beta > 15 && beta < 80 && (e.webkitCompassAccuracy == null || e.webkitCompassAccuracy >= 0)) {
        const d = wrap180((360 - e.webkitCompassHeading) - alpha);
        this.iosVersatz = this.iosVersatz == null ? d : this.iosVersatz + 0.08 * wrap180(d - this.iosVersatz);
      }
      if (this.iosVersatz != null) { alpha = alpha + this.iosVersatz; absolut = true; }
    }
    this.absolut = absolut;
    if (absolut) alpha -= this.deklination;
    alpha -= this.korrektur;
    const roh = qEuler(beta * RAD, gamma * RAD, alpha * RAD);
    this.q = this.hatDaten ? qSlerp(this.q, roh, 0.22) : roh;
    if (!this.hatDaten && this.ohneSensoren) {
      this.ohneSensoren = false;
      document.getElementById("live-kamera").hidden = false;
      document.getElementById("live-kompass").hidden = false;
    }
    this.hatDaten = true;
  }
  _ohneSensoren() {
    this.ohneSensoren = true;
    document.getElementById("live-kamera").hidden = true;
    document.getElementById("live-kompass").hidden = true;
    this.kamera(false, true);
  }

  _gesten() {
    const c = this.c;
    const zeiger = new Map();
    let start = null, pinch = null;
    const abstand = () => { const [a, b] = [...zeiger.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
    c.addEventListener("pointerdown", (e) => {
      this._flug = null;
      zeiger.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (zeiger.size === 1) start = { x: e.clientX, y: e.clientY, t: performance.now(), az: this.blick.az, el: this.blick.el, bewegt: false };
      else if (zeiger.size === 2) { pinch = { d: abstand(), zoom: this.zoom }; start = null; }
      try { c.setPointerCapture(e.pointerId); } catch { /* egal */ }
    });
    c.addEventListener("pointermove", (e) => {
      if (!zeiger.has(e.pointerId)) return;
      zeiger.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && zeiger.size >= 2) { this.zoom = Math.max(0.6, Math.min(5, pinch.zoom * abstand() / Math.max(10, pinch.d))); return; }
      if (!start) return;
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (!start.bewegt && Math.hypot(dx, dy) > 8) start.bewegt = true;
      if (start.bewegt && !this.hatDaten) {
        const f = this.F || 600;
        this.blick.az = wrap360(start.az - dx / f * DEG);
        this.blick.el = Math.max(-30, Math.min(85, start.el + dy / f * DEG));
      }
    });
    const ende = (e) => {
      if (!zeiger.has(e.pointerId)) return;
      zeiger.delete(e.pointerId);
      if (zeiger.size < 2) pinch = null;
      if (start && !start.bewegt && performance.now() - start.t < 600 && e.type === "pointerup") {
        const r = c.getBoundingClientRect();
        this._tippen(e.clientX - r.left, e.clientY - r.top, e.pointerType === "mouse" ? 22 : 34);
      }
      if (!zeiger.size) start = null;
    };
    c.addEventListener("pointerup", ende);
    c.addEventListener("pointercancel", ende);
    c.addEventListener("wheel", (e) => { e.preventDefault(); this.zoom = Math.max(0.6, Math.min(5, this.zoom * Math.exp(-e.deltaY * 0.0015))); }, { passive: false });
  }

  _vorne() { return this.hatDaten ? qDreh(this.q, [0, 0, -1]) : null; }
  _achsen() {
    const winkel = ((screen.orientation && screen.orientation.angle) ?? window.orientation ?? 0) * RAD;
    if (this.hatDaten) {
      const q = qMal(this.q, qAchse(0, 0, 1, -winkel));
      return { r: qDreh(q, [1, 0, 0]), u: qDreh(q, [0, 1, 0]), f: qDreh(q, [0, 0, -1]) };
    }
    const f = enuAus(this.blick.az, this.blick.el);
    const az = this.blick.az * RAD;
    const r = [Math.cos(az), -Math.sin(az), 0];
    const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
    return { r, u, f };
  }

  // ------------------------------------------------------------------ Ziel, Antippen, Info
  setzeZiel(o) {
    this.ziel = o ? { id: o.id, art: o.art, name: o.name } : null;
    document.getElementById("live-pfeil").hidden = !o;
    this._chipsZeit = 0;
    if (o && !this.hatDaten && this.offen) {
      // ohne Sensoren: Blick selbst hindrehen
      const x = (this._objekte || []).find((k) => k.id === o.id);
      if (x && x._az != null) this.blick = { az: x._az, el: Math.max(-5, Math.min(60, x._el + 1)) };
    }
  }
  _tippen(x, y, r) {
    let best = null, bd = r;
    for (const t of this.treffer || []) {
      const d = Math.hypot(t.x - x, t.y - y) - Math.max(0, (t.r || r) - r);
      if (d < bd) { bd = d; best = t.o; }
    }
    if (!best) { this._infoZu(); return; }
    this.gewaehlt = best;
    this._infoNeu();
  }
  /** Infokarte einmal aufbauen (Foto, Route, Register … wie die Infobox der Karte), danach nur Werte auffrischen */
  _infoNeu() {
    const o = this.gewaehlt;
    const el = document.getElementById("live-info");
    if (!o) { this._infoZu(); return; }
    const ok = this.opt.infoAufbauen && this.opt.infoAufbauen(el, o);
    if (!ok) el.innerHTML = `<div class="ib-innen"><div class="ib-kopf"><div class="ib-titel"><h2>${esc(o.name)}</h2><p>Keine weiteren Daten</p></div><div class="kopf-knopfe"><button class="rund klein" data-aktion="zu" aria-label="Schließen"><svg><use href="#i-zu"/></svg></button></div></div></div>`;
    el.hidden = false;
    el.classList.remove("eingeklappt");
    el.scrollTop = 0;
    document.querySelector(".live-unten").classList.add("info-offen");
    this._infoWerte();
  }
  _infoWerte() {
    const o = this.gewaehlt;
    if (!o) return;
    const x = (this._objekte || []).find((k) => k.id === o.id);
    this.opt.infoWerte && this.opt.infoWerte(document.getElementById("live-info"), o, this._blickText(x));
  }
  _blickText(x) {
    if (!x || x._az == null) return "Gerade außerhalb der Reichweite";
    const teile = [`Richtung ${Math.round(x._az)}° (${richtungKurz(x._az)})`];
    teile.push(x._el >= 0 ? `${zahl(x._el, x._el < 10 ? 1 : 0)}° über dem Horizont` : `${zahl(-x._el, 1)}° unter dem Horizont`);
    if (x.art === "schiff") teile.push(x._hinter ? "vermutlich hinter dem Horizont – evtl. nur die Aufbauten zu sehen" : "in Sichtweite");
    else teile.push(`${weite(x._d3 || x._d)} Luftlinie`);
    return teile.join(" · ");
  }
  _infoZu() {
    this.gewaehlt = null;
    const el = document.getElementById("live-info");
    el.hidden = true; el.innerHTML = "";
    const u = document.querySelector(".live-unten");
    if (u) u.classList.remove("info-offen");
  }

  // ------------------------------------------------------------------ Zeichnen
  _bild() {
    if (!this.offen) return;
    requestAnimationFrame(this._bild);
    try { this._zeichnen(); } catch (e) { if (!this._fehlerGemeldet) { this._fehlerGemeldet = true; console.error(e); } }
  }

  _zeichnen() {
    const c = this.c, w = c.clientWidth, h = c.clientHeight;
    if (!w || !h) return;
    const pr = Math.min(window.devicePixelRatio || 1, 2);
    if (c.width !== Math.round(w * pr) || c.height !== Math.round(h * pr)) { c.width = Math.round(w * pr); c.height = Math.round(h * pr); }
    const g = c.getContext("2d");
    g.setTransform(pr, 0, 0, pr, 0, 0);
    const ich = this.opt.beobachter();
    const auge = this.opt.augenhoehe();
    const b = ich ? beobachter(ich.lat, ich.lon, auge) : null;
    const fov = Math.max(12, Math.min(110, (this.stream ? KAMERAWINKEL : SICHTWINKEL) / this.zoom));
    const cx = w / 2, cy = h / 2;
    const F = (Math.max(w, h) / 2) / Math.tan((fov / 2) * RAD);
    this.F = F;
    const ax = this._achsen();
    const [fx, fy, fz] = ax.f, [rx, ry, rz] = ax.r, [ux, uy, uz] = ax.u;
    const projE = (e, n, u) => {
      const z = e * fx + n * fy + u * fz;
      if (z < 0.02) return null;
      return { x: cx + F * (e * rx + n * ry + u * rz) / z, y: cy - F * (e * ux + n * uy + u * uz) / z, z };
    };
    const proj = (az, el) => { const v = enuAus(az, el); return projE(v[0], v[1], v[2]); };

    // Hintergrund (ohne Kamera): Himmel und Wasser
    if (this.stream) g.clearRect(0, 0, w, h);
    else {
      g.fillStyle = "#04070f"; g.fillRect(0, 0, w, h);
    }
    const dip = -Math.sqrt(2 * auge / 6371000) * DEG; // Kimmtiefe
    // Horizontlinie
    const hor = [];
    for (let az = 0; az <= 360; az += 3) { const p = proj(az, dip); hor.push(p); }
    if (!this.stream) {
      // Wasser unterhalb des Horizonts dunkler: Fläche vor mir zwischen Horizont und steil unten
      const m0 = azElAus(fx, fy, fz).az;
      const pts = [];
      for (let d = -100; d <= 100; d += 4) pts.push(proj(m0 + d, dip));
      for (let d = 100; d >= -100; d -= 4) pts.push(proj(m0 + d, -75));
      const ok = pts.filter(Boolean);
      if (ok.length > 4) {
        g.fillStyle = "rgba(8,24,44,0.88)";
        g.beginPath(); g.moveTo(ok[0].x, ok[0].y);
        for (const p of ok) g.lineTo(Math.max(-5000, Math.min(w + 5000, p.x)), Math.max(-5000, Math.min(h + 5000, p.y)));
        g.closePath(); g.fill();
      }
    }
    g.lineWidth = 1.5; g.strokeStyle = "rgba(140,210,255,0.8)";
    g.beginPath();
    let auf = false;
    for (const p of hor) { if (!p || p.x < -2000 || p.x > w + 2000) { auf = false; continue; } if (!auf) { g.moveTo(p.x, p.y); auf = true; } else g.lineTo(p.x, p.y); }
    g.stroke();
    // Gradskala am Horizont
    g.font = "600 12px system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "top";
    for (let az = 0; az < 360; az += 5) {
      const p = proj(az, dip);
      if (!p || p.x < -20 || p.x > w + 20) continue;
      const lang = az % 45 === 0, mittel = az % 15 === 0;
      g.strokeStyle = "rgba(170,215,255,0.75)"; g.lineWidth = lang ? 2 : 1;
      g.beginPath(); g.moveTo(p.x, p.y - (lang ? 10 : mittel ? 6 : 3)); g.lineTo(p.x, p.y + (lang ? 10 : mittel ? 6 : 3)); g.stroke();
      if (mittel) {
        g.fillStyle = lang ? "#fff" : "rgba(210,230,255,0.85)";
        g.font = lang ? "700 13px system-ui, sans-serif" : "500 11px system-ui, sans-serif";
        const t = lang ? ["N", "NO", "O", "SO", "S", "SW", "W", "NW"][az / 45] : `${az}°`;
        g.strokeStyle = "rgba(0,0,0,.6)"; g.lineWidth = 3; g.strokeText(t, p.x, p.y + 12); g.fillText(t, p.x, p.y + 12);
      }
    }

    // Objekte
    const jetzt = Date.now();
    const art = this.art;
    const weiteM = this.weite[art] * 1000;
    const roh = ich ? this.opt.objekte(art, ich, weiteM) : [];
    const sicht = [];
    this.treffer = [];
    for (const o of roh) {
      const r = azEl(b, o.lat, o.lon, o.h);
      o._az = r.az; o._el = r.el; o._d = r.boden; o._d3 = r.d;
      if (r.boden > weiteM) continue;
      if (art === "schiffe") o._hinter = r.boden > horizont(auge, o.hoehe || 10);
      sicht.push(o);
    }
    sicht.sort((a, b2) => b2._d - a._d); // ferne zuerst zeichnen
    this._objekte = sicht;
    const oben = document.querySelector(".live-oben").offsetHeight || 80;
    const untenEl = document.querySelector(".live-unten");
    const untenH = untenEl ? untenEl.offsetHeight : 160;
    const et = new Etiketten(g, w, h, [{ x: 0, y: 0, w, h: oben - 16 }, { x: 0, y: h - untenH + 12, w, h: untenH }, { x: w - 64, y: oben, w: 64, h: 170 }], { kontur: "rgba(0,0,0,0.7)" });
    const volleSchrift = this.opt.beschriftung() === "voll";
    const faehnchen = [];
    let imBild = 0;
    for (const o of sicht) {
      const p = proj(o._az, o._el);
      if (!p || p.x < -120 || p.x > w + 120 || p.y < -80 || p.y > h + 120) continue;
      imBild++;
      const nah = Math.max(0, Math.min(1, 1 - Math.log10(Math.max(o._d, 100) / 100) / Math.log10(weiteM / 100 + 1)));
      const istZiel = this.ziel && this.ziel.id === o.id;
      const istWahl = this.gewaehlt && this.gewaehlt.id === o.id;
      // Bewegung: wo ist es in 20 s (Flugzeug) bzw. 2 min (Schiff)? → Strich und Flugrichtung des Symbols
      let bewegung = null;
      if (o.v > 0.5 && o.kurs != null) {
        const t = art === "schiffe" ? 120 : 20;
        const [lo2, la2] = koppeln(o.lat, o.lon, o.v, o.kurs, t);
        const r2 = azEl(b, la2, lo2, o.h);
        const p2 = proj(r2.az, r2.el);
        if (p2) { const dx = p2.x - p.x, dy = p2.y - p.y, l = Math.hypot(dx, dy); if (l > 1.5) bewegung = { dx, dy, l }; }
      }
      const name = o.name;
      const zusatz = volleSchrift ? `${weite(o._d)}${o.kurzinfo ? " · " + o.kurzinfo : ""}` : "";
      const prio = (istZiel ? 1000 : 0) + (istWahl ? 500 : 0) + nah * 100 + (o.wichtig || 0);
      g.globalAlpha = o._hinter ? 0.55 : 1;
      if (art === "schiffe") {
        // Seitenansicht je nach Art, Bug in Fahrtrichtung, Größe nach echter Länge und Entfernung
        const kurs = o.kurs ?? o.hdg;
        let rechts = true, fore = 0.85;
        if (kurs != null) { const rel = wrap180(kurs - o._az); rechts = rel >= 0; fore = 0.5 + 0.5 * Math.abs(Math.sin(rel * RAD)); }
        const echt = F * (o.laenge || 25) / Math.max(o._d, 60) * fore;
        const lpx = Math.max(34 + 20 * nah, Math.min(190, echt));
        const fig = figur("seite-" + (o.seite || "sonst"), o.farbe, lpx);
        const oberkante = p.y - fig.innenH * (19 / SEITE_H);
        if (bewegung) {
          const k = Math.min(bewegung.l, 50) / bewegung.l;
          g.strokeStyle = o.farbe; g.lineWidth = 2; g.globalAlpha *= 0.8;
          g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x + bewegung.dx * k, p.y + bewegung.dy * k); g.stroke();
          g.globalAlpha = o._hinter ? 0.55 : 1;
        }
        if (o.notfall) { g.fillStyle = "rgba(255,50,50,0.35)"; g.beginPath(); g.ellipse(p.x, p.y - fig.innenH * 0.35, lpx * 0.6 + 4 * Math.sin(jetzt / 200), fig.innenH * 0.8, 0, 0, Math.PI * 2); g.fill(); }
        g.save(); g.translate(p.x, 0); if (!rechts) g.scale(-1, 1);
        g.drawImage(fig, -fig.w / 2, oberkante - fig.pad, fig.w, fig.h);
        g.restore();
        if (istZiel || istWahl) {
          g.strokeStyle = istZiel ? "#6fe39a" : "#fff"; g.lineWidth = 2.5;
          const rr = 6, x0 = p.x - lpx / 2 - 6, y0 = oberkante - 6, bw = lpx + 12, bh = fig.innenH + 10;
          g.beginPath(); g.moveTo(x0 + rr, y0); g.arcTo(x0 + bw, y0, x0 + bw, y0 + bh, rr); g.arcTo(x0 + bw, y0 + bh, x0, y0 + bh, rr); g.arcTo(x0, y0 + bh, x0, y0, rr); g.arcTo(x0, y0, x0 + bw, y0, rr); g.stroke();
        }
        g.globalAlpha = 1;
        this.treffer.push({ x: p.x, y: oberkante + fig.innenH / 2, o, r: Math.max(26, lpx / 2 + 6) });
        if (p.x > 0 && p.x < w) faehnchen.push({ name, zusatz, x: p.x, y: oberkante - 2, prio: prio + (o.notfall ? 800 : 0), ziel: istZiel, wahl: istWahl, farbe: o.farbe, notfall: o.notfall, o });
      } else {
        // Flugzeug-Umriss, Nase in Flugrichtung auf dem Bildschirm, Größe nach Spannweite und Entfernung
        if (bewegung) o._dreh = Math.atan2(bewegung.dy, bewegung.dx) + Math.PI / 2;
        const echt = F * (o.spann || 30) / Math.max(o._d3 || o._d, 80);
        const px = Math.max(26 + 20 * nah, Math.min(130, echt));
        const fig = figur(o.symbol || "f-jet2", o.farbe, px);
        if (bewegung) {
          const k = Math.min(bewegung.l, 70) / bewegung.l;
          g.strokeStyle = o.farbe; g.lineWidth = 1.5; g.globalAlpha = 0.55; g.setLineDash([4, 4]);
          g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x + bewegung.dx * k, p.y + bewegung.dy * k); g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
        }
        if (o.notfall) { g.fillStyle = "rgba(255,50,50,0.38)"; g.beginPath(); g.arc(p.x, p.y, px * 0.6 + 4 * Math.sin(jetzt / 200), 0, Math.PI * 2); g.fill(); }
        g.save(); g.translate(p.x, p.y); g.rotate(o._dreh || 0);
        g.drawImage(fig, -fig.w / 2, -fig.h / 2, fig.w, fig.h);
        g.restore();
        if (istZiel || istWahl) { g.strokeStyle = istZiel ? "#6fe39a" : "#fff"; g.lineWidth = 2.5; g.beginPath(); g.arc(p.x, p.y, px * 0.62 + 4, 0, Math.PI * 2); g.stroke(); }
        this.treffer.push({ x: p.x, y: p.y, o, r: Math.max(26, px * 0.6) });
        if (p.x > 0 && p.x < w) et.dazu(name + (zusatz ? " · " + zusatz : ""), p.x, p.y, px * 0.5, istZiel ? "#b6ffcf" : "#ffffff", `${nah > 0.5 ? 700 : 600} ${Math.round(11.5 + 3 * nah)}px system-ui, sans-serif`, prio, istZiel || istWahl);
      }
    }
    et.zeichne();
    this._faehnchen(g, faehnchen, w, h, oben, untenH);

    // Fadenkreuz in der Mitte (für den Abgleich)
    if (this.kompassOffen) {
      g.strokeStyle = "rgba(255,255,255,.85)"; g.lineWidth = 1.5;
      g.beginPath(); g.arc(cx, cy, F * Math.tan(7 * RAD), 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.moveTo(cx - 10, cy); g.lineTo(cx + 10, cy); g.moveTo(cx, cy - 10); g.lineTo(cx, cy + 10); g.stroke();
    }

    // Ziel: Pfeil am Rand und Anweisung
    this._zielAnzeigen(g, w, h, cx, cy, proj, ax);

    // Titelzeile
    const f = ax.f;
    const mitte = azElAus(f[0], f[1], f[2]);
    const wort = art === "schiffe" ? ["Schiff", "Schiffe"] : ["Flugzeug", "Flugzeuge"];
    const titel = document.getElementById("live-titel");
    const unter = document.getElementById("live-unter");
    titel.textContent = `Live-Blick · ${wort[1]}`;
    if (!ich) unter.textContent = "Ohne deinen Standort geht der Live-Blick nicht.";
    else if (this.ohneSensoren) unter.textContent = `Keine Lagesensoren – zum Umsehen ziehen. Blick nach ${richtungLang(mitte.az)}.`;
    else if (!this.hatDaten) unter.textContent = "Warte auf die Lagesensoren …";
    else unter.textContent = `Blick nach ${richtungLang(mitte.az)} (${Math.round(mitte.az)}°) · ${imBild} von ${sicht.length} ${sicht.length === 1 ? wort[0] : wort[1]} im Bild${this.absolut === false ? " · Kompass fehlt" : ""}`;

    // Chips (nächste Objekte), höchstens alle 1,5 s neu
    if (performance.now() - (this._chipsZeit || 0) > 1500) {
      this._chipsZeit = performance.now();
      const nach = [...sicht].sort((a, b2) => a._d - b2._d).slice(0, 16);
      const el = document.getElementById("live-chips");
      el.innerHTML = nach.length
        ? nach.map((o) => `<button class="live-chip" data-id="${esc(o.id)}" aria-pressed="${this.ziel && this.ziel.id === o.id}"><img alt="" src="${figurBild(art === "schiffe" ? "seite-" + (o.seite || "sonst") : o.symbol, o.farbe, art === "schiffe" ? 34 : 24)}">${esc(o.name)} <small>${weite(o._d)}</small></button>`).join("")
        : `<span class="live-chip"><small>${ich ? `Keine ${wort[1]} im Umkreis von ${zahl(this.weite[art])} km – Reichweite unten vergrößern.` : "Standort fehlt."}</small></span>`;
      if (this.gewaehlt) this._infoWerte();
    }
  }

  /** Schiffe liegen alle am Horizont: Namen als Fähnchen darüber staffeln, mit Strich zum Schiff */
  _faehnchen(g, liste, w, h, oben, untenH) {
    liste.sort((a, b) => b.prio - a.prio);
    const boxen = [];
    const frei = (b) => b.x >= 4 && b.x + b.w <= w - 60 && b.y >= oben && b.y + b.h <= h - untenH && !boxen.some((a) => a.x < b.x + b.w + 4 && b.x < a.x + a.w + 4 && a.y < b.y + b.h + 2 && b.y < a.y + a.h + 2);
    const gesetzt = [];
    for (const f of liste) {
      g.font = "700 13px system-ui, sans-serif";
      const w1 = g.measureText(f.name).width;
      g.font = "500 11px system-ui, sans-serif";
      const w2 = f.zusatz ? g.measureText(f.zusatz).width : 0;
      const bw = Math.max(w1, w2) + 14, bh = f.zusatz ? 34 : 20;
      let box = null;
      for (let stufe = 0; stufe < 7 && !box; stufe++) {
        for (const dx of [0, -bw / 2 + 10, bw / 2 - 10]) {
          const b = { x: f.x - bw / 2 + dx, y: f.y - 26 - bh - stufe * (bh + 6), w: bw, h: bh };
          if (frei(b)) { box = b; break; }
        }
      }
      if (!box && (f.ziel || f.wahl)) box = { x: Math.max(4, Math.min(w - 64 - bw, f.x - bw / 2)), y: f.y - 26 - bh, w: bw, h: bh };
      if (!box) continue;
      boxen.push(box);
      gesetzt.push([f, box]);
    }
    for (const [f, b] of gesetzt) {
      g.strokeStyle = f.ziel ? "#6fe39a" : "rgba(255,255,255,0.7)"; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(f.x, f.y - 2); g.lineTo(Math.max(b.x + 6, Math.min(b.x + b.w - 6, f.x)), b.y + b.h); g.stroke();
      g.fillStyle = f.ziel ? "rgba(20,90,50,0.88)" : f.notfall ? "rgba(150,20,20,0.9)" : f.wahl ? "rgba(40,60,110,0.9)" : "rgba(8,12,22,0.78)";
      const r = 7;
      g.beginPath(); g.moveTo(b.x + r, b.y); g.arcTo(b.x + b.w, b.y, b.x + b.w, b.y + b.h, r); g.arcTo(b.x + b.w, b.y + b.h, b.x, b.y + b.h, r); g.arcTo(b.x, b.y + b.h, b.x, b.y, r); g.arcTo(b.x, b.y, b.x + b.w, b.y, r); g.closePath(); g.fill();
      g.fillStyle = f.farbe; g.fillRect(b.x, b.y + 4, 3, b.h - 8);
      g.textAlign = "left"; g.textBaseline = "top";
      g.fillStyle = "#fff"; g.font = "700 13px system-ui, sans-serif"; g.fillText(f.name, b.x + 8, b.y + 3);
      if (f.zusatz) { g.fillStyle = "rgba(210,222,245,0.9)"; g.font = "500 11px system-ui, sans-serif"; g.fillText(f.zusatz, b.x + 8, b.y + 19); }
      this.treffer.push({ x: b.x + b.w / 2, y: b.y + b.h / 2, o: f.o });
    }
  }

  _zielAnzeigen(g, w, h, cx, cy, proj, ax) {
    const pfeil = document.getElementById("live-pfeil");
    if (!this.ziel) { pfeil.hidden = true; return; }
    const o = (this._objekte || []).find((k) => k.id === this.ziel.id);
    const text = document.getElementById("live-pfeil-text");
    pfeil.hidden = false;
    if (!o) { text.textContent = `${this.ziel.name}: gerade nicht in Reichweite`; pfeil.classList.remove("ziel"); return; }
    const p = proj(o._az, o._el);
    const f = ax.f;
    const mitte = azElAus(f[0], f[1], f[2]);
    const dAz = wrap180(o._az - mitte.az), dEl = o._el - mitte.el;
    const imZiel = p && Math.abs(p.x - cx) < w * 0.18 && Math.abs(p.y - cy) < h * 0.18;
    pfeil.classList.toggle("ziel", !!imZiel);
    const svg = pfeil.querySelector("svg");
    if (imZiel) { text.textContent = `${o.name} ist im Bild – ${weite(o._d)} entfernt`; svg.style.transform = "rotate(0deg)"; svg.style.display = "none"; return; }
    svg.style.display = "";
    const winkel = Math.atan2(-dEl, dAz) * DEG;
    svg.style.transform = `rotate(${winkel}deg)`;
    const seite = Math.abs(dAz) > 8 ? `${Math.round(Math.abs(dAz))}° nach ${dAz > 0 ? "rechts" : "links"}` : "";
    const hoch = Math.abs(dEl) > 6 ? `${dEl > 0 ? "höher" : "tiefer"}` : "";
    text.textContent = `Dreh dich ${[seite, hoch].filter(Boolean).join(" und ") || "ein kleines Stück"} – ${o.name}`;
    // Pfeil am Bildrand
    const ang = Math.atan2(-dEl, dAz);
    const rx = w / 2 - 34, ry = h / 2 - 120;
    const t = Math.min(rx / Math.abs(Math.cos(ang) || 1e-6), ry / Math.abs(Math.sin(ang) || 1e-6));
    const px = cx + Math.cos(ang) * t, py = cy - Math.sin(ang) * t;
    g.save(); g.translate(px, py); g.rotate(-ang);
    g.fillStyle = "#6fe39a"; g.strokeStyle = "rgba(0,0,0,.7)"; g.lineWidth = 2;
    g.beginPath(); g.moveTo(18, 0); g.lineTo(-10, -13); g.lineTo(-4, 0); g.lineTo(-10, 13); g.closePath(); g.fill(); g.stroke();
    g.restore();
  }
}

export { entfernung, KN };
