// Inhalte der Infobox: Schiff oder Flugzeug – fester Teil (einmal gebaut) und Live-Werte (jede Sekunde)
import { esc, zahl, tempo, hoehe, weite, richtungKurz, richtungNach, seit, uhr, tag, relativ } from "./ui.js";
import { schiffArt, fahrtStatus, faehrt as schiffFaehrt, land, flagge, groessenVergleich, SCHIFF_GRUPPEN, flugTyp, airline, TYP_WISSEN, KATEGORIE_TEXT, SQUAWK, EMERGENCY, HOEHEN_FARBEN, BODEN_FARBE } from "./texte.js";
import { entfernung, richtung, naechsteAnnaeherung, KN } from "./geo.js";
import { vorschau } from "./symbole.js";
import { ortName } from "./orte.js";
import { hafen } from "./schiffe.js";
import { fortschritt } from "./flugzeuge.js";

const zeile = (k, v) => (v == null || v === "" ? "" : `<tr><td>${esc(k)}</td><td>${v}</td></tr>`);
const knopf = (aktion, icon, text, gedrueckt) => `<button class="knopf-gross" data-aktion="${aktion}"${gedrueckt != null ? ` aria-pressed="${gedrueckt}"` : ""}><svg><use href="#i-${icon}"/></svg>${text}</button>`;
const kopfKnoepfe = `<div class="kopf-knopfe"><button class="rund klein knopf-klappen" data-aktion="klappen" title="Ein-/ausklappen" aria-label="Ein- oder ausklappen"><svg><use href="#i-klappen"/></svg></button><button class="rund klein" data-aktion="zu" title="Schließen" aria-label="Schließen"><svg><use href="#i-zu"/></svg></button></div>`;

export function hoehenFarbeJs(m) {
  if (m == null) return "#9aa5ba";
  if (m < 0) return BODEN_FARBE;
  let f = HOEHEN_FARBEN[0][1];
  for (const [h, c] of HOEHEN_FARBEN) if (m >= h) f = c;
  return f;
}

/** „über der Ostsee“ / „über Deutschland“ */
export function ueber(lat, lon, art = "über") {
  const o = ortName(lat, lon);
  return o ? `${art} ${o}` : "";
}

// ================================================================== Schiffe
export function schiffSymbol(s) {
  return schiffFaehrt(s) ? "s-pfeil" : "s-punkt";
}
export function schiffName(s) { return s.name || (s.kind === "sar" ? "Rettungsflugzeug" : `Schiff ${s.mmsi}`); }

/** Fahrtrichtung und Position in einem Satz */
export function schiffSatz(s, ich) {
  const teile = [];
  const st = fahrtStatus(s.nav);
  const faehrt = schiffFaehrt(s);
  if (s.nav === 14) return { text: "Notsignal! Ein AIS-Notsender (SART, Mann-über-Bord oder EPIRB) ist aktiv.", notfall: true };
  if (faehrt) teile.push(`Fährt mit ${tempo(s.sog, true)} ${richtungNach(s.cog ?? s.hdg ?? 0)}`);
  else if (st) teile.push(st[0].toUpperCase() + st.slice(1));
  else teile.push("Liegt still");
  const wo = ueber(s.lat, s.lon, "in").replace(/^in (Deutschland|Dänemark|Schweden|Polen|Finnland|Norwegen|den Niederlanden)$/, (m) => m);
  if (wo) teile.push(wo.replace(/^in dem /, "im ").replace(/^in der /, "in der "));
  if (ich) {
    const d = entfernung(ich.lat, ich.lon, s.lat, s.lon);
    if (d < 200000) teile.push(`${weite(d)} ${richtungKurz(richtung(ich.lat, ich.lon, s.lat, s.lon))} von dir`);
  }
  return { text: teile.join(" · "), notfall: false };
}

function rumpfSkizze(s) {
  if (!(s.len > 0)) return "";
  const L = s.len, B = s.beam || L * 0.16;
  const W = 280, H = 70, rand = 34;
  const k = Math.min((W - 2 * rand) / L, (H - 26) / Math.max(B, 1));
  const l = L * k, b = Math.max(6, B * k);
  const x0 = (W - l) / 2, y0 = 12 + ((H - 26) - b) / 2;
  const bug = Math.min(l * 0.18, b * 1.6);
  const pfad = `M${x0},${y0} L${x0 + l - bug},${y0} Q${x0 + l},${y0 + b / 2} ${x0 + l - bug},${y0 + b} L${x0},${y0 + b} Z`;
  const ant = s.ts != null && s.tp != null ? `<circle cx="${x0 + s.ts * k}" cy="${y0 + s.tp * k * (b / (B * k))}" r="3" fill="#fff"/><text x="${x0 + s.ts * k}" y="${y0 - 3}" font-size="9" fill="#9ba7bf" text-anchor="middle">AIS</text>` : "";
  const farbe = SCHIFF_GRUPPEN[s.g || "sonst"].farbe;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Umriss von oben">
    <path d="${pfad}" fill="${farbe}" fill-opacity=".85" stroke="#fff" stroke-opacity=".5"/>${ant}
    <line x1="${x0}" x2="${x0 + l}" y1="${H - 8}" y2="${H - 8}" stroke="#9ba7bf"/><text x="${W / 2}" y="${H - 11}" font-size="10" fill="#cdd5e6" text-anchor="middle">${zahl(L)} m</text>
    <text x="${x0 + l + 4}" y="${y0 + b / 2 + 3}" font-size="10" fill="#cdd5e6">${zahl(B)} m</text></svg>`;
}

export function schiffHtml(s) {
  const g = SCHIFF_GRUPPEN[s.g || "sonst"];
  const fl = s.flagge ? `${flagge(s.flagge)} ${esc(land(s.flagge))} · ` : "";
  return `
  <div class="ib-foto leer" data-teil="foto"></div>
  <div class="ib-innen">
    <div class="ib-kopf">
      <img class="sym" alt="" src="${vorschau(s.len > 0 ? "s-rumpf" : schiffSymbol(s), g.farbe, 40, 0)}">
      <div class="ib-titel"><h2>${esc(schiffName(s))}</h2><p>${fl}${esc(schiffArt(s.typ, s.kind))}</p></div>
      ${kopfKnoepfe}
    </div>
    <div class="ib-zahlen">
      <div class="ib-zahl"><small>Tempo</small><b data-f="tempo">–</b><span data-f="tempo2"></span></div>
      <div class="ib-zahl"><small>Kurs</small><b data-f="kurs">–</b><span data-f="kurs2"></span></div>
      <div class="ib-zahl"><small>Länge</small><b>${s.len ? zahl(s.len) + " m" : "–"}</b><span>${s.beam ? "Breite " + zahl(s.beam) + " m" : ""}</span></div>
      <div class="ib-zahl"><small>Von dir</small><b data-f="dist">–</b><span data-f="dist2"></span></div>
    </div>
    <p class="ib-satz" data-f="satz"></p>
    <div class="ib-rest">
      <div data-teil="ziel"></div>
      <div class="knopf-reihe">${knopf("folgen", "folgen", "Folgen", false)}${knopf("spur", "spur", "Fahrtweg", false)}${knopf("live", "live", "Live-Blick")}${knopf("teilen", "teilen", "Teilen")}</div>
      <div data-f="begegnung"></div>
      ${s.len ? `<div class="abschnitt">Größe</div><div class="masse">${rumpfSkizze(s)}</div><p class="hinweis-klein">${esc(groessenVergleich(s.len))}${s.tief ? ` · Tiefgang ${zahl(s.tief, 1)} m` : ""}</p>` : ""}
      <div data-teil="register"><p class="lade-zeile">Schiffsregister wird geladen …</p></div>
      <div class="abschnitt">Funkdaten (AIS)</div>
      <table class="tabelle"><tbody data-teil="ais">${schiffTabelle(s)}</tbody></table>
      <div class="verweise">
        <a href="https://www.marinetraffic.com/de/ais/details/ships/mmsi:${s.mmsi}" target="_blank" rel="noopener">MarineTraffic</a>
        <a href="https://www.vesselfinder.com/vessels/details/${s.imo || s.mmsi}" target="_blank" rel="noopener">VesselFinder</a>
        <a href="https://www.myshiptracking.com/?mmsi=${s.mmsi}" target="_blank" rel="noopener">MyShipTracking</a>
      </div>
    </div>
  </div>`;
}

function schiffTabelle(s) {
  return zeile("Art", esc(schiffArt(s.typ, s.kind)) + (s.typ != null ? ` <small>(Code ${s.typ})</small>` : "")) +
    zeile("Status", esc(fahrtStatus(s.nav) || "keine Angabe")) +
    zeile("MMSI", String(s.mmsi)) + zeile("IMO", s.imo ? String(s.imo) : "") + zeile("Rufzeichen", esc(s.ruf || "")) +
    zeile("Flagge", s.flagge ? `${flagge(s.flagge)} ${esc(land(s.flagge))}` : "") +
    zeile("Ziel (Eingabe)", esc(s.ziel || "")) + zeile("Ankunft (Eingabe)", esc(s.eta ? etaText(s.eta) : "")) +
    zeile("Tiefgang", s.tief ? `${zahl(s.tief, 1)} m` : "") +
    zeile("Drehrate", s.rot != null && s.rot !== 0 ? `${s.rot > 0 ? "nach rechts" : "nach links"}` : "") +
    zeile("AIS-Gerät", s.klasse === "B" ? "Klasse B (kleine Schiffe)" : s.klasse === "A" ? "Klasse A (Berufsschifffahrt)" : "") +
    zeile("Empfangen über", esc(s.quelle || "")) +
    zeile("Letzte Meldung", `<span data-f="seit">${seit(s.t)}</span>`) +
    zeile("Position", `<span data-f="pos">${pos(s.lat, s.lon)}</span>`);
}
const pos = (lat, lon) => `${zahl(Math.abs(lat), 4)}° ${lat >= 0 ? "N" : "S"}, ${zahl(Math.abs(lon), 4)}° ${lon >= 0 ? "O" : "W"}`;

/** „10-31 16:00“ (UTC, ohne Jahr) → lesbar in Ortszeit */
export function etaZeit(eta) {
  const m = /^(\d{2})-(\d{2})(?: (\d{2}):(\d{2}))?$/.exec(eta || "");
  if (!m) return null;
  const jetzt = new Date();
  let j = jetzt.getUTCFullYear();
  let t = Date.UTC(j, Number(m[1]) - 1, Number(m[2]), m[3] ? Number(m[3]) : 12, m[4] ? Number(m[4]) : 0);
  if (t < Date.now() - 180 * 86400000) t = Date.UTC(j + 1, Number(m[1]) - 1, Number(m[2]), m[3] ? Number(m[3]) : 12, m[4] ? Number(m[4]) : 0);
  return { t, mitZeit: !!m[3] };
}
function etaText(eta) {
  const e = etaZeit(eta);
  if (!e) return eta;
  return `${tag(e.t)}${e.mitZeit ? " " + uhr(e.t) : ""} (${relativ(e.t)})`;
}

export function schiffZielHtml(s) {
  if (!s.ziel) return "";
  const h = hafen(s.ziel);
  const e = etaZeit(s.eta);
  let rest = "";
  if (h && h.lat != null) {
    const d = entfernung(s.lat, s.lon, h.lat, h.lon);
    rest = `noch ca. ${weite(d)} Luftlinie`;
    if (s.sog > 2) { const t = Date.now() + d / (s.sog * KN) * 1000; rest += ` · bei diesem Tempo ${tag(t)} ${uhr(t)}`; }
  }
  return `<div class="route"><div class="route-orte">
      <div class="route-ort"><span>Ziel laut Besatzung</span><b>${esc(h ? h.name : s.ziel)}</b><span>${h ? esc(flagge(h.land) + " " + land(h.land)) + " · " + esc(h.code) : ""}</span></div>
      ${e ? `<div class="route-ort"><span>Ankunft geplant</span><b>${e.mitZeit ? uhr(e.t) : tag(e.t)}</b><span>${e.mitZeit ? tag(e.t) + " · " : ""}${relativ(e.t)}</span></div>` : ""}
    </div>${rest ? `<div class="route-fuss" style="margin-top:6px"><span>${rest}</span></div>` : ""}</div>`;
}

export function schiffRegisterHtml(d) {
  const p = d && d.properties ? d.properties : null;
  const r = p && p.particulars;
  if (!r || !Object.keys(r).length) return "";
  const alter = r.year_built ? new Date().getFullYear() - r.year_built : null;
  const wiki = r.wikipedia ? `<a href="${esc(r.wikipedia)}" target="_blank" rel="noopener">Wikipedia-Artikel</a>` : "";
  return `<div class="abschnitt">Schiffsregister</div><table class="tabelle"><tbody>
    ${zeile("Schiffstyp", esc(r.ship_type || r.service || ""))}
    ${zeile("Registrierter Name", r.registered_name && r.registered_name !== p.name ? esc(r.registered_name) : "")}
    ${zeile("Baujahr", r.year_built ? `${r.year_built} <small>(${alter} Jahre alt)</small>` : "")}
    ${zeile("Werft", esc(r.builder || "") + (r.yard_number ? ` <small>(Baunummer ${esc(r.yard_number)})</small>` : ""))}
    ${zeile("Länge (Register)", r.length ? `${zahl(r.length, 1)} m` : "")}
    ${zeile("Breite (Register)", r.beam ? `${zahl(r.beam, 1)} m` : "")}
    ${zeile("Bruttoraumzahl", r.gross_tonnage ? zahl(r.gross_tonnage) : "")}
    ${zeile("Tragfähigkeit", r.deadweight ? `${zahl(r.deadweight)} t` : "")}
    ${zeile("Heimathafen", esc(r.home_port || ""))}
    ${zeile("Registerland", esc(r.registry || ""))}
    ${zeile("Eigner", esc(r.owner || ""))}
    ${zeile("Betreiber", esc(r.operator || ""))}
    ${zeile("Frühere Namen", Array.isArray(r.former_names) && r.former_names.length ? esc(r.former_names.join(", ")) : "")}
    ${zeile("Im Netz seit", p.first_seen ? new Date(p.first_seen).toLocaleDateString("de-DE") : "")}
  </tbody></table>${wiki ? `<div class="verweise">${wiki}</div>` : ""}<p class="hinweis-klein">Registerdaten: ${Object.values(p.sources || {}).map((x) => esc(x.credit)).join(", ") || "Wikidata"}</p>`;
}

export function schiffWerte(s, ich) {
  const v = {};
  const faehrt = s.sog != null && s.sog > 0.3;
  v.tempo = s.sog != null ? `${zahl(s.sog, s.sog < 10 ? 1 : 0)} kn` : "–";
  v.tempo2 = s.sog != null ? `${zahl(s.sog * 1.852)} km/h` : "";
  const k = s.cog ?? s.hdg;
  v.kurs = k != null && faehrt ? `${Math.round(k)}°` : s.hdg != null ? `${Math.round(s.hdg)}°` : "–";
  v.kurs2 = k != null ? (faehrt ? richtungKurz(k) : "Bug " + richtungKurz(s.hdg ?? k)) : "";
  if (ich) {
    const d = entfernung(ich.lat, ich.lon, s.lat, s.lon);
    v.dist = weite(d); v.dist2 = richtungKurz(richtung(ich.lat, ich.lon, s.lat, s.lon));
    const a = naechsteAnnaeherung(ich.lat, ich.lon, s.lat, s.lon, (s.sog || 0) * KN, s.cog ?? s.hdg ?? 0);
    v.begegnung = a && !a.vorbei && a.t < 3 * 3600 && a.d < 15000
      ? `<div class="wissen">Kommt dir am nächsten in <b>${a.t < 60 ? "unter 1 min" : Math.round(a.t / 60) + " min"}</b>: dann nur noch <b>${weite(a.d)}</b> entfernt (um ${uhr(Date.now() + a.t * 1000)}).</div>` : "";
  } else { v.dist = "–"; v.dist2 = "Standort fehlt"; v.begegnung = ""; }
  const satz = schiffSatz(s, ich);
  v.satz = satz.text; v._notfall = satz.notfall;
  v.seit = seit(s.t); v.pos = pos(s.lat, s.lon);
  return v;
}

// ================================================================== Flugzeuge
export function flugName(f) {
  return f.cs || f.reg || f.hex.toUpperCase();
}
export function flugSatz(f, ich) {
  const sq = SQUAWK[f.sq];
  if ((sq && sq.notfall) || f.notfall) return { text: `Notfall: ${f.notfall ? EMERGENCY[f.notfall] || f.notfall : sq.text}!`, notfall: true };
  const teile = [];
  if (f.boden) teile.push(f.gs > 25 ? `Rollt mit ${zahl((f.gs || 0) * 1.852)} km/h` : "Steht am Boden");
  else {
    let s = `Fliegt in ${hoehe(f.altM, f.altFt)} ${richtungNach(f.trk ?? 0)}`;
    if (f.vr > 600) s += ", steigt"; else if (f.vr < -600) s += ", sinkt";
    teile.push(s);
  }
  const wo = ueber(f.lat, f.lon, f.boden ? "in" : "über");
  if (wo) teile.push(wo.replace(/^in dem /, "im "));
  if (ich) {
    const d = entfernung(ich.lat, ich.lon, f.lat, f.lon);
    if (d < 400000) teile.push(`${weite(d)} ${richtungKurz(richtung(ich.lat, ich.lon, f.lat, f.lon))} von dir`);
  }
  return { text: teile.join(" · "), notfall: false };
}

export function flugHtml(f) {
  const ty = flugTyp(f.typ, f.kat, f.desc);
  const al = airline(f.cs);
  const titel = esc(flugName(f)) + (al ? ` <small style="font-weight:500;color:var(--leise)">${esc(al.name)}</small>` : "");
  return `
  <div class="ib-foto leer" data-teil="foto"></div>
  <div class="ib-innen">
    <div class="ib-kopf">
      <img class="sym" alt="" src="${vorschau("f-" + ty.form, hoehenFarbeJs(f.altM), 40, 0)}" data-f="sym">
      <div class="ib-titel"><h2>${titel}</h2><p>${esc(ty.name)}${f.reg ? " · " + esc(f.reg) : ""}${f.mil ? ' <span class="etikett">Militär</span>' : ""}</p></div>
      ${kopfKnoepfe}
    </div>
    <div class="ib-zahlen">
      <div class="ib-zahl"><small>Höhe</small><b data-f="hoehe">–</b><span data-f="hoehe2"></span></div>
      <div class="ib-zahl"><small>Tempo</small><b data-f="tempo">–</b><span data-f="tempo2"></span></div>
      <div class="ib-zahl"><small>Steigen</small><b data-f="vr">–</b><span data-f="vr2"></span></div>
      <div class="ib-zahl"><small>Von dir</small><b data-f="dist">–</b><span data-f="dist2"></span></div>
    </div>
    <p class="ib-satz" data-f="satz"></p>
    <div class="ib-rest">
      <div data-teil="route"><p class="lade-zeile">Route wird gesucht …</p></div>
      <div class="knopf-reihe">${knopf("folgen", "folgen", "Folgen", false)}${knopf("spur", "spur", "Flugweg", false)}${knopf("live", "live", "Live-Blick")}${knopf("teilen", "teilen", "Teilen")}</div>
      ${TYP_WISSEN[f.typ] ? `<div class="wissen">${esc(TYP_WISSEN[f.typ])}</div>` : ""}
      <div class="abschnitt">Flugzeug</div>
      <table class="tabelle"><tbody data-teil="flugzeug">${flugzeugTabelle(f, ty, null)}</tbody></table>
      <div class="abschnitt">Flugdaten live</div>
      <table class="tabelle"><tbody data-teil="flugdaten">${flugdatenTabelle(f)}</tbody></table>
      <div class="verweise">
        <a href="https://adsb.lol/?icao=${f.hex}" target="_blank" rel="noopener">adsb.lol</a>
        ${f.reg ? `<a href="https://www.flightradar24.com/data/aircraft/${encodeURIComponent(f.reg.toLowerCase())}" target="_blank" rel="noopener">Flightradar24</a>` : ""}
        ${f.cs ? `<a href="https://flightaware.com/live/flight/${encodeURIComponent(f.cs)}" target="_blank" rel="noopener">FlightAware</a>` : ""}
        ${f.reg ? `<a href="https://www.planespotters.net/search?q=${encodeURIComponent(f.reg)}" target="_blank" rel="noopener">Planespotters</a>` : ""}
      </div>
    </div>
  </div>`;
}

export function flugzeugTabelle(f, ty, info) {
  ty = ty || flugTyp(f.typ, f.kat, f.desc);
  const al = airline(f.cs);
  return zeile("Typ", esc(info && info.type ? `${info.manufacturer ? info.manufacturer + " " : ""}${info.type}` : ty.name) + (f.typ ? ` <small>(${esc(f.typ)})</small>` : "")) +
    zeile("Kennzeichen", esc(f.reg || (info && info.registration) || "")) +
    zeile("Halter", esc((info && info.registered_owner) || "")) +
    zeile("Land", info && info.registered_owner_country_iso_name ? `${flagge(info.registered_owner_country_iso_name)} ${esc(land(info.registered_owner_country_iso_name))}` : "") +
    zeile("Fluggesellschaft", al ? esc(al.name) : "") +
    zeile("Spannweite / Länge", ty.bekannt ? `${zahl(ty.spann, 1)} m / ${zahl(ty.laenge, 1)} m` : "") +
    zeile("Gewichtsklasse", esc(KATEGORIE_TEXT[f.kat] || "")) +
    zeile("Transponder", `${f.hex.toUpperCase()}${f.mil ? " · Militär" : ""}`);
}

export function flugdatenTabelle(f) {
  const a = f.roh || {};
  const sq = SQUAWK[f.sq];
  const wind = a.wd != null && a.ws != null ? `${zahl(a.ws * 1.852)} km/h aus ${richtungKurz(a.wd)}` : "";
  const quelle = { adsb_icao: "ADS-B (GPS des Flugzeugs)", adsb_icao_nt: "ADS-B", adsr_icao: "ADS-R", tisb_icao: "TIS-B", mlat: "Multilateration (Laufzeitmessung)", mode_s: "Mode S", adsc: "ADS-C (Satellit)" }[a.type] || a.type || "";
  return zeile("Barometrische Höhe", f.boden ? "am Boden" : f.altFt != null ? `${hoehe(f.altM, f.altFt)} <small>(FL ${Math.round(f.altFt / 100)})</small>` : "") +
    zeile("GPS-Höhe", f.altGeoFt != null ? hoehe(f.altGeoFt * 0.3048, f.altGeoFt) : "") +
    zeile("Steig-/Sinkrate", f.vr != null ? `${zahl(f.vr * 0.00508, 1)} m/s <small>(${zahl(f.vr)} ft/min)</small>` : "") +
    zeile("Tempo über Grund", f.gs != null ? tempo(f.gs) : "") +
    zeile("Fahrt durch die Luft", a.tas != null ? `${zahl(a.tas * 1.852)} km/h${a.mach ? ` · Mach ${zahl(a.mach, 2)}` : ""}` : "") +
    zeile("Angezeigte Fahrt (IAS)", a.ias != null ? `${zahl(a.ias)} kn` : "") +
    zeile("Kurs", f.trk != null ? `${Math.round(f.trk)}° (${richtungKurz(f.trk)})` : "") +
    zeile("Autopilot-Höhe", a.nav_altitude_mcp != null ? hoehe(a.nav_altitude_mcp * 0.3048, a.nav_altitude_mcp) : "") +
    zeile("Wind in Flughöhe", wind) +
    zeile("Außentemperatur", a.oat != null ? `${zahl(a.oat)} °C` : "") +
    zeile("Luftdruck (QNH)", a.nav_qnh != null ? `${zahl(a.nav_qnh)} hPa` : "") +
    zeile("Squawk", f.sq ? `${esc(f.sq)}${sq ? ` <small>– ${esc(sq.text)}</small>` : ""}` : "") +
    zeile("Empfang", esc(quelle)) +
    zeile("Signal", a.rssi != null ? `${zahl(a.rssi, 1)} dBFS` : "") +
    zeile("Letzte Position", `<span data-f="seit">${seit(f.t)}</span>`);
}

export function flugRouteHtml(r, f) {
  if (!r) return `<p class="hinweis-klein">Keine Route zu ${esc(f.cs || "diesem Flug")} bekannt.</p>`;
  const fs = fortschritt(r, f.lat, f.lon);
  const ap = (a) => `<b>${esc(a.iata || a.icao || "?")}</b><span>${esc(a.ort || a.name || "")}</span><span>${a.iso ? flagge(a.iso) + " " : ""}${esc(a.name || "")}</span>`;
  let fuss = "";
  if (fs) {
    let ank = "";
    if (f.gs > 80 && !f.boden) { const t = Date.now() + fs.restM / (f.gs * KN) * 1000 + 600000; ank = ` · Ankunft ca. ${uhr(t)}`; }
    fuss = `<div class="route-balken"><i style="width:${(fs.anteil * 100).toFixed(1)}%"></i><svg style="left:${(fs.anteil * 100).toFixed(1)}%"><use href="#i-flug"/></svg></div>
      <div class="route-fuss"><span>${weite(fs.wegM)} geflogen</span><span>noch ${weite(fs.restM)}${ank}</span></div>`;
  }
  const nr = r.nummer ? `Flug ${esc(r.nummer)}` : "";
  return `<div class="route"><div class="route-orte"><div class="route-ort">${ap(r.von)}</div><div class="route-mitte">${nr}${r.airline ? "<br>" + esc(r.airline) : ""}</div><div class="route-ort">${ap(r.nach)}</div></div>${fuss}</div>`;
}

export function flugWerte(f, ich) {
  const v = {};
  v.hoehe = f.boden ? "Boden" : hoehe(f.altM, f.altFt);
  v.hoehe2 = !f.boden && f.altFt != null ? (f.altFt >= 6000 ? `FL ${Math.round(f.altFt / 100)}` : `${zahl(Math.round(f.altFt / 10) * 10)} ft`) : "";
  v.tempo = f.gs != null ? `${zahl(f.gs * 1.852)} km/h` : "–";
  v.tempo2 = f.gs != null ? `${zahl(f.gs)} kn` : "";
  v.vr = f.vr != null && !f.boden ? `${f.vr > 100 ? "↑" : f.vr < -100 ? "↓" : ""}${zahl(Math.abs(f.vr * 0.00508), 1)}` : "–";
  v.vr2 = f.vr != null && !f.boden ? (Math.abs(f.vr) < 100 ? "m/s · gleich" : f.vr > 0 ? "m/s steigt" : "m/s sinkt") : "";
  if (ich) {
    const d = entfernung(ich.lat, ich.lon, f.lat, f.lon);
    v.dist = weite(d); v.dist2 = richtungKurz(richtung(ich.lat, ich.lon, f.lat, f.lon));
  } else { v.dist = "–"; v.dist2 = "Standort fehlt"; }
  const s = flugSatz(f, ich);
  v.satz = s.text; v._notfall = s.notfall;
  v.seit = seit(f.t);
  return v;
}

export function fotoHtml(foto) {
  if (!foto || !foto.bild) return "";
  const credit = foto.urheber ? `© ${esc(foto.urheber)}` : "Foto";
  return `<img alt="Foto" referrerpolicy="no-referrer" src="${esc(foto.bild)}" onload="this.classList.add('da')" onerror="this.parentNode.classList.add('leer');this.parentNode.innerHTML=''"><a class="credit" href="${esc(foto.seite)}" target="_blank" rel="noopener">${credit}${foto.lizenz ? " · " + esc(foto.lizenz) : ""}</a>`;
}
