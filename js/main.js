// Schiffe & Flugzeuge live – Ablauf: Modus, Standort, Daten, Karte, Liste, Infobox, Live-Blick
import { Karte, zoomFaktorSchiff, MASS, ml } from "./karte.js";
import { SchiffDaten, commonsFoto, haefenLaden, hafen } from "./schiffe.js";
import { FlugDaten, kreiseFuer } from "./flugzeuge.js";
import { LiveBlick } from "./live.js";
import * as IB from "./infobox.js";
import { $, $$, esc, zahl, melde, speicher, einheiten, tempo, hoehe, weite, richtungKurz } from "./ui.js";
import { SCHIFF_GRUPPEN, SCHIFF_GRUPPEN_LISTE, faehrt as schiffFaehrt, flugTyp, airline, SQUAWK, HOEHEN_FARBEN, BODEN_FARBE, schiffArt, flagge } from "./texte.js";
import { mppZoom0, koppeln, KN, entfernung, zielpunkt, grosskreis, RAD, DEG, R } from "./geo.js";
import { vorschau } from "./symbole.js";
import { orteLaden, ortName } from "./orte.js";
import { missweisung } from "./magvar.js";

const RELAY_STANDARD = "https://schiffe-flugzeuge.fbw159.workers.dev";
const PC = window.matchMedia("(min-width: 900px)");
const STANDARD = { modus: "schiffe", grund: "karte", seezeichen: true, nacht: true, tempo: "beides", hoehe: "m", auge: 1.7, beschriftung: "voll", relay: RELAY_STANDARD, gruppenAus: [], flugAus: [], nurFahrend: false, ohneKlein: false };

const E = {
  einst: { ...STANDARD, ...(speicher.lies("sf.einst", {}) || {}) },
  ich: null,
  wahl: null,          // { art: "schiff" | "flug", id }
  folgen: false,
  spurAn: true,
  sort: "nah",
  reiter: "liste",
  schiffUebersicht: true,
  gestartet: false,
};
E.modus = E.einst.modus;
einheiten.tempo = E.einst.tempo;
einheiten.hoehe = E.einst.hoehe;
if (!/^https:\/\/[\w.-]+(:\d+)?$/.test(E.einst.relay || "")) E.einst.relay = RELAY_STANDARD;
const sichern = () => speicher.schreib("sf.einst", E.einst);

// Adresszeile: #schiffe, #flugzeuge, #schiff=MMSI, #flug=HEX
const anfang = (() => {
  const h = decodeURIComponent(location.hash.slice(1));
  if (h === "schiffe" || h === "flugzeuge") return { modus: h };
  let m = /^schiff=(\d{6,9})$/.exec(h);
  if (m) return { modus: "schiffe", schiff: Number(m[1]) };
  m = /^flug=(~?[0-9a-f]{6})$/i.exec(h);
  if (m) return { modus: "flugzeuge", flug: m[1].toLowerCase() };
  return {};
})();
if (anfang.modus) E.modus = anfang.modus;
document.body.dataset.modus = E.modus;

orteLaden();

// ------------------------------------------------------------------ Daten
const schiffe = new SchiffDaten({
  onDaten: () => { E.datenZeit = Date.now(); schiffeZeichnen(); },
  onLive: () => { E.liveZeit = Date.now(); },
  onFehler: (t) => fehler(t),
});
const flug = new FlugDaten({
  relay: E.einst.relay,
  onDaten: () => { E.datenZeit = Date.now(); E.liveZeit = Date.now(); flugZeichnen(true); },
  onFehler: (t) => fehler("Flugdaten: " + t),
});
let fehlerZeit = 0;
function fehler(t) {
  if (Date.now() - fehlerZeit < 60000) return;
  fehlerZeit = Date.now();
  melde(`Daten kommen gerade nicht an (${t}). Ich versuche es weiter.`, 6);
}

// ------------------------------------------------------------------ Karte
const karte = new Karte($("#karte"), {
  modus: E.modus,
  namensnennung: "",
  onWahl: (f) => wahlAusKarte(f),
  onLeer: () => { if (E.wahl) infoboxZu(); $("#ebenen-menue").hidden = true; },
  onBewegt: () => bereichAktualisieren(),
  onZoom: () => { E.zoomZeit = Date.now(); },
  onZiehen: () => { if (E.folgen) folgen(false); },
  onDrehen: () => nordKnopf(),
});

function startBlick() {
  const ort = speicher.lies("sf.ort", null);
  if (anfang.schiff || anfang.flug) return { mitte: [ort ? ort.lon : 10, ort ? ort.lat : 50], zoom: 1.6 };
  return { mitte: [ort ? ort.lon - 40 : -20, ort ? Math.max(-50, Math.min(50, ort.lat - 10)) : 30], zoom: 1.25 };
}

async function start() {
  const b = startBlick();
  try {
    await karte.start(b.mitte, b.zoom);
  } catch (e) {
    $("#lade-text").textContent = "Die Karte ließ sich nicht starten. Dein Browser braucht WebGL.";
    console.error(e);
    return;
  }
  karte.setGrund(E.einst.grund);
  karte.setSeezeichen(E.einst.seezeichen);
  karte.map.setLayoutProperty("nacht-0", "visibility", E.einst.nacht ? "visible" : "none");
  for (const i of [1, 2]) karte.map.setLayoutProperty("nacht-" + i, "visibility", E.einst.nacht ? "visible" : "none");
  filterAnwenden();
  E.gestartet = true;
  $("#lade").classList.add("weg");
  setTimeout(() => ($("#lade").hidden = true), 700);
  modusSetzen(E.modus, false);
  standortStarten();
  // Anflug: sobald der Standort da ist (höchstens 5 s warten)
  const ziel = () => {
    if (E.angeflogen) return;
    E.angeflogen = true;
    if (anfang.schiff) { schiffOeffnen(anfang.schiff, true); return; }
    if (anfang.flug) { flugOeffnen(anfang.flug, true); return; }
    const o = E.ich || speicher.lies("sf.ort", null);
    if (o) karte.flieg(o.lon, o.lat, E.modus === "schiffe" ? 9.6 : 7.4, { dauer: matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 3400 });
    else karte.flieg(10, 52, 3.6, { dauer: 3000 });
  };
  E.anflugZiel = ziel;
  setTimeout(ziel, E.ich ? 300 : 5000);
  bereichAktualisieren();
  setInterval(takt, 1000);
  flugTakt();
}

// ------------------------------------------------------------------ Standort
function standortStarten() {
  if (!navigator.geolocation) { ortText(); return; }
  const ok = (p) => {
    const erstes = !E.ich;
    E.ich = { lat: p.coords.latitude, lon: p.coords.longitude, genau: p.coords.accuracy };
    speicher.schreib("sf.ort", { lat: Math.round(E.ich.lat * 100) / 100, lon: Math.round(E.ich.lon * 100) / 100 });
    ichMarke();
    ortText();
    if (erstes && E.anflugZiel && !E.angeflogen) setTimeout(E.anflugZiel, 200);
  };
  const nein = () => { ortText(); };
  navigator.geolocation.getCurrentPosition(ok, nein, { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 });
  navigator.geolocation.watchPosition(ok, nein, { enableHighAccuracy: true, maximumAge: 20000 });
}
let marke = null;
function ichMarke() {
  if (!E.ich || !karte.bereit) return;
  if (!marke) {
    const el = document.createElement("div");
    el.className = "marke-ich";
    el.title = "Du bist hier";
    marke = new ml.Marker({ element: el, pitchAlignment: "map", rotationAlignment: "map" }).setLngLat([E.ich.lon, E.ich.lat]).addTo(karte.map);
  } else marke.setLngLat([E.ich.lon, E.ich.lat]);
}
function ortText() {
  const el = $("#ort-text");
  if (!E.ich) { el.textContent = navigator.geolocation ? "Standort unbekannt" : "Standort nicht verfügbar"; return; }
  const o = ortName(E.ich.lat, E.ich.lon);
  el.textContent = o ? `Du: ${o.replace(/^(dem|der|den) /, "")}` : `${zahl(E.ich.lat, 2)}° / ${zahl(E.ich.lon, 2)}°`;
}
$("#knopf-ort").onclick = () => {
  if (!E.ich) { melde("Dein Standort ist noch nicht bekannt. Bitte Standortfreigabe im Browser erlauben.", 6); standortStarten(); return; }
  folgen(false);
  karte.flieg(E.ich.lon, E.ich.lat, Math.max(karte.zoom, E.modus === "schiffe" ? 10 : 7.5), { pitch: 0, bearing: 0 });
};

// ------------------------------------------------------------------ Modus
function modusSetzen(m, nutzer = true) {
  if (E.wahl) infoboxZu();
  E.modus = m;
  E.einst.modus = m;
  sichern();
  document.body.dataset.modus = m;
  for (const b of $$(".modus button")) b.setAttribute("aria-selected", String(b.dataset.modus === m));
  history.replaceState(null, "", "#" + m);
  $("#titel").textContent = m === "schiffe" ? "Schiffe live" : "Flugzeuge live";
  $("#suche").placeholder = m === "schiffe" ? "Schiff, MMSI, Ziel …" : "Flug, Kennzeichen, Typ …";
  karte.setModus(m);
  if (m === "schiffe") { flug.stop(); karte.setDaten("flug", []); }
  else { schiffe.setBereich(null, false); karte.setDaten("schiffe", []); }
  legendeZeichnen();
  filterZeichnen();
  bereichAktualisieren();
  if (m === "flugzeuge") flug.start();
  $("#kurz").textContent = "Daten werden geladen …";
  $("#liste").innerHTML = "";
  if (nutzer && karte.bereit) {
    // Zoom passend zum Modus
    const z = karte.zoom;
    if (m === "flugzeuge" && z > 11) karte.flieg(karte.mitte.lon, karte.mitte.lat, 9.5, { dauer: 900 });
  }
  if (live.offen) live.modusGeaendert();
}
for (const b of $$(".modus button")) b.onclick = () => { if (b.dataset.modus !== E.modus) modusSetzen(b.dataset.modus); };

// ------------------------------------------------------------------ Ausschnitt → Daten
function bereichAktualisieren() {
  if (!karte.bereit) return;
  if (live.offen) { liveBereich(); return; }
  const box = karte.box();
  if (E.modus === "schiffe") {
    const fl = (box.e - box.w) * (box.n - box.s);
    const einzeln = karte.zoom >= 5.2 && fl <= 120;
    E.schiffUebersicht = !einzeln;
    karte.setSchiffAnsicht(!einzeln);
    schiffe.setBereich(box, einzeln);
    if (!einzeln) { karte.setDaten("schiffe", []); hinweis(karte.zoom < 5.2 ? "" : "Zoome etwas näher heran für Namen, Größe und Live-Bewegung."); }
    else hinweis("");
    if (einzeln) schiffeZeichnen();
  } else {
    const m = karte.mitte;
    const r = karte.sichtRadius();
    const kreise = kreiseFuer(m.lat, m.lon, r, 7);
    flug.setKreise(kreise, null);
    if (r > 250 * 1852 * 1.1) hinweis(kreise.length >= 7 && r > 1500000 ? "Flugzeuge werden im Umkreis von etwa 1.500 km um die Bildmitte geladen – drehe den Globus oder zoome hinein." : "");
    else hinweis("");
  }
  if (E.reiter === "liste") listeBald();
}
let hinweisText = "";
function hinweis(t) {
  if (t === hinweisText) return;
  hinweisText = t;
  const el = $("#hinweis-chip");
  el.textContent = t;
  el.hidden = !t;
}

// ------------------------------------------------------------------ Takt (1 s)
let taktZahl = 0;
function takt() {
  taktZahl++;
  if (document.hidden) return;
  if (E.modus === "schiffe") {
    if (!E.schiffUebersicht || live.offen) schiffeZeichnen();
    else if (taktZahl % 60 === 0) karte.kachelnNeu();
    if (taktZahl % 30 === 0) schiffe.aufraeumen();
    if (taktZahl % 90 === 0 && !E.schiffUebersicht) schiffe.laden();
  }
  liveZeichen();
  if (E.wahl) infoboxWerte();
  if (taktZahl % 3 === 0) { kurzZeile(); listeBald(); }
  if (E.reiter === "highlights" && taktZahl % 5 === 0) highlightsZeichnen();
  if (taktZahl % 5 === 0) legendeZahlen();
}
document.addEventListener("visibilitychange", () => {
  schiffe.pause(document.hidden);
  if (!document.hidden && E.modus === "flugzeuge") flug.jetzt();
});

function liveZeichen() {
  const el = $("#live-zeichen");
  const alter = Date.now() - (E.liveZeit || 0);
  el.hidden = !E.liveZeit;
  el.classList.toggle("alt", alter > 30000);
}

// ------------------------------------------------------------------ Schiffe zeichnen
function schiffPosition(s, jetzt) {
  const alter = (jetzt - s.t) / 1000;
  if (schiffFaehrt(s) && alter > 0 && alter < 300) {
    const k = s.cog ?? s.hdg;
    if (k != null) return koppeln(s.lat, s.lon, s.sog * KN, k, Math.min(alter, 240));
  }
  return [s.lon, s.lat];
}
function schiffSichtbar(s) {
  if (E.einst.gruppenAus.includes(s.g)) return false;
  if (E.einst.nurFahrend && !(s.sog > 0.5)) return false;
  if (E.einst.ohneKlein && s.len && s.len < 20) return false;
  return true;
}
function schiffFeature(s, z, jetzt) {
  let [lon, lat] = schiffPosition(s, jetzt);
  const faehrt = schiffFaehrt(s);
  const rot = s.hdg ?? s.cog ?? 0;
  const len = s.len > 0 && s.len < 480 ? s.len : null;
  const mpp0 = mppZoom0(lat);
  const echtPx = len ? len / (mpp0 / 2 ** z) : 0;
  const smin = len ? (len < 15 ? 0.72 : len < 50 ? 0.86 : len < 150 ? 1.04 : len < 250 ? 1.24 : 1.42) : 0.8;
  const zeigerPx = MASS["s-pfeil"].h * smin * zoomFaktorSchiff(z);
  let ic, s0 = 0, sm = smin;
  if (len && echtPx >= zeigerPx * 0.9) {
    const breit = s.beam && s.beam / len > 0.24;
    ic = breit ? "s-rumpf-breit" : "s-rumpf";
    s0 = len / (mpp0 * MASS[ic].h);
    sm = 0.02;
    // Mitte des Rumpfs statt Antennenort
    if (s.tb != null && s.ts != null) {
      const vor = (s.tb - s.ts) / 2, seite = ((s.tsb || 0) - (s.tp || 0)) / 2;
      const dn = vor * Math.cos(rot * RAD) - seite * Math.sin(rot * RAD), de = vor * Math.sin(rot * RAD) + seite * Math.cos(rot * RAD);
      lat += dn / R * DEG; lon += de / (R * Math.cos(lat * RAD)) * DEG;
    }
  } else ic = faehrt ? "s-pfeil" : "s-punkt";
  const alt = jetzt - s.t > (faehrt ? 15 * 60000 : 3 * 86400000) ? 1 : 0;
  return {
    type: "Feature", id: s.mmsi,
    properties: { id: s.mmsi, ic, rot: faehrt || s.hdg != null ? rot : 0, s0, smin: sm, g: s.g || "sonst", sk: -(len || 8), name: s.name || "", alt, nf: s.nav === 14 ? 1 : 0 },
    geometry: { type: "Point", coordinates: [lon, lat] },
  };
}
function sichtBox(rand = 0.25) {
  const b = karte.box();
  const dw = (b.e - b.w) * rand, dh = (b.n - b.s) * rand;
  return { w: b.w - dw, e: b.e + dw, s: b.s - dh, n: b.n + dh };
}
const inBox = (b, lat, lon) => lat >= b.s && lat <= b.n && lon >= b.w && lon <= b.e;
function schiffeZeichnen() {
  if (!karte.bereit || E.modus !== "schiffe") return;
  if (E.schiffUebersicht && !live.offen) return;
  const jetzt = Date.now(), z = karte.zoom, b = sichtBox();
  const fs = [];
  for (const s of schiffe.schiffe.values()) {
    if (s.lat == null || !inBox(b, s.lat, s.lon)) continue;
    if (!schiffSichtbar(s) && !(E.wahl && E.wahl.id === s.mmsi)) continue;
    fs.push(schiffFeature(s, z, jetzt));
  }
  karte.setDaten("schiffe", fs);
  if (E.wahl && E.wahl.art === "schiff") { karte.setWahlZustand("schiffe", E.wahl.id, true); auswahlRing(); }
}

// ------------------------------------------------------------------ Flugzeuge zeichnen
const FORM_MIN = { jet4: 1.0, jet2: 0.82, heck: 0.72, prop2: 0.72, prop4: 0.86, prop1: 0.56, heli: 0.62, segler: 0.62, kampf: 0.66, ballon: 0.5, boden: 0.45 };
function flugGruppe(f, ty) {
  if (f.boden) return "boden";
  if (f.mil || ty.form === "kampf") return "mil";
  if (ty.form === "heli") return "heli";
  if (ty.form === "jet2" || ty.form === "jet4" || ty.form === "heck") return "verkehr";
  return "klein";
}
function flugSichtbar(f, ty) {
  const g = flugGruppe(f, ty);
  if (E.einst.flugAus.includes(g)) return false;
  if (g !== "boden" && E.einst.flugAus.includes("boden") && f.boden) return false;
  return true;
}
function flugPosition(f, jetzt) {
  const alter = (jetzt - f.t) / 1000;
  if (f.gs > (f.boden ? 3 : 30) && f.trk != null && alter > 0 && alter < 60) return koppeln(f.lat, f.lon, f.gs * KN, f.trk, alter);
  return [f.lon, f.lat];
}
function flugFeature(f, z, jetzt) {
  const key = f.typ + "|" + f.kat + "|" + f.desc;
  if (!f._ty || f._tyKey !== key) { f._ty = flugTyp(f.typ, f.kat, f.desc); f._tyKey = key; }
  const ic = "f-" + f._ty.form;
  const [lon, lat] = flugPosition(f, jetzt);
  const s0 = f._ty.spann / (mppZoom0(lat) * MASS[ic].spann);
  const nf = f.notfall || (SQUAWK[f.sq] && SQUAWK[f.sq].notfall) ? 1 : 0;
  return {
    type: "Feature", id: f.hex,
    properties: { id: f.hex, ic, rot: f.trk ?? 0, s0, smin: FORM_MIN[f._ty.form] || 0.7, alt: f.boden ? -1 : f.altM ?? 0, sk: f.boden ? -1000 : (f.altM || 0) / 10, lab: f.cs || f.reg || "", nf, alt0: jetzt - f.t > 45000 ? 1 : 0 },
    geometry: { type: "Point", coordinates: [lon, lat] },
  };
}
function flugZeichnen() {
  if (!karte.bereit || E.modus !== "flugzeuge") return;
  const jetzt = Date.now(), z = karte.zoom;
  const fs = [];
  const b = karte.sichtRadius() > 2500000 ? null : sichtBox(0.3);
  for (const f of flug.flieger.values()) {
    if (b && !inBox(b, f.lat, f.lon)) continue;
    const ty = f._ty || (f._ty = flugTyp(f.typ, f.kat, f.desc));
    if (!flugSichtbar(f, ty) && !(E.wahl && E.wahl.id === f.hex)) continue;
    fs.push(flugFeature(f, z, jetzt));
  }
  karte.setDaten("flug", fs);
  if (E.wahl && E.wahl.art === "flug") { karte.setWahlZustand("flug", E.wahl.id, true); auswahlRing(); }
  E.flugZeichenZeit = performance.now();
}
/** flüssige Bewegung: je näher, desto öfter neu zeichnen */
function flugTakt() {
  const z = karte.bereit ? karte.zoom : 0;
  const pause = z >= 10 ? 120 : z >= 8 ? 200 : z >= 6 ? 400 : 1000;
  setTimeout(() => {
    if (!document.hidden && E.modus === "flugzeuge" && karte.bereit && !live.offen) {
      const beschaeftigt = karte.map.isMoving() && flug.flieger.size > 1500;
      if (!beschaeftigt) flugZeichnen();
    }
    flugTakt();
  }, pause);
}

// ------------------------------------------------------------------ Auswahl
function wahlAusKarte(f) {
  const l = f.layer.id;
  if (l === "schiffe") schiffOeffnen(f.properties.id, false);
  else if (l === "schiffe-uebersicht") {
    const id = Number(f.properties.mmsi);
    if (id) schiffOeffnen(id, true, f.geometry.coordinates);
  } else if (l === "flug") flugOeffnen(f.properties.id, false);
}

async function schiffOeffnen(mmsi, hinfliegen = false, koord = null) {
  if (E.modus !== "schiffe") modusSetzen("schiffe", false);
  let s = schiffe.schiffe.get(mmsi);
  if (hinfliegen && koord) karte.flieg(koord[0], koord[1], Math.max(karte.zoom, 11.5), { dauer: 1800 });
  if (!s) {
    const d = await schiffe.details(mmsi);
    s = schiffe.schiffe.get(mmsi);
    if (!s || !d) { melde("Zu diesem Schiff gibt es gerade keine Daten.", 5); return; }
  }
  if (hinfliegen && !koord) karte.flieg(s.lon, s.lat, Math.max(karte.zoom, 11.5), { dauer: 2200 });
  waehle({ art: "schiff", id: mmsi });
}
async function flugOeffnen(hex, hinfliegen = false) {
  if (E.modus !== "flugzeuge") modusSetzen("flugzeuge", false);
  let f = flug.flieger.get(hex);
  if (!f) f = await flug.einzeln(hex);
  if (!f) { melde("Dieses Flugzeug sendet gerade nicht (oder ist außer Reichweite der Empfänger).", 6); return; }
  if (hinfliegen) karte.flieg(f.lon, f.lat, Math.max(karte.zoom, 8.5), { dauer: 2200 });
  waehle({ art: "flug", id: hex });
}

function objekt(w = E.wahl) {
  if (!w) return null;
  return w.art === "schiff" ? schiffe.schiffe.get(w.id) : flug.flieger.get(w.id);
}

const box = $("#infobox");
function waehle(w) {
  if (E.wahl) karte.setWahlZustand(E.wahl.art === "schiff" ? "schiffe" : "flug", E.wahl.id, false);
  E.wahl = w;
  E.spurAn = true;
  E.verlauf = null;
  E.route = null;
  folgen(false);
  const o = objekt();
  if (!o) return;
  box.innerHTML = w.art === "schiff" ? IB.schiffHtml(o) : IB.flugHtml(o);
  box.hidden = false;
  box.classList.remove("eingeklappt");
  box.scrollTop = 0;
  document.body.classList.add("box-offen");
  karte.setWahlZustand(w.art === "schiff" ? "schiffe" : "flug", w.id, true);
  history.replaceState(null, "", w.art === "schiff" ? `#schiff=${w.id}` : `#flug=${w.id}`);
  infoboxWerte();
  auswahlRing();
  polsterAnpassen();
  // nachladen
  if (w.art === "schiff") schiffNachladen(o);
  else flugNachladen(o);
  spurZeichnen();
  listeBald();
  // ins Bild holen, wenn es verdeckt wäre
  setTimeout(() => {
    if (!E.wahl || E.wahl !== w) return;
    const p = karte.map.project([o.lon, o.lat]);
    const r = box.getBoundingClientRect();
    const verdeckt = PC.matches ? p.x < r.right + 20 : p.y > r.top - 20;
    if (verdeckt || p.x < 0 || p.y < 0 || p.x > innerWidth || p.y > innerHeight) karte.map.easeTo({ center: [o.lon, o.lat], duration: 700 });
  }, 60);
}

async function schiffNachladen(s) {
  const id = s.mmsi;
  const [d] = await Promise.all([schiffe.details(id), haefenLaden()]);
  if (!E.wahl || E.wahl.id !== id) return;
  const ziel = box.querySelector('[data-teil="ziel"]');
  if (ziel) ziel.innerHTML = IB.schiffZielHtml(schiffe.schiffe.get(id) || s);
  const reg = box.querySelector('[data-teil="register"]');
  if (reg) reg.innerHTML = IB.schiffRegisterHtml(d);
  const ais = box.querySelector('[data-teil="ais"]');
  if (ais && d) { /* Daten wurden ergänzt */ }
  const r = d && d.properties && d.properties.particulars;
  if (r && r.image) {
    const foto = await commonsFoto(r.image);
    if (foto && E.wahl && E.wahl.id === id) fotoSetzen(foto);
  }
  spurZeichnen();
  const v = await schiffe.verlauf(id, 24);
  if (E.wahl && E.wahl.id === id) { E.verlauf = v; spurZeichnen(); }
}
async function flugNachladen(f) {
  const hex = f.hex;
  const [info, foto, route] = await Promise.all([flug.info(hex), flug.foto(hex), flug.route(f.cs, f.lat, f.lon)]);
  if (!E.wahl || E.wahl.id !== hex) return;
  const o = flug.flieger.get(hex) || f;
  const ft = box.querySelector('[data-teil="flugzeug"]');
  if (ft) ft.innerHTML = IB.flugzeugTabelle(o, null, info);
  E.route = route;
  const rt = box.querySelector('[data-teil="route"]');
  if (rt) rt.innerHTML = IB.flugRouteHtml(route, o);
  if (foto) fotoSetzen(foto);
  else if (info && info.url_photo) fotoSetzen({ bild: info.url_photo_thumbnail || info.url_photo, seite: info.url_photo, urheber: "airport-data.com" });
  spurZeichnen();
}
function fotoSetzen(foto) {
  const el = box.querySelector('[data-teil="foto"]');
  if (!el) return;
  const html = IB.fotoHtml(foto);
  if (!html) return;
  el.classList.remove("leer");
  el.innerHTML = html;
  polsterAnpassen();
}

let routeZeit = 0;
function infoboxWerte() {
  const o = objekt();
  if (!o || box.hidden) return;
  const v = E.wahl.art === "schiff" ? IB.schiffWerte(o, E.ich) : IB.flugWerte(o, E.ich);
  for (const el of box.querySelectorAll("[data-f]")) {
    const k = el.dataset.f;
    if (!(k in v)) continue;
    if (k === "begegnung") { if (el.innerHTML !== v[k]) el.innerHTML = v[k]; }
    else if (k === "sym") continue;
    else if (el.textContent !== v[k]) el.textContent = v[k];
  }
  const satz = box.querySelector('[data-f="satz"]');
  if (satz) satz.classList.toggle("notfall", !!v._notfall);
  if (E.wahl.art === "flug" && E.route && Date.now() - routeZeit > 5000) {
    routeZeit = Date.now();
    const rt = box.querySelector('[data-teil="route"]');
    if (rt) rt.innerHTML = IB.flugRouteHtml(E.route, o);
  }
  if (E.folgen) {
    const [lon, lat] = E.wahl.art === "schiff" ? schiffPosition(o, Date.now()) : flugPosition(o, Date.now());
    karte.map.easeTo({ center: [lon, lat], duration: 900, easing: (t) => t });
  }
  // Flugzeug verschwunden? Gezielt nachfragen
  if (E.wahl.art === "flug" && Date.now() - o.t > 20000 && taktZahl % 5 === 0) flug.einzeln(o.hex);
  if (E.wahl.art === "flug" && taktZahl % 10 === 0) spurZeichnen();
}

function auswahlRing() {
  const o = objekt();
  if (!o) { karte.setAuswahl(null); return; }
  const [lon, lat] = E.wahl.art === "schiff" ? schiffPosition(o, Date.now()) : flugPosition(o, Date.now());
  karte.setAuswahl([lon, lat], E.wahl.art === "schiff" ? 18 : 22);
}

function infoboxZu() {
  if (E.wahl) karte.setWahlZustand(E.wahl.art === "schiff" ? "schiffe" : "flug", E.wahl.id, false);
  E.wahl = null;
  folgen(false);
  box.hidden = true;
  box.innerHTML = "";
  document.body.classList.remove("box-offen");
  karte.setAuswahl(null);
  karte.setSpur(null);
  history.replaceState(null, "", "#" + E.modus);
  polsterAnpassen();
  listeBald();
}
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !live.offen && E.wahl && !document.querySelector("dialog[open]")) infoboxZu(); });

box.addEventListener("click", async (ev) => {
  const b = ev.target.closest("[data-aktion]");
  if (!b) return;
  const a = b.dataset.aktion;
  if (a === "zu") infoboxZu();
  else if (a === "klappen") { box.classList.toggle("eingeklappt"); polsterAnpassen(); }
  else if (a === "folgen") folgen(!E.folgen);
  else if (a === "spur") { E.spurAn = !E.spurAn; spurZeichnen(); }
  else if (a === "live") liveOeffnen(E.wahl);
  else if (a === "teilen") teilen();
});
function folgen(an) {
  E.folgen = an;
  const b = box.querySelector('[data-aktion="folgen"]');
  if (b) b.setAttribute("aria-pressed", String(an));
  if (an) {
    if (!PC.matches) box.classList.add("eingeklappt");
    polsterAnpassen();
    infoboxWerte();
  }
}
async function teilen() {
  const o = objekt();
  if (!o) return;
  const url = location.href.split("#")[0] + (E.wahl.art === "schiff" ? `#schiff=${E.wahl.id}` : `#flug=${E.wahl.id}`);
  const titel = E.wahl.art === "schiff" ? IB.schiffName(o) : IB.flugName(o);
  try {
    if (navigator.share) { await navigator.share({ title: titel, text: `${titel} – live verfolgen`, url }); return; }
    await navigator.clipboard.writeText(url);
    melde("Link kopiert.", 3);
  } catch { /* abgebrochen */ }
}

/** Kartenmitte in die freie Fläche (neben bzw. über der Infobox) */
function polsterAnpassen() {
  if (!karte.bereit) return;
  requestAnimationFrame(() => {
    const p = { top: 0, bottom: 0, left: 0, right: 0 };
    if (PC.matches) {
      p.right = $("#blatt").offsetWidth + 12;
      if (!box.hidden) p.left = box.getBoundingClientRect().right;
    } else if (!box.hidden) p.bottom = Math.max(0, innerHeight - box.getBoundingClientRect().top);
    karte.setPadding(p);
  });
}
PC.addEventListener("change", polsterAnpassen);
window.addEventListener("resize", () => setTimeout(polsterAnpassen, 60));

// ------------------------------------------------------------------ Spur / Route
function spurZeichnen() {
  const o = objekt();
  if (!o || !E.spurAn) { karte.setSpur(null); setSpurKnopf(); return; }
  const fs = [];
  const jetzt = Date.now();
  if (E.wahl.art === "schiff") {
    const farbe = SCHIFF_GRUPPEN[o.g || "sonst"].farbe;
    let pts = [];
    if (E.verlauf && E.verlauf.geometry && E.verlauf.geometry.type === "LineString") pts = E.verlauf.geometry.coordinates.slice();
    for (const p of o.spur || []) if (!E.verlauf || p[2] > jetzt - 30 * 60000) pts.push([p[0], p[1]]);
    pts.push(schiffPosition(o, jetzt));
    if (pts.length > 1) fs.push({ type: "Feature", properties: { farbe, art: "weg" }, geometry: { type: "LineString", coordinates: pts } });
    if (o.sog > 0.8 && (o.cog ?? o.hdg) != null) {
      const [lo, la] = schiffPosition(o, jetzt);
      const z = zielpunkt(la, lo, o.cog ?? o.hdg, o.sog * KN * 1800);
      fs.push({ type: "Feature", properties: { farbe: "#ffffff", art: "plan" }, geometry: { type: "LineString", coordinates: [[lo, la], z] } });
    }
    const h = hafen(o.ziel);
    if (h && h.lat != null) fs.push({ type: "Feature", properties: { name: h.name }, geometry: { type: "Point", coordinates: [h.lon, h.lat] } });
  } else {
    const pts = (o.spur || []).map((p) => [p[0], p[1]]);
    const jetztPos = flugPosition(o, jetzt);
    pts.push(jetztPos);
    if (pts.length > 1) fs.push({ type: "Feature", properties: { farbe: IB.hoehenFarbeJs(o.altM), art: "weg" }, geometry: { type: "LineString", coordinates: pts } });
    const r = E.route;
    if (r && r.nach && r.nach.lat != null) {
      fs.push({ type: "Feature", properties: { farbe: "#ffffff", art: "plan" }, geometry: { type: "LineString", coordinates: grosskreis(jetztPos[1], jetztPos[0], r.nach.lat, r.nach.lon, 48) } });
      fs.push({ type: "Feature", properties: { name: r.nach.iata || r.nach.icao || r.nach.name }, geometry: { type: "Point", coordinates: [r.nach.lon, r.nach.lat] } });
      if (r.von && r.von.lat != null) {
        const start = pts.length > 1 ? pts[0] : jetztPos;
        fs.push({ type: "Feature", properties: { farbe: "rgba(255,255,255,.45)", art: "plan" }, geometry: { type: "LineString", coordinates: grosskreis(r.von.lat, r.von.lon, start[1], start[0], 32) } });
        fs.push({ type: "Feature", properties: { name: r.von.iata || r.von.icao || r.von.name }, geometry: { type: "Point", coordinates: [r.von.lon, r.von.lat] } });
      }
    }
  }
  karte.setSpur(fs);
  setSpurKnopf();
}
function setSpurKnopf() {
  const b = box.querySelector('[data-aktion="spur"]');
  if (b) b.setAttribute("aria-pressed", String(!!E.spurAn));
}

// ------------------------------------------------------------------ Kurzzeile, Liste, Highlights
function sichtbareObjekte() {
  const b = karte.box();
  const out = [];
  const jetzt = Date.now();
  if (E.modus === "schiffe") {
    for (const s of schiffe.schiffe.values()) if (s.lat != null && inBox(b, s.lat, s.lon) && schiffSichtbar(s)) out.push(s);
  } else {
    for (const f of flug.flieger.values()) { const ty = f._ty || (f._ty = flugTyp(f.typ, f.kat, f.desc)); if (inBox(b, f.lat, f.lon) && flugSichtbar(f, ty) && jetzt - f.t < 90000) out.push(f); }
  }
  return out;
}
function kurzZeile() {
  const el = $("#kurz");
  if (E.modus === "schiffe") {
    if (E.schiffUebersicht) { el.innerHTML = karte.zoom < 5.2 ? "Schiffe weltweit · zoome hinein für Details" : "Zoome näher heran für alle Einzelheiten"; return; }
    const v = sichtbareObjekte();
    const fahrend = v.filter((s) => s.sog > 0.5).length;
    el.innerHTML = `<b>${zahl(v.length)}</b> ${v.length === 1 ? "Schiff" : "Schiffe"} im Bild · ${zahl(fahrend)} ${fahrend === 1 ? "fährt" : "fahren"}${schiffe.stand ? "" : " · lädt …"}`;
  } else {
    const v = sichtbareObjekte();
    const luft = v.filter((f) => !f.boden);
    const hoch = luft.reduce((m, f) => Math.max(m, f.altM || 0), 0);
    el.innerHTML = flug.stand ? `<b>${zahl(luft.length)}</b> ${luft.length === 1 ? "Flugzeug" : "Flugzeuge"} in der Luft${v.length - luft.length ? ` · ${v.length - luft.length} am Boden` : ""}${hoch ? ` · höchstes ${hoehe(hoch)}` : ""}` : "Flugdaten werden geladen …";
  }
}

let listeTimer = 0, listeBeruehrt = false;
function listeBald() { clearTimeout(listeTimer); listeTimer = setTimeout(listeZeichnen, 120); }
$("#liste").addEventListener("pointerdown", () => { listeBeruehrt = true; });
window.addEventListener("pointerup", () => setTimeout(() => (listeBeruehrt = false), 400));
function bezugspunkt() { return E.ich || karte.mitte; }
function listeZeichnen() {
  if (E.reiter !== "liste" || listeBeruehrt) return;
  if (!PC.matches && $("#blatt").dataset.hoehe === "klein") return;
  const q = $("#suche").value.trim().toLowerCase();
  const ref = bezugspunkt();
  let v = sichtbareObjekte();
  if (E.modus === "schiffe" && E.schiffUebersicht && !q) {
    $("#liste-hinweis").textContent = "Zoome auf ein Gebiet (z. B. eine Küste), dann siehst du hier alle Schiffe dort.";
    $("#liste").innerHTML = "";
    return;
  }
  if (q) {
    const alle = E.modus === "schiffe" ? [...schiffe.schiffe.values()] : [...flug.flieger.values()];
    v = alle.filter((o) => (E.modus === "schiffe"
      ? [o.name, String(o.mmsi), o.ruf, o.ziel, o.imo && String(o.imo), schiffArt(o.typ, o.kind)]
      : [o.cs, o.reg, o.hex, o.typ, o._ty && o._ty.name, airline(o.cs) && airline(o.cs).name]).some((t) => t && String(t).toLowerCase().includes(q)));
  }
  const d = (o) => entfernung(ref.lat, ref.lon, o.lat, o.lon);
  for (const o of v) o._d = d(o);
  const sortierer = {
    nah: (a, b) => a._d - b._d,
    gross: E.modus === "schiffe" ? (a, b) => (b.len || 0) - (a.len || 0) : (a, b) => ((b._ty && b._ty.spann) || 0) - ((a._ty && a._ty.spann) || 0),
    schnell: E.modus === "schiffe" ? (a, b) => (b.sog || 0) - (a.sog || 0) : (a, b) => (b.gs || 0) - (a.gs || 0),
    hoch: (a, b) => (b.altM || -2) - (a.altM || -2),
  }[E.sort] || ((a, b) => a._d - b._d);
  v.sort(sortierer);
  const n = v.length;
  v = v.slice(0, 120);
  const hinweisEl = $("#liste-hinweis");
  hinweisEl.innerHTML = q
    ? `${zahl(n)} Treffer${n > 120 ? " (die ersten 120)" : ""}. <button class="link-knopf" id="weltweit">Weltweit suchen</button>`
    : `${zahl(n)} im Bild, ${E.ich ? "nach Entfernung von dir" : "nach Entfernung von der Bildmitte"}${n > 120 ? " – die ersten 120" : ""}.`;
  const ww = $("#weltweit");
  if (ww) ww.onclick = () => weltweitSuchen(q);
  const gewaehlt = E.wahl ? E.wahl.id : null;
  $("#liste").innerHTML = v.length ? v.map((o) => E.modus === "schiffe" ? schiffZeile(o, gewaehlt) : flugZeile(o, gewaehlt)).join("") : `<li class="leer">${q ? "Nichts gefunden." : "Gerade nichts im Bild."}</li>`;
}
function schiffZeile(s, gew) {
  const g = SCHIFF_GRUPPEN[s.g || "sonst"];
  const faehrt = s.sog > 0.5;
  const unter = [schiffArt(s.typ, s.kind), faehrt ? tempo(s.sog, true) : "liegt", s.ziel ? "→ " + s.ziel : ""].filter(Boolean).join(" · ");
  const nf = s.nav === 14 ? '<span class="etikett rot">Notsignal</span>' : "";
  return `<li data-art="schiff" data-id="${s.mmsi}" class="${gew === s.mmsi ? "gewaehlt" : ""}"><img alt="" src="${vorschau(faehrt ? "s-pfeil" : "s-punkt", g.farbe, 30, faehrt ? s.cog || 0 : 0)}"><span class="name">${s.flagge ? flagge(s.flagge) + " " : ""}${esc(IB.schiffName(s))}${nf}</span><span class="unter">${esc(unter)}</span><span class="wert"><b>${s.len ? zahl(s.len) + " m" : "–"}</b>${weite(s._d)}</span></li>`;
}
function flugZeile(f, gew) {
  const ty = f._ty || flugTyp(f.typ, f.kat, f.desc);
  const al = airline(f.cs);
  const sq = SQUAWK[f.sq];
  const nf = f.notfall || (sq && sq.notfall) ? `<span class="etikett rot">${esc(f.sq || "Notfall")}</span>` : f.mil ? '<span class="etikett">Militär</span>' : "";
  const unter = [al ? al.name : null, ty.name].filter(Boolean).join(" · ");
  return `<li data-art="flug" data-id="${f.hex}" class="${gew === f.hex ? "gewaehlt" : ""}"><img alt="" src="${vorschau("f-" + ty.form, IB.hoehenFarbeJs(f.altM), 30, f.trk || 0)}"><span class="name">${esc(IB.flugName(f))}${nf}</span><span class="unter">${esc(unter)}</span><span class="wert"><b>${f.boden ? "Boden" : hoehe(f.altM, f.altFt)}</b>${weite(f._d)}</span></li>`;
}
$("#liste").addEventListener("click", (ev) => {
  const li = ev.target.closest("li[data-id]");
  if (!li) return;
  if (li.dataset.art === "schiff") schiffOeffnen(Number(li.dataset.id), true);
  else flugOeffnen(li.dataset.id, true);
  if (!PC.matches) blattHoehe("klein");
});
$("#suche").addEventListener("input", () => listeBald());
$("#suche").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); const li = $("#liste li[data-id]"); if (li) li.click(); else weltweitSuchen($("#suche").value.trim()); } });
for (const b of $$(".sortierung button")) b.onclick = () => { E.sort = b.dataset.sort; for (const x of $$(".sortierung button")) x.setAttribute("aria-pressed", String(x === b)); listeZeichnen(); };

async function weltweitSuchen(q) {
  if (!q || q.length < 2) return;
  const ref = bezugspunkt();
  if (E.modus === "schiffe") {
    const fs = await schiffe.suche(q, ref.lat, ref.lon);
    if (!fs.length) { melde(`Kein Schiff „${q}“ gefunden.`, 4); return; }
    const f = fs[0];
    schiffOeffnen(f.properties.mmsi || f.id, true, f.geometry && f.geometry.coordinates);
    if (fs.length > 1) melde(`${fs.length} Treffer – zeige ${f.properties.name || f.id}.`, 4);
  } else {
    const roh = q.toUpperCase().replace(/\s+/g, "");
    const wege = /^[0-9A-F]{6}$/.test(roh) ? [`hex/${roh}`] : /-/.test(roh) ? [`reg/${roh}`] : [`callsign/${roh}`, `reg/${roh}`, `type/${roh}`];
    for (const w of wege) {
      try {
        const r = await fetch(`${E.einst.relay}/adsb/v2/${w}`);
        if (!r.ok) continue;
        const j = await r.json();
        if (j.ac && j.ac.length) {
          flug._uebernehmen(j);
          const a = j.ac[0];
          flugOeffnen(a.hex, true);
          if (j.ac.length > 1) melde(`${j.ac.length} Flugzeuge gefunden – zeige ${(a.flight || a.r || a.hex).trim()}.`, 4);
          return;
        }
      } catch { /* weiter */ }
    }
    melde(`Kein Flugzeug „${q}“ in der Luft gefunden.`, 4);
  }
}

function highlightsZeichnen() {
  const el = $("#highlights");
  const v = sichtbareObjekte();
  const ref = bezugspunkt();
  const karteHl = (titel, o, text, extra = "") => o ? `<button class="hl-karte ${extra}" data-art="${E.modus === "schiffe" ? "schiff" : "flug"}" data-id="${E.modus === "schiffe" ? o.mmsi : o.hex}"><small>${esc(titel)}</small><b>${esc(E.modus === "schiffe" ? IB.schiffName(o) : IB.flugName(o))}</b><span>${esc(text)}</span></button>` : "";
  const max = (arr, f) => arr.reduce((m, o) => (f(o) > (m ? f(m) : -Infinity) ? o : m), null);
  const min = (arr, f) => arr.reduce((m, o) => (f(o) < (m ? f(m) : Infinity) ? o : m), null);
  let html = "";
  if (!v.length) { el.innerHTML = `<p class="leer">Gerade nichts im Bild${E.modus === "schiffe" && E.schiffUebersicht ? " – zoome auf ein Gebiet" : ""}.</p>`; return; }
  if (E.modus === "schiffe") {
    const nf = v.filter((s) => s.nav === 14);
    for (const s of nf) html += karteHl("Notsignal!", s, "AIS-Notsender aktiv", "notfall hl-gross");
    const gross = max(v.filter((s) => s.len), (s) => s.len);
    const schnell = max(v.filter((s) => s.sog > 0.5), (s) => s.sog);
    const nah = min(v, (s) => entfernung(ref.lat, ref.lon, s.lat, s.lon));
    const tief = max(v.filter((s) => s.tief), (s) => s.tief);
    const pass = max(v.filter((s) => s.g === "passagier" && s.len), (s) => s.len);
    const tanker = max(v.filter((s) => s.g === "tanker" && s.len), (s) => s.len);
    html += karteHl("Größtes Schiff", gross, gross ? `${zahl(gross.len)} m · ${schiffArt(gross.typ)}` : "");
    html += karteHl("Schnellstes", schnell, schnell ? tempo(schnell.sog) : "");
    html += karteHl(E.ich ? "Am nächsten bei dir" : "Nahe der Bildmitte", nah, nah ? weite(entfernung(ref.lat, ref.lon, nah.lat, nah.lon)) : "");
    html += karteHl("Größter Tiefgang", tief, tief ? `${zahl(tief.tief, 1)} m unter Wasser` : "");
    if (pass && pass !== gross) html += karteHl("Größtes Passagierschiff", pass, `${zahl(pass.len)} m`);
    if (tanker && tanker !== gross) html += karteHl("Größter Tanker", tanker, `${zahl(tanker.len)} m`);
    // Statistik nach Art
    const z = {};
    for (const s of v) z[s.g] = (z[s.g] || 0) + 1;
    const mx = Math.max(...Object.values(z));
    html += `<div class="statistik"><small class="abschnitt" style="margin:0 0 4px">Im Bild nach Art</small>${SCHIFF_GRUPPEN_LISTE.filter((g) => z[g]).sort((a, b) => z[b] - z[a]).map((g) => `<div class="balken"><span>${esc(SCHIFF_GRUPPEN[g].kurz)}</span><i style="width:${(z[g] / mx * 100).toFixed(0)}%;background:${SCHIFF_GRUPPEN[g].farbe}"></i><span>${z[g]}</span></div>`).join("")}</div>`;
  } else {
    const luft = v.filter((f) => !f.boden);
    const nf = v.filter((f) => f.notfall || (SQUAWK[f.sq] && SQUAWK[f.sq].notfall));
    for (const f of nf) html += karteHl("Notfall!", f, (SQUAWK[f.sq] && SQUAWK[f.sq].text) || f.notfall, "notfall hl-gross");
    const hoch = max(luft, (f) => f.altM || 0);
    const schnell = max(luft, (f) => f.gs || 0);
    const gross = max(luft, (f) => (f._ty && f._ty.spann) || 0);
    const nah = min(luft, (f) => entfernung(ref.lat, ref.lon, f.lat, f.lon));
    const steig = max(luft, (f) => f.vr || 0);
    const kalt = min(luft.filter((f) => f.roh && f.roh.oat != null), (f) => f.roh.oat);
    const mil = luft.filter((f) => f.mil);
    html += karteHl("Am höchsten", hoch, hoch ? hoehe(hoch.altM, hoch.altFt) : "");
    html += karteHl("Am schnellsten", schnell, schnell ? `${zahl(schnell.gs * 1.852)} km/h über Grund` : "");
    html += karteHl("Größtes Flugzeug", gross, gross ? gross._ty.name : "");
    html += karteHl(E.ich ? "Am nächsten bei dir" : "Nahe der Bildmitte", nah, nah ? `${weite(entfernung(ref.lat, ref.lon, nah.lat, nah.lon))} · ${hoehe(nah.altM, nah.altFt)}` : "");
    if (steig && steig.vr > 500) html += karteHl("Steigt am stärksten", steig, `${zahl(steig.vr * 0.00508, 1)} m/s`);
    if (kalt) html += karteHl("Kälteste Luft draußen", kalt, `${zahl(kalt.roh.oat)} °C in ${hoehe(kalt.altM, kalt.altFt)}`);
    if (mil.length) html += karteHl(`Militär (${mil.length})`, mil[0], mil[0]._ty.name);
    // Statistik nach Höhe
    const stufen = [[-1, 0, "am Boden"], [0, 3000, "unter 3 km"], [3000, 7000, "3–7 km"], [7000, 10000, "7–10 km"], [10000, 99999, "über 10 km"]];
    const z = stufen.map(([a, b]) => v.filter((f) => (f.boden ? -0.5 : f.altM || 0) >= a && (f.boden ? -0.5 : f.altM || 0) < b).length);
    const mx = Math.max(1, ...z);
    html += `<div class="statistik"><small class="abschnitt" style="margin:0 0 4px">Im Bild nach Höhe</small>${stufen.map(([a, , t], i) => `<div class="balken"><span>${t}</span><i style="width:${(z[i] / mx * 100).toFixed(0)}%;background:${a < 0 ? BODEN_FARBE : IB.hoehenFarbeJs(a + 500)}"></i><span>${z[i]}</span></div>`).join("")}</div>`;
  }
  el.innerHTML = html;
}
$("#highlights").addEventListener("click", (ev) => {
  const b = ev.target.closest("[data-id]");
  if (!b) return;
  if (b.dataset.art === "schiff") schiffOeffnen(Number(b.dataset.id), true);
  else flugOeffnen(b.dataset.id, true);
  if (!PC.matches) blattHoehe("klein");
});

// ------------------------------------------------------------------ Legende und Filter
const FLUG_GRUPPEN = { verkehr: "Verkehrsflugzeuge", klein: "Propeller & Kleinflugzeuge", heli: "Hubschrauber", mil: "Militär", boden: "Am Boden" };
function legendeZeichnen() {
  const el = $("#legende");
  if (E.modus === "schiffe") {
    el.innerHTML = SCHIFF_GRUPPEN_LISTE.map((g) => `<button class="leg-chip" data-gruppe="${g}" aria-pressed="${!E.einst.gruppenAus.includes(g)}"><i class="punkt" style="background:${SCHIFF_GRUPPEN[g].farbe}"></i><span>${esc(SCHIFF_GRUPPEN[g].kurz)}</span><small data-zahl="${g}"></small></button>`).join("");
  } else {
    const verlauf = HOEHEN_FARBEN.map(([h, f]) => `${f} ${(h / 12500 * 100).toFixed(0)}%`).join(",");
    el.innerHTML = `<span class="leg-skala"><span>0</span><i style="background:linear-gradient(90deg,${verlauf})"></i><span>${einheiten.hoehe === "ft" ? "41.000 ft" : "12,5 km"}</span></span>` +
      Object.entries(FLUG_GRUPPEN).map(([g, t]) => `<button class="leg-chip" data-fgruppe="${g}" aria-pressed="${!E.einst.flugAus.includes(g)}"><span>${esc(t.replace("Propeller & Kleinflugzeuge", "Klein"))}</span><small data-zahl="${g}"></small></button>`).join("");
  }
  legendeZahlen();
}
function legendeZahlen() {
  const z = {};
  if (E.modus === "schiffe") {
    if (E.schiffUebersicht) { for (const el of $$("#legende [data-zahl]")) el.textContent = ""; return; }
    const b = karte.box();
    for (const s of schiffe.schiffe.values()) if (s.lat != null && inBox(b, s.lat, s.lon)) z[s.g] = (z[s.g] || 0) + 1;
  } else {
    const b = karte.box();
    for (const f of flug.flieger.values()) if (inBox(b, f.lat, f.lon)) { const g = flugGruppe(f, f._ty || flugTyp(f.typ, f.kat, f.desc)); z[g] = (z[g] || 0) + 1; }
  }
  for (const el of $$("#legende [data-zahl]")) el.textContent = z[el.dataset.zahl] ? zahl(z[el.dataset.zahl]) : "";
}
$("#legende").addEventListener("click", (ev) => {
  const b = ev.target.closest("button");
  if (!b) return;
  if (b.dataset.gruppe) umschalten(E.einst.gruppenAus, b.dataset.gruppe);
  if (b.dataset.fgruppe) umschalten(E.einst.flugAus, b.dataset.fgruppe);
  sichern(); filterAnwenden(); legendeZeichnen(); filterZeichnen();
});
function umschalten(liste, k) { const i = liste.indexOf(k); if (i >= 0) liste.splice(i, 1); else liste.push(k); }
function filterAnwenden() {
  if (!karte.bereit) return;
  const an = SCHIFF_GRUPPEN_LISTE.filter((g) => !E.einst.gruppenAus.includes(g));
  karte.setSchiffFilter(an.length === SCHIFF_GRUPPEN_LISTE.length ? null : an);
  schiffeZeichnen();
  flugZeichnen();
  listeBald();
}
function filterZeichnen() {
  const el = $("#filter-inhalt");
  if (E.modus === "schiffe") {
    el.innerHTML = `<div class="filter-gruppe"><h3>Welche Schiffe?</h3>${SCHIFF_GRUPPEN_LISTE.map((g) => `<div class="filter-zeile"><img alt="" src="${vorschau("s-pfeil", SCHIFF_GRUPPEN[g].farbe, 24, 45)}"><span>${esc(SCHIFF_GRUPPEN[g].name)}</span><label class="schalter"><input type="checkbox" data-gruppe="${g}" ${E.einst.gruppenAus.includes(g) ? "" : "checked"}><span></span></label></div>`).join("")}</div>
      <div class="filter-gruppe"><h3>Außerdem</h3>
      <div class="filter-zeile"><span>Nur fahrende Schiffe</span><label class="schalter"><input type="checkbox" data-opt="nurFahrend" ${E.einst.nurFahrend ? "checked" : ""}><span></span></label></div>
      <div class="filter-zeile"><span>Kleine Boote unter 20 m ausblenden</span><label class="schalter"><input type="checkbox" data-opt="ohneKlein" ${E.einst.ohneKlein ? "checked" : ""}><span></span></label></div></div>
      <p class="hinweis-klein">Tipp: Die Farbpunkte unten links auf der Karte schalten die Arten auch direkt um.</p>`;
  } else {
    el.innerHTML = `<div class="filter-gruppe"><h3>Welche Flugzeuge?</h3>${Object.entries(FLUG_GRUPPEN).map(([g, t]) => `<div class="filter-zeile"><img alt="" src="${vorschau({ verkehr: "f-jet2", klein: "f-prop1", heli: "f-heli", mil: "f-kampf", boden: "f-jet2" }[g], g === "boden" ? BODEN_FARBE : "#8fb8ff", 24, 0)}"><span>${esc(t)}</span><label class="schalter"><input type="checkbox" data-fgruppe="${g}" ${E.einst.flugAus.includes(g) ? "" : "checked"}><span></span></label></div>`).join("")}</div>
      <p class="hinweis-klein">Die Farbe zeigt die Flughöhe: orange = tief, grün = mittel, blau und lila = Reiseflughöhe, grau = am Boden.</p>`;
  }
}
$("#filter-inhalt").addEventListener("change", (ev) => {
  const i = ev.target;
  if (i.dataset.gruppe) umschalten(E.einst.gruppenAus, i.dataset.gruppe);
  if (i.dataset.fgruppe) umschalten(E.einst.flugAus, i.dataset.fgruppe);
  if (i.dataset.opt) E.einst[i.dataset.opt] = i.checked;
  sichern(); filterAnwenden(); legendeZeichnen();
});

// ------------------------------------------------------------------ Blatt (unten) bzw. Leiste (rechts)
const blatt = $("#blatt");
document.body.dataset.blatt = blatt.dataset.hoehe;
function blattHoehe(h) {
  if (PC.matches) return;
  blatt.dataset.hoehe = h;
  document.body.dataset.blatt = h;
  if (h !== "klein") { listeZeichnen(); if (E.reiter === "highlights") highlightsZeichnen(); }
}
(function blattZiehen() {
  const kopf = $("#blatt-kopf");
  let z = null;
  kopf.addEventListener("pointerdown", (e) => {
    if (PC.matches) return;
    z = { y: e.clientY, t: performance.now(), top: blatt.getBoundingClientRect().top, id: e.pointerId, bewegt: false, ziel: e.target };
  });
  kopf.addEventListener("pointermove", (e) => {
    if (!z || e.pointerId !== z.id) return;
    const dy = e.clientY - z.y;
    if (!z.bewegt && Math.abs(dy) < 6) return;
    if (!z.bewegt) { z.bewegt = true; blatt.classList.add("zieht"); try { kopf.setPointerCapture(e.pointerId); } catch { /* egal */ } }
    const top = Math.max(60, Math.min(window.innerHeight - 90, z.top + dy));
    blatt.style.transform = `translateY(${top - (window.innerHeight - blatt.offsetHeight)}px)`;
  });
  const ende = (e) => {
    if (!z || e.pointerId !== z.id) return;
    const war = z; z = null;
    blatt.classList.remove("zieht");
    if (!war.bewegt) {
      if (war.ziel.closest("button")) return;
      blattHoehe(blatt.dataset.hoehe === "klein" ? "halb" : "klein");
      return;
    }
    const top = blatt.getBoundingClientRect().top;
    const v = (e.clientY - war.y) / Math.max(1, performance.now() - war.t);
    blatt.style.transform = "";
    const anteil = (window.innerHeight - top) / window.innerHeight;
    let h;
    if (v > 0.6) h = blatt.dataset.hoehe === "gross" ? "halb" : "klein";
    else if (v < -0.6) h = blatt.dataset.hoehe === "klein" ? "halb" : "gross";
    else h = anteil < 0.3 ? "klein" : anteil < 0.7 ? "halb" : "gross";
    blattHoehe(h);
  };
  kopf.addEventListener("pointerup", ende);
  kopf.addEventListener("pointercancel", ende);
})();
function zeigeReiter(r) {
  E.reiter = r;
  for (const b of $$(".reiter button")) b.setAttribute("aria-selected", String(b.dataset.reiter === r));
  for (const s of $$(".seite")) s.hidden = s.id !== "seite-" + r;
  if (blatt.dataset.hoehe === "klein") blattHoehe("halb");
  $("#blatt-inhalt").scrollTop = 0;
  if (r === "liste") listeZeichnen();
  if (r === "highlights") highlightsZeichnen();
  if (r === "filter") filterZeichnen();
}
for (const b of $$(".reiter button")) b.onclick = () => zeigeReiter(b.dataset.reiter);

// ------------------------------------------------------------------ Kartenknöpfe
$("#knopf-ebenen").onclick = () => {
  const m = $("#ebenen-menue");
  m.hidden = !m.hidden;
  $("#knopf-ebenen").setAttribute("aria-expanded", String(!m.hidden));
  for (const b of $$("#ebenen-menue [data-grund]")) b.setAttribute("aria-pressed", String(b.dataset.grund === E.einst.grund));
  $("#schalter-seezeichen").checked = E.einst.seezeichen;
  $("#schalter-nacht").checked = E.einst.nacht;
};
for (const b of $$("#ebenen-menue [data-grund]")) b.onclick = () => {
  E.einst.grund = b.dataset.grund; sichern(); karte.setGrund(E.einst.grund);
  for (const x of $$("#ebenen-menue [data-grund]")) x.setAttribute("aria-pressed", String(x === b));
};
$("#schalter-seezeichen").onchange = (e) => { E.einst.seezeichen = e.target.checked; sichern(); karte.setSeezeichen(E.einst.seezeichen); };
$("#schalter-nacht").onchange = (e) => {
  E.einst.nacht = e.target.checked; sichern();
  for (const i of [0, 1, 2]) karte.map.setLayoutProperty("nacht-" + i, "visibility", E.einst.nacht ? "visible" : "none");
};
$("#knopf-3d").onclick = () => {
  const schraeg = karte.map.getPitch() > 10;
  karte.map.easeTo({ pitch: schraeg ? 0 : 60, duration: 900 });
  $("#knopf-3d").setAttribute("aria-pressed", String(!schraeg));
};
$("#knopf-norden").onclick = () => karte.map.easeTo({ bearing: 0, pitch: 0, duration: 700 });
function nordKnopf() {
  const b = karte.map.getBearing(), p = karte.map.getPitch();
  $("#knopf-norden").hidden = Math.abs(b) < 1 && p < 1;
  $("#knopf-norden svg").style.transform = `rotate(${-b}deg)`;
  $("#knopf-3d").setAttribute("aria-pressed", String(p > 10));
}

// ------------------------------------------------------------------ Dialoge
$("#knopf-hilfe").onclick = () => $("#dlg-hilfe").showModal();
$("#knopf-einstellungen").onclick = () => {
  $("#e-tempo").value = E.einst.tempo;
  $("#e-hoehe").value = E.einst.hoehe;
  $("#e-auge").value = String(E.einst.auge);
  $("#e-beschriftung").value = E.einst.beschriftung;
  $("#e-relay").value = E.einst.relay;
  $("#dlg-einstellungen").showModal();
};
$("#dlg-einstellungen").addEventListener("close", () => {
  E.einst.tempo = $("#e-tempo").value; einheiten.tempo = E.einst.tempo;
  E.einst.hoehe = $("#e-hoehe").value; einheiten.hoehe = E.einst.hoehe;
  E.einst.auge = Number($("#e-auge").value) || 1.7;
  E.einst.beschriftung = $("#e-beschriftung").value;
  const r = $("#e-relay").value.trim().replace(/\/+$/, "");
  if (/^https:\/\/[\w.-]+(:\d+)?$/.test(r)) { E.einst.relay = r; flug.relay = r; }
  sichern();
  legendeZeichnen();
  if (E.wahl) waehle(E.wahl);
});
for (const d of $$("dialog")) d.addEventListener("click", (e) => { if (e.target === d) d.close(); });

// ------------------------------------------------------------------ Live-Blick
const live = new LiveBlick({
  modus: () => E.modus,
  beobachter: () => E.ich,
  augenhoehe: () => E.einst.auge,
  beschriftung: () => E.einst.beschriftung,
  missweisung: (lat, lon) => missweisung(lat, lon),
  melde: (t) => melde(t, 6),
  objekte: liveObjekte,
  infoHtml: liveInfo,
  wechsleModus: () => modusSetzen(E.modus === "schiffe" ? "flugzeuge" : "schiffe", false),
  zeigeAufKarte: (o) => { if (o.art === "schiff") schiffOeffnen(o.id, true); else flugOeffnen(o.id, true); },
  bereichGeaendert: () => liveBereich(),
  onAuf: () => { liveBereich(); },
  onZu: () => { flug.setKreise(flug.kreise, null); bereichAktualisieren(); },
});
function liveObjekte(art, ich, weiteM) {
  const out = [];
  const jetzt = Date.now();
  if (art === "schiffe") {
    for (const s of schiffe.schiffe.values()) {
      if (s.lat == null || Math.abs(s.lat - ich.lat) > weiteM / 111000 + 0.05) continue;
      if (!schiffSichtbar(s)) continue;
      const [lon, lat] = schiffPosition(s, jetzt);
      if (entfernung(ich.lat, ich.lon, lat, lon) > weiteM) continue;
      const hoeheM = s.len ? Math.max(3, Math.min(55, s.len * 0.14)) : 5;
      const faehrt = s.sog > 0.5;
      out.push({
        id: s.mmsi, art: "schiff", lat, lon, h: hoeheM * 0.6, hoehe: hoeheM, name: IB.schiffName(s), farbe: SCHIFF_GRUPPEN[s.g || "sonst"].farbe,
        symbol: faehrt ? "s-pfeil" : "s-punkt", notfall: s.nav === 14, v: faehrt ? s.sog * KN : 0, kurs: s.cog ?? s.hdg, kurzinfo: faehrt ? tempo(s.sog, true) : (s.len ? `${zahl(s.len)} m` : ""), wichtig: (s.len || 0) / 10,
      });
    }
  } else {
    for (const f of flug.flieger.values()) {
      if (jetzt - f.t > 90000) continue;
      const ty = f._ty || (f._ty = flugTyp(f.typ, f.kat, f.desc));
      if (!flugSichtbar(f, ty)) continue;
      const [lon, lat] = flugPosition(f, jetzt);
      if (entfernung(ich.lat, ich.lon, lat, lon) > weiteM) continue;
      const h = f.boden ? 2 : f.altGeoFt != null ? f.altGeoFt * 0.3048 : (f.altM || 0);
      out.push({
        id: f.hex, art: "flug", lat, lon, h, name: IB.flugName(f), farbe: IB.hoehenFarbeJs(f.altM), symbol: "f-" + ty.form,
        v: (f.gs || 0) * KN, kurs: f.trk, notfall: !!(f.notfall || (SQUAWK[f.sq] && SQUAWK[f.sq].notfall)), kurzinfo: f.boden ? "am Boden" : hoehe(f.altM, f.altFt), wichtig: ty.spann / 5 + (f.notfall ? 200 : 0),
      });
    }
  }
  return out;
}
function liveInfo(o) {
  if (o.art === "schiff") {
    const s = schiffe.schiffe.get(o.id);
    if (!s) return `<h3>${esc(o.name)}</h3>`;
    const v = IB.schiffWerte(s, E.ich);
    return `<h3>${s.flagge ? flagge(s.flagge) + " " : ""}${esc(IB.schiffName(s))}</h3><p>${esc(schiffArt(s.typ, s.kind))}${s.len ? ` · ${zahl(s.len)} m lang` : ""}${s.ziel ? ` · Ziel ${esc(s.ziel)}` : ""}</p>
      <div class="ib-zahlen"><div class="ib-zahl"><small>Entfernung</small><b>${weite(o._d)}</b><span>${richtungKurz(o._az || 0)}</span></div><div class="ib-zahl"><small>Tempo</small><b>${v.tempo}</b><span>${v.tempo2}</span></div><div class="ib-zahl"><small>Kurs</small><b>${v.kurs}</b><span>${v.kurs2}</span></div><div class="ib-zahl"><small>Sicht</small><b>${o._hinter ? "Horizont" : "frei"}</b><span>${o._hinter ? "evtl. dahinter" : ""}</span></div></div>
      <p>${esc(v.satz)}</p>`;
  }
  const f = flug.flieger.get(o.id);
  if (!f) return `<h3>${esc(o.name)}</h3>`;
  const v = IB.flugWerte(f, E.ich);
  const al = airline(f.cs);
  const ty = f._ty || flugTyp(f.typ, f.kat, f.desc);
  return `<h3>${esc(IB.flugName(f))}${al ? ` <small style="color:var(--leise);font-weight:500">${esc(al.name)}</small>` : ""}</h3><p>${esc(ty.name)}${f.reg ? " · " + esc(f.reg) : ""}</p>
    <div class="ib-zahlen"><div class="ib-zahl"><small>Höhe</small><b>${v.hoehe}</b><span>${v.hoehe2}</span></div><div class="ib-zahl"><small>Entfernung</small><b>${weite(o._d)}</b><span>Luftlinie am Boden</span></div><div class="ib-zahl"><small>Tempo</small><b>${v.tempo}</b><span>${v.tempo2}</span></div><div class="ib-zahl"><small>Blick</small><b>${zahl(o._el || 0)}°</b><span>über dem Horizont</span></div></div>
    <p>${esc(v.satz)}</p>`;
}
function liveBereich() {
  if (!live.offen || !E.ich) return;
  const km = live.reichweiteKm();
  if (E.modus === "schiffe") {
    const dLat = km / 111, dLon = km / (111 * Math.cos(E.ich.lat * RAD));
    schiffe.setBereich({ w: E.ich.lon - dLon, e: E.ich.lon + dLon, s: E.ich.lat - dLat, n: E.ich.lat + dLat }, true);
    schiffe.laden();
  } else {
    flug.setKreise([], { lat: Math.round(E.ich.lat * 50) / 50, lon: Math.round(E.ich.lon * 50) / 50, nm: Math.max(20, Math.min(250, Math.ceil(km / 1.852 / 10) * 10)) });
    flug.start();
  }
}
async function liveOeffnen(ziel) {
  if (!E.ich) { melde("Für den Live-Blick brauche ich deinen Standort. Bitte Standortfreigabe erlauben.", 7); standortStarten(); return; }
  await live.erlaubnis();
  let z = null;
  if (ziel) { const o = objekt(ziel); if (o) z = { id: ziel.id, art: ziel.art, name: ziel.art === "schiff" ? IB.schiffName(o) : IB.flugName(o) }; }
  live.oeffnen(z);
}
$("#knopf-live").onclick = () => liveOeffnen(null);
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && live.offen) live.schliessen(); });

// ------------------------------------------------------------------ Start
start();

// Testzugang
window.__sf = { E, karte, schiffe, flug, live, waehle, schiffOeffnen, flugOeffnen, modusSetzen, bereichAktualisieren, zeigeReiter, blattHoehe, liveObjekte, schiffeZeichnen, flugZeichnen };
