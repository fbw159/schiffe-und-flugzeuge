// Karte und Globus (MapLibre): Grundkarte, Satellitenbild, Seezeichen, Tag/Nacht, Schiffe, Flugzeuge, Spuren
import * as ml from "../lib/maplibre-gl.mjs";
import { symboleLaden, MASS } from "./symbole.js";
import { nachtFlaeche } from "./geo.js";
import { SCHIFF_GRUPPEN, HOEHEN_FARBEN, BODEN_FARBE } from "./texte.js";

export const QUELLEN = {
  stil: "https://tiles.openfreemap.org/styles/fiord",
  satellit: "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg",
  seezeichen: "https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png",
  schiffKacheln: "https://ais.openwaters.io/v1/vessels/tiles/{z}/{x}/{y}?kind=vessel,sar",
};
const SCHRIFT = ["Noto Sans Regular"], SCHRIFT_FETT = ["Noto Sans Bold"];

/** Größe: max(Mindestgröße · Zoomfaktor, echte Größe) – Stufen für jeden Zoom (zoom darf nur ganz außen stehen) */
function groesse(faktor) {
  const st = [];
  for (let z = 0; z <= 22; z++) st.push(z, ["max", ["*", ["get", "smin"], faktor(z)], ["*", ["get", "s0"], 2 ** z]]);
  return ["interpolate", ["exponential", 2], ["zoom"], ...st];
}
const zoomFaktorSchiff = (z) => (z <= 5 ? 0.62 : z >= 10 ? 1 : 0.62 + (z - 5) * 0.076);
const zoomFaktorFlug = (z) => (z <= 2 ? 0.34 : z >= 9 ? 0.82 : 0.34 + (z - 2) * 0.0686);
export { zoomFaktorSchiff, zoomFaktorFlug };

/** Gruppe einer AIS-Schiffsart als Ausdruck (für die Kacheln der Übersicht) */
function gruppeAusdruck() {
  const t = ["coalesce", ["get", "type"], 0];
  const zw = (a, b) => ["all", [">=", t, a], ["<=", t, b]];
  return ["case",
    ["==", ["get", "kind"], "sar"], "behoerde",
    zw(70, 79), "fracht", zw(80, 89), "tanker", zw(60, 69), "passagier", zw(40, 49), "schnell",
    ["==", t, 30], "fischerei", ["any", ["==", t, 36], ["==", t, 37]], "sport",
    ["any", ["==", t, 35], ["==", t, 51], ["==", t, 55], ["==", t, 58], ["==", t, 59]], "behoerde",
    ["any", zw(31, 34), ["==", t, 50], ["==", t, 52], ["==", t, 53], ["==", t, 54]], "dienst",
    "sonst"];
}
function farbeNachGruppe(gruppe) {
  const m = ["match", gruppe];
  for (const [k, v] of Object.entries(SCHIFF_GRUPPEN)) m.push(k, v.farbe);
  m.push(SCHIFF_GRUPPEN.sonst.farbe);
  return m;
}
function hoehenFarbe() {
  const st = [];
  for (const [h, f] of HOEHEN_FARBEN) st.push(h, f);
  return ["case", ["<", ["get", "alt"], 0], BODEN_FARBE, ["interpolate", ["linear"], ["get", "alt"], ...st]];
}

/** Grundstil holen und anpassen: dunkles Blau, deutsche Namen */
async function grundStil() {
  let st = null;
  try {
    const r = await fetch(QUELLEN.stil);
    if (r.ok) st = await r.json();
  } catch { st = null; }
  if (!st || !Array.isArray(st.layers)) {
    st = {
      version: 8, sources: {}, glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
      layers: [{ id: "background", type: "background", paint: { "background-color": "#172233" } }],
    };
  }
  const name = ["coalesce", ["get", "name:de"], ["get", "name_de"], ["get", "name:latin"], ["get", "name"]];
  for (const l of st.layers) {
    const p = (l.paint = l.paint || {});
    const sl = l["source-layer"] || "";
    if (l.type === "background") p["background-color"] = "#18233a";
    if (l.id === "water") p["fill-color"] = "#0a1729";
    if (l.id === "waterway") { p["line-color"] = "#0e2036"; p["line-opacity"] = 1; }
    if (l.id.startsWith("landcover")) p["fill-opacity"] = 0.35;
    if (l.id === "landuse_residential") { p["fill-color"] = "#1d2a40"; p["fill-opacity"] = 0.5; }
    if (l.id === "building") { p["fill-color"] = "#25334c"; p["fill-opacity"] = 0.6; }
    if (l.id.startsWith("aeroway")) {
      if (l.type === "fill") p["fill-color"] = "#24314a";
      if (l.type === "line") p["line-color"] = "#4d5d7d";
    }
    if (l.type === "line" && sl === "transportation") p["line-opacity"] = 0.55;
    if (l.id.startsWith("boundary_country")) { p["line-color"] = "rgba(150,170,210,0.55)"; }
    if (l.type === "symbol" && l.layout && l.layout["text-field"]) {
      const tf = JSON.stringify(l.layout["text-field"]);
      if (tf.includes("name") && !tf.includes("ref")) l.layout["text-field"] = name;
      if (sl === "place" || sl === "water_name") { p["text-color"] = sl === "water_name" ? "#6f8fb8" : "#c4d0e4"; p["text-halo-color"] = "rgba(8,14,26,0.85)"; }
    }
  }
  st.projection = { type: "globe" };
  st.sky = {
    "sky-color": "#04060c", "horizon-color": "#18304f", "fog-color": "#0d1a2c",
    "sky-horizon-blend": 0.6, "horizon-fog-blend": 0.6, "fog-ground-blend": 0.9,
    "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 0.9, 5, 0.6, 7, 0],
  };
  return st;
}

export class Karte {
  constructor(el, opt) {
    this.el = el;
    this.opt = opt;
    this.modus = opt.modus || "schiffe";
    this.grund = "karte";
    this.seezeichen = true;
    this.bereit = false;
    this.filterSchiff = null;
  }

  async start(mitte, zoom) {
    const stil = await grundStil();
    this.map = new ml.Map({
      container: this.el, style: stil, center: mitte, zoom, maxPitch: 75,
      attributionControl: false, hash: false, fadeDuration: 150, dragRotate: true,
      renderWorldCopies: false, pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
    });
    this.map.addControl(new ml.AttributionControl({ compact: true, customAttribution: this.opt.namensnennung || "" }), "bottom-left");
    this.map.touchZoomRotate.enableRotation();
    await new Promise((res) => this.map.once("load", res));
    symboleLaden(this.map);
    this.map.on("styleimagemissing", () => symboleLaden(this.map));
    this._ebenen();
    this._ereignisse();
    this.bereit = true;
    this.nachtAktualisieren();
    setInterval(() => this.nachtAktualisieren(), 120000);
    this.setModus(this.modus);
  }

  _ersteSymbolEbene() {
    const l = this.map.getStyle().layers.find((x) => x.type === "symbol");
    return l ? l.id : undefined;
  }
  _ersteStrassenEbene() {
    const l = this.map.getStyle().layers.find((x) => x["source-layer"] === "transportation" || x.id.startsWith("tunnel") || x.id.startsWith("highway"));
    return l ? l.id : this._ersteSymbolEbene();
  }

  _ebenen() {
    const m = this.map;
    const leer = { type: "FeatureCollection", features: [] };
    m.addSource("satellit", { type: "raster", tiles: [QUELLEN.satellit], tileSize: 256, maxzoom: 14, attribution: '<a href="https://s2maps.eu" target="_blank">Sentinel-2 cloudless</a> von EOX (Copernicus-Daten 2024)' });
    m.addLayer({ id: "satellit", type: "raster", source: "satellit", layout: { visibility: "none" }, paint: { "raster-brightness-max": 0.82, "raster-saturation": -0.15, "raster-fade-duration": 200 } }, this._ersteStrassenEbene());
    const vorLabels = this._ersteSymbolEbene();
    m.addSource("nacht", { type: "geojson", data: leer });
    for (const [i, h] of [[0, -0.83], [1, -6], [2, -12]]) {
      m.addLayer({ id: "nacht-" + i, type: "fill", source: "nacht", filter: ["==", ["get", "h0"], h],
        paint: { "fill-color": "#000814", "fill-opacity": ["interpolate", ["linear"], ["zoom"], 0, 0.2, 5, 0.16, 7, 0], "fill-antialias": false } }, vorLabels);
    }
    m.addSource("seezeichen", { type: "raster", tiles: [QUELLEN.seezeichen], tileSize: 256, minzoom: 9, maxzoom: 18, attribution: '<a href="https://www.openseamap.org" target="_blank">OpenSeaMap</a>' });
    m.addLayer({ id: "seezeichen", type: "raster", source: "seezeichen", minzoom: 10, paint: { "raster-opacity": 0.9 } }, vorLabels);

    // Spuren und Routen
    m.addSource("spur", { type: "geojson", data: leer, lineMetrics: true });
    m.addLayer({ id: "spur-linie", type: "line", source: "spur", layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": ["coalesce", ["get", "farbe"], "#ffffff"], "line-width": ["interpolate", ["linear"], ["zoom"], 3, 1.6, 12, 3.2],
        "line-opacity": ["coalesce", ["get", "deck"], 0.9] } });
    m.addLayer({ id: "spur-gestrichelt", type: "line", source: "spur", filter: ["==", ["get", "art"], "plan"], layout: { "line-cap": "round" },
      paint: { "line-color": ["coalesce", ["get", "farbe"], "#ffffff"], "line-width": ["interpolate", ["linear"], ["zoom"], 3, 1.4, 12, 2.6], "line-opacity": 0.8, "line-dasharray": [1.5, 2] } });
    m.setFilter("spur-linie", ["!=", ["get", "art"], "plan"]);
    m.addLayer({ id: "spur-orte", type: "circle", source: "spur", filter: ["==", ["geometry-type"], "Point"],
      paint: { "circle-radius": 5, "circle-color": "#0b1220", "circle-stroke-color": "#fff", "circle-stroke-width": 2 } });
    m.addLayer({ id: "spur-orte-name", type: "symbol", source: "spur", filter: ["==", ["geometry-type"], "Point"],
      layout: { "text-field": ["get", "name"], "text-font": SCHRIFT_FETT, "text-size": 12, "text-offset": [0, 1.1], "text-anchor": "top", "text-optional": true },
      paint: { "text-color": "#fff", "text-halo-color": "rgba(0,0,0,.8)", "text-halo-width": 1.4 } });

    // Schiffe: Übersicht aus Vektorkacheln
    m.addSource("schiffKacheln", { type: "vector", tiles: [QUELLEN.schiffKacheln], minzoom: 0, maxzoom: 14,
      attribution: '<a href="https://openwaters.io/ais/" target="_blank">Open Waters AIS</a> (AISHub, aisstream.io, Digitraffic, BarentsWatch, Freiwillige)' });
    const g = gruppeAusdruck();
    const lenK = ["coalesce", ["get", "length"], 0];
    const lenFaktor = ["interpolate", ["linear"], lenK, 0, 0.62, 30, 0.78, 120, 1, 250, 1.25];
    m.addLayer({ id: "schiffe-uebersicht", type: "symbol", source: "schiffKacheln", "source-layer": "vessels",
      layout: {
        "icon-image": ["case", [">", ["coalesce", ["get", "sog"], 0], 0.6], "s-pfeil", "s-punkt"],
        "icon-size": ["interpolate", ["linear"], ["zoom"], 0, ["*", 0.42, lenFaktor], 4, ["*", 0.55, lenFaktor], 8, ["*", 0.85, lenFaktor]],
        "icon-rotate": ["coalesce", ["get", "hdg"], ["get", "cog"], 0], "icon-rotation-alignment": "map", "icon-pitch-alignment": "map",
        "icon-allow-overlap": true, "icon-ignore-placement": true, visibility: "none",
      },
      paint: { "icon-color": farbeNachGruppe(g), "icon-halo-color": "rgba(3,7,14,0.7)", "icon-halo-width": 0.8 } });

    // Schiffe: einzeln und live
    m.addSource("schiffe", { type: "geojson", data: leer, promoteId: "id" });
    m.addLayer({ id: "schiffe", type: "symbol", source: "schiffe",
      layout: {
        "icon-image": ["get", "ic"], "icon-size": groesse(zoomFaktorSchiff), "icon-rotate": ["get", "rot"],
        "icon-rotation-alignment": "map", "icon-pitch-alignment": "map", "icon-allow-overlap": true, "icon-ignore-placement": true,
        "symbol-sort-key": ["get", "sk"], visibility: "none",
      },
      paint: {
        "icon-color": farbeNachGruppe(["get", "g"]),
        "icon-halo-color": ["case", ["boolean", ["feature-state", "wahl"], false], "#ffffff", ["==", ["get", "nf"], 1], "#ff3b3b", "rgba(3,7,14,0.78)"],
        "icon-halo-width": ["case", ["boolean", ["feature-state", "wahl"], false], 2.4, ["==", ["get", "nf"], 1], 2.4, 1],
        "icon-opacity": ["case", ["==", ["get", "alt"], 1], 0.5, 1],
      } });
    m.addLayer({ id: "schiffe-name", type: "symbol", source: "schiffe", minzoom: 11.5,
      layout: { "text-field": ["get", "name"], "text-font": SCHRIFT, "text-size": ["interpolate", ["linear"], ["zoom"], 11.5, 10.5, 16, 13],
        "text-offset": [0, 1.3], "text-anchor": "top", "text-optional": true, "text-max-width": 9, "symbol-sort-key": ["get", "sk"], visibility: "none" },
      paint: { "text-color": "#e6edf8", "text-halo-color": "rgba(4,8,16,0.85)", "text-halo-width": 1.3 } });

    // Flugzeuge
    m.addSource("flug", { type: "geojson", data: leer, promoteId: "id" });
    m.addLayer({ id: "flug", type: "symbol", source: "flug",
      layout: {
        "icon-image": ["get", "ic"], "icon-size": groesse(zoomFaktorFlug), "icon-rotate": ["get", "rot"],
        "icon-rotation-alignment": "map", "icon-pitch-alignment": "map", "icon-allow-overlap": true, "icon-ignore-placement": true,
        "symbol-sort-key": ["get", "sk"], visibility: "none",
      },
      paint: {
        "icon-color": hoehenFarbe(),
        "icon-halo-color": ["case", ["boolean", ["feature-state", "wahl"], false], "#ffffff", ["==", ["get", "nf"], 1], "#ff2d2d", "rgba(3,7,14,0.8)"],
        "icon-halo-width": ["case", ["boolean", ["feature-state", "wahl"], false], 2.4, ["==", ["get", "nf"], 1], 2.6, 1],
        "icon-opacity": ["case", ["==", ["get", "alt0"], 1], 0.45, 1],
      } });
    m.addLayer({ id: "flug-name", type: "symbol", source: "flug", minzoom: 7.5,
      layout: { "text-field": ["get", "lab"], "text-font": SCHRIFT, "text-size": 10.5, "text-offset": [1.4, 0], "text-anchor": "left",
        "text-optional": true, "symbol-sort-key": ["get", "sk"], visibility: "none" },
      paint: { "text-color": "#e6edf8", "text-halo-color": "rgba(4,8,16,0.85)", "text-halo-width": 1.2 } });

    // Auswahl-Ring
    m.addSource("auswahl", { type: "geojson", data: leer });
    m.addLayer({ id: "auswahl", type: "circle", source: "auswahl",
      paint: { "circle-radius": ["coalesce", ["get", "r"], 20], "circle-color": "rgba(255,255,255,0.06)", "circle-stroke-color": "#ffffff", "circle-stroke-width": 2, "circle-pitch-alignment": "map" } });
  }

  _ereignisse() {
    const m = this.map;
    const ebenen = () => (this.modus === "schiffe" ? ["schiffe", "schiffe-uebersicht"] : ["flug"]);
    m.on("click", (e) => {
      const r = e.originalEvent && e.originalEvent.pointerType === "mouse" ? 10 : 22;
      const box = [[e.point.x - r, e.point.y - r], [e.point.x + r, e.point.y + r]];
      const fs = m.queryRenderedFeatures(box, { layers: ebenen().filter((l) => m.getLayer(l) && m.getLayoutProperty(l, "visibility") !== "none") });
      if (!fs.length) { this.opt.onLeer && this.opt.onLeer(); return; }
      let best = null, bd = Infinity;
      for (const f of fs) {
        const c = f.geometry.type === "Point" ? f.geometry.coordinates : null;
        if (!c) continue;
        const p = m.project(c);
        const d = Math.hypot(p.x - e.point.x, p.y - e.point.y);
        if (d < bd) { bd = d; best = f; }
      }
      if (best) this.opt.onWahl && this.opt.onWahl(best);
    });
    let warte = 0;
    const bewegt = () => { clearTimeout(warte); warte = setTimeout(() => this.opt.onBewegt && this.opt.onBewegt(), 350); };
    m.on("moveend", bewegt);
    m.on("zoomend", () => this.opt.onZoom && this.opt.onZoom());
    m.on("dragstart", () => this.opt.onZiehen && this.opt.onZiehen());
    m.on("rotate", () => this.opt.onDrehen && this.opt.onDrehen());
    m.on("pitch", () => this.opt.onDrehen && this.opt.onDrehen());
    for (const l of ["schiffe", "schiffe-uebersicht", "flug"]) {
      m.on("mouseenter", l, () => (m.getCanvas().style.cursor = "pointer"));
      m.on("mouseleave", l, () => (m.getCanvas().style.cursor = ""));
    }
  }

  // ------------------------------------------------------------------ Schalter
  setModus(modus) {
    this.modus = modus;
    if (!this.bereit) return;
    const s = modus === "schiffe";
    this._sicht(["schiffe", "schiffe-name"], s);
    this._sicht(["flug", "flug-name"], !s);
    this._sicht(["seezeichen"], s && this.seezeichen);
    if (!s) this._sicht(["schiffe-uebersicht"], false);
    this.setSpur(null);
    this.setAuswahl(null);
  }
  /** Übersicht (Kacheln) oder Einzelschiffe zeigen */
  setSchiffAnsicht(uebersicht) {
    if (!this.bereit || this.modus !== "schiffe") return;
    this._sicht(["schiffe-uebersicht"], uebersicht);
    this._sicht(["schiffe", "schiffe-name"], !uebersicht);
  }
  _sicht(ids, an) { for (const id of ids) if (this.map.getLayer(id)) this.map.setLayoutProperty(id, "visibility", an ? "visible" : "none"); }
  setGrund(g) {
    this.grund = g;
    this._sicht(["satellit"], g === "satellit");
  }
  setSeezeichen(an) { this.seezeichen = an; this._sicht(["seezeichen"], an && this.modus === "schiffe"); }

  /** Filter nach Schiffsgruppen (Liste der sichtbaren Gruppen) */
  setSchiffFilter(gruppen) {
    if (!this.bereit) return;
    const f = gruppen ? ["in", ["get", "g"], ["literal", gruppen]] : null;
    this.map.setFilter("schiffe", f);
    this.map.setFilter("schiffe-name", f);
    this.map.setFilter("schiffe-uebersicht", gruppen ? ["in", gruppeAusdruck(), ["literal", gruppen]] : null);
  }
  setFlugFilter(f) {
    if (!this.bereit) return;
    this.map.setFilter("flug", f);
    this.map.setFilter("flug-name", f);
  }

  /** Kacheln der Übersicht neu laden (neue Positionen) */
  kachelnNeu() {
    const src = this.map.getSource("schiffKacheln");
    if (!src) return;
    const t = Math.floor(Date.now() / 60000);
    src.setTiles([QUELLEN.schiffKacheln + "&t=" + t]);
  }

  setDaten(quelle, features) {
    const src = this.map && this.map.getSource(quelle);
    if (src) src.setData({ type: "FeatureCollection", features });
  }
  setSpur(features) { this.setDaten("spur", features || []); }
  setAuswahl(f, radius = 20) {
    if (!this.bereit) return;
    this.setDaten("auswahl", f ? [{ type: "Feature", properties: { r: radius }, geometry: { type: "Point", coordinates: f } }] : []);
  }
  /** weiße Umrandung am gewählten Objekt */
  setWahlZustand(quelle, id, an) {
    if (!this.bereit || id == null) return;
    try { this.map.setFeatureState({ source: quelle, id }, { wahl: an }); } catch { /* noch nicht da */ }
  }

  nachtAktualisieren() {
    if (!this.bereit) return;
    const t = Date.now();
    this.setDaten("nacht", [nachtFlaeche(t, -0.83), nachtFlaeche(t, -6), nachtFlaeche(t, -12)]);
  }

  // ------------------------------------------------------------------ Blick
  get zoom() { return this.map.getZoom(); }
  get mitte() { const c = this.map.getCenter(); return { lat: c.lat, lon: c.lng }; }
  /** sichtbarer Ausschnitt (am Globus: grob) */
  box() {
    const b = this.map.getBounds();
    let w = b.getWest(), e = b.getEast(), s = b.getSouth(), n = b.getNorth();
    if (e - w > 360) { w = -180; e = 180; }
    return { w, e, s: Math.max(-85, s), n: Math.min(85, n) };
  }
  /** Entfernung Bildmitte → weitester Bildrand [m] */
  sichtRadius() {
    const c = this.map.getCenter();
    const cv = this.map.getCanvas();
    const w = cv.clientWidth, h = cv.clientHeight;
    let max = 0;
    for (const [x, y] of [[0, 0], [w, 0], [0, h], [w, h], [w / 2, 0], [0, h / 2]]) {
      const p = this.map.unproject([x, y]);
      if (!p) continue;
      max = Math.max(max, c.distanceTo(p));
    }
    return Math.min(max, 20000000);
  }
  flieg(lon, lat, zoom, opt = {}) {
    this.map.flyTo({ center: [lon, lat], zoom: zoom ?? this.map.getZoom(), essential: true, duration: opt.dauer ?? 1600, pitch: opt.pitch, bearing: opt.bearing, padding: opt.padding });
  }
  springe(lon, lat) { this.map.jumpTo({ center: [lon, lat] }); }
  setPadding(p) { if (this.bereit) this.map.setPadding(p); }
}

export { ml, MASS };
