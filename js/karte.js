// Karte und Globus (MapLibre): Grundkarte, Satellitenbild, Tag/Nacht, Schiffe (Figuren/Pfeile/Rümpfe), Flugzeuge, Spuren
import * as ml from "../lib/maplibre-gl.mjs";
import { symboleLaden, MASS } from "./symbole.js";
import { kartenBild, KARTE_UNTEN } from "./figuren.js";
import { nachtFlaeche } from "./geo.js";
import { SCHIFF_GRUPPEN, HOEHEN_FARBEN, BODEN_FARBE } from "./texte.js";

export const QUELLEN = {
  stil: "https://tiles.openfreemap.org/styles/fiord",
  satellit: "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg",
  schiffKacheln: "owk://{z}/{x}/{y}",
};

// Schiffs-Kacheln im Hauptfaden holen (eigenes Protokoll „owk://“): manche Browser-Umgebungen ließen die
// Abrufe aus dem Kartenhelfer (Web Worker) hängen. Außerdem lehnt Open Waters unbekannte Parameter ab (400),
// darum wird zum Auffrischen nur „neu=“ im eigenen Protokoll geändert und dann ohne Cache geholt.
let protokoll = false;
function protokollAnmelden() {
  if (protokoll) return;
  protokoll = true;
  ml.addProtocol("owk", async (params, abbruch) => {
    const m = /^owk:\/\/(\d+)\/(\d+)\/(\d+)/.exec(params.url);
    if (!m) throw new Error("Kachel?");
    const url = `https://ais.openwaters.io/v1/vessels/tiles/${m[1]}/${m[2]}/${m[3]}?kind=vessel,sar`;
    const r = await fetch(url, { signal: abbruch && abbruch.signal, cache: params.url.includes("neu=") ? "no-cache" : "default" });
    if (r.status === 204 || r.status === 404) return { data: new ArrayBuffer(0) };
    if (!r.ok) throw new Error("Kachel HTTP " + r.status);
    return { data: await r.arrayBuffer() };
  });
}
const SCHRIFT = ["Noto Sans Regular"], SCHRIFT_FETT = ["Noto Sans Bold"];
const SCHIFF_EBENEN = ["kurs-linie", "schiffe-notfall", "schiffe", "schiffe-fig", "schiffe-name"];

/** Größe: max(Mindestgröße · Zoomfaktor, echte Größe) – Stufen für jeden Zoom (zoom darf nur ganz außen stehen) */
function groesse(faktor) {
  const st = [];
  for (let z = 0; z <= 22; z++) st.push(z, ["max", ["*", ["get", "smin"], faktor(z)], ["*", ["get", "s0"], 2 ** z]]);
  return ["interpolate", ["exponential", 2], ["zoom"], ...st];
}
const zoomFaktorSchiff = (z) => (z <= 5 ? 0.62 : z >= 10 ? 1 : 0.62 + (z - 5) * 0.076);
const zoomFaktorFlug = (z) => (z <= 2 ? 0.34 : z >= 9 ? 0.82 : 0.34 + (z - 2) * 0.0686);
// Größe der Schiffsfiguren je Zoomstufe (Karte und main.js rechnen gleich)
const FIG_STUFEN = [[5, 0.36], [7, 0.48], [9, 0.66], [11, 0.86], [13, 1.05], [15, 1.2]];
function figZoom(z) {
  if (z <= FIG_STUFEN[0][0]) return FIG_STUFEN[0][1];
  for (let i = 1; i < FIG_STUFEN.length; i++) {
    const [z1, f1] = FIG_STUFEN[i], [z0, f0] = FIG_STUFEN[i - 1];
    if (z <= z1) return f0 + (f1 - f0) * (z - z0) / (z1 - z0);
  }
  return FIG_STUFEN[FIG_STUFEN.length - 1][1];
}
export { zoomFaktorSchiff, zoomFaktorFlug, figZoom };

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
    this.bereit = false;
    this.filterSchiff = null;
  }

  async start(mitte, zoom) {
    protokollAnmelden();
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
    // Schiffsfiguren erst erzeugen, wenn sie gebraucht werden (fig-<art>-<gruppe>-<r|l>)
    const figHolen = (id) => {
      const m = /^fig-([a-z]+)-([a-z]+)-([rl])$/.exec(id || "");
      if (!m) return false;
      if (!this.map.hasImage(id)) this.map.addImage(id, kartenBild(m[1], (SCHIFF_GRUPPEN[m[2]] || SCHIFF_GRUPPEN.sonst).farbe, m[3] === "r"), { pixelRatio: 2 });
      return true;
    };
    if (this.map.setMissingStyleImageResolver) this.map.setMissingStyleImageResolver(async (id) => { figHolen(id); });
    this.map.on("styleimagemissing", (e) => { if (!figHolen(e.id)) symboleLaden(this.map); });
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
    m.addSource("kurs", { type: "geojson", data: leer });
    m.addLayer({ id: "kurs-linie", type: "line", source: "kurs", layout: { "line-cap": "round", visibility: "none" },
      paint: { "line-color": farbeNachGruppe(["get", "g"]), "line-width": ["interpolate", ["linear"], ["zoom"], 8, 1.2, 14, 2.6], "line-opacity": 0.85 } });
    m.addSource("schiffe", { type: "geojson", data: leer, promoteId: "id" });
    m.addLayer({ id: "schiffe-notfall", type: "circle", source: "schiffe", filter: ["==", ["get", "nf"], 1], layout: { visibility: "none" },
      paint: { "circle-radius": 22, "circle-color": "rgba(255,40,40,0.18)", "circle-stroke-color": "#ff3b3b", "circle-stroke-width": 2.5, "circle-pitch-alignment": "map" } });
    m.addLayer({ id: "schiffe", type: "symbol", source: "schiffe", filter: ["!=", ["get", "art"], "fig"],
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
    // Figuren (Seitenansicht je nach Art) – stehen aufrecht, Wasserlinie am Ort des Schiffs
    m.addLayer({ id: "schiffe-fig", type: "symbol", source: "schiffe", filter: ["==", ["get", "art"], "fig"],
      layout: {
        "icon-image": ["get", "ic"],
        "icon-size": ["interpolate", ["linear"], ["zoom"], ...FIG_STUFEN.flatMap(([z, f]) => [z, ["*", ["get", "smin"], f]])],
        "icon-anchor": "bottom", "icon-offset": [0, KARTE_UNTEN], "icon-rotation-alignment": "viewport", "icon-pitch-alignment": "viewport",
        "icon-allow-overlap": true, "icon-ignore-placement": true, "symbol-sort-key": ["get", "sk"], visibility: "none",
      },
      paint: { "icon-opacity": ["case", ["==", ["get", "alt"], 1], 0.5, 1] } });
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
      paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], ...FIG_STUFEN.flatMap(([z, k]) => [z, ["case", ["has", "fs"], ["max", 16, ["+", 5, ["*", 32 * k, ["get", "fs"]]]], ["coalesce", ["get", "r"], 20]]])], "circle-color": "rgba(255,255,255,0.06)", "circle-stroke-color": "#ffffff", "circle-stroke-width": 2, "circle-pitch-alignment": "map", "circle-translate-anchor": "viewport" } });
  }

  _ereignisse() {
    const m = this.map;
    const ebenen = () => (this.modus === "schiffe" ? ["schiffe", "schiffe-fig", "schiffe-uebersicht"] : ["flug"]);
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
    for (const l of ["schiffe", "schiffe-fig", "schiffe-uebersicht", "flug"]) {
      m.on("mouseenter", l, () => (m.getCanvas().style.cursor = "pointer"));
      m.on("mouseleave", l, () => (m.getCanvas().style.cursor = ""));
    }
  }

  // ------------------------------------------------------------------ Schalter
  setModus(modus) {
    this.modus = modus;
    if (!this.bereit) return;
    const s = modus === "schiffe";
    this._sicht(SCHIFF_EBENEN, s);
    this._sicht(["flug", "flug-name"], !s);
    if (!s) this._sicht(["schiffe-uebersicht"], false);
    this.setSpur(null);
    this.setAuswahl(null);
  }
  /** Übersicht (Kacheln) oder Einzelschiffe zeigen */
  setSchiffAnsicht(uebersicht) {
    if (!this.bereit || this.modus !== "schiffe") return;
    this._sicht(["schiffe-uebersicht"], uebersicht);
    this._sicht(SCHIFF_EBENEN, !uebersicht);
  }
  _sicht(ids, an) { for (const id of ids) if (this.map.getLayer(id)) this.map.setLayoutProperty(id, "visibility", an ? "visible" : "none"); }
  setGrund(g) {
    this.grund = g;
    this._sicht(["satellit"], g === "satellit");
  }

  /** Filter nach Schiffsgruppen (Liste der sichtbaren Gruppen) */
  setSchiffFilter(gruppen) {
    if (!this.bereit) return;
    const f = gruppen ? ["in", ["get", "g"], ["literal", gruppen]] : null;
    const und = (a) => (f ? ["all", a, f] : a);
    this.map.setFilter("schiffe", und(["!=", ["get", "art"], "fig"]));
    this.map.setFilter("schiffe-fig", und(["==", ["get", "art"], "fig"]));
    this.map.setFilter("schiffe-notfall", und(["==", ["get", "nf"], 1]));
    this.map.setFilter("schiffe-name", f);
    this.map.setFilter("kurs-linie", f);
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
    src.setTiles([QUELLEN.schiffKacheln + "?neu=" + t]);
  }

  setDaten(quelle, features) {
    const src = this.map && this.map.getSource(quelle);
    if (src) src.setData({ type: "FeatureCollection", features });
  }
  setSpur(features) { this.setDaten("spur", features || []); }
  /** Ring um das gewählte Objekt; fig = Größe der Schiffsfigur (smin) – der Ring umfasst dann die ganze Figur über ihrem Ort */
  setAuswahl(f, radius = 20, fig = 0) {
    if (!this.bereit) return;
    if (fig !== this._ringFig) {
      this._ringFig = fig;
      this.map.setPaintProperty("auswahl", "circle-translate", fig
        ? ["interpolate", ["linear"], ["zoom"], ...FIG_STUFEN.flatMap(([z, k]) => [z, ["literal", [0, -64 * fig * k * 0.12]]])] : [0, 0]);
    }
    this.setDaten("auswahl", f ? [{ type: "Feature", properties: fig ? { r: radius, fs: fig } : { r: radius }, geometry: { type: "Point", coordinates: f } }] : []);
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
