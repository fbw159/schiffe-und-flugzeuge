// Vermittler (Cloudflare Worker) für die Seite „Schiffe und Flugzeuge“
// https://fbw159.github.io/schiffe-und-flugzeuge/
//
// Freie Flugdaten-Dienste erlauben keine Abrufe direkt aus fremden Webseiten (kein CORS).
// Dieser Worker holt die Daten serverseitig und gibt sie mit CORS-Kopfzeilen an die Seite weiter.
// Nur fest eingetragene Ziele und Pfade, nur lesend, mit kurzem Zwischenspeicher (schont die Dienste).
//
// Ziele:
//   /adsb/…     → https://api.adsb.lol/…   (Flugdaten, ODbL, frei; nur bestimmte Pfade)
//   /status     → kurze Antwort, ob der Vermittler läuft
// (OpenSky und adsb.fi sperren Anfragen aus Cloudflare – darum nicht mehr dabei.)

const VERSION = "1.1";
const UA = "schiffe-und-flugzeuge/" + VERSION + " (+https://fbw159.github.io/schiffe-und-flugzeuge/)";

const HERKUNFT = [/^https:\/\/fbw159\.github\.io$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];

const ZAHL = "-?\\d{1,3}(?:\\.\\d{1,6})?";
const ZIELE = {
  adsb: {
    basis: "https://api.adsb.lol/",
    sek: 4,
    pfade: [
      new RegExp(`^v2/(?:lat/${ZAHL}/lon/${ZAHL}/dist/\\d{1,3}(?:\\.\\d)?|point/${ZAHL}/${ZAHL}/\\d{1,3}|closest/${ZAHL}/${ZAHL}/\\d{1,3})$`),
      /^v2\/(?:hex|icao)\/~?[0-9a-fA-F]{6}(?:,~?[0-9a-fA-F]{6}){0,49}$/,
      /^v2\/(?:callsign|reg|registration|type|sqk|squawk)\/[A-Za-z0-9-]{1,10}$/,
      /^v2\/(?:mil|ladd|pia)$/,
      /^api\/0\/airport\/[A-Za-z0-9]{3,4}$/,
    ],
    post: [/^api\/0\/routeset$/],
  },
};

function corsKopf(herkunft) {
  const h = new Headers();
  if (herkunft && HERKUNFT.some((m) => m.test(herkunft))) {
    h.set("Access-Control-Allow-Origin", herkunft);
    h.set("Vary", "Origin");
    h.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    h.set("Access-Control-Allow-Headers", "Content-Type");
    h.set("Access-Control-Max-Age", "86400");
    h.set("Access-Control-Expose-Headers", "X-Rate-Limit-Remaining, X-Rate-Limit-Retry-After-Seconds, X-Vermittler-Cache");
  }
  return h;
}

function antwort(text, status, herkunft, typ = "text/plain; charset=utf-8") {
  const h = corsKopf(herkunft);
  h.set("Content-Type", typ);
  h.set("Cache-Control", "no-store");
  return new Response(text, { status, headers: h });
}

async function hash(text) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(d)].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default {
  async fetch(request, env, ctx) {
    const herkunft = request.headers.get("Origin");
    if (herkunft && !HERKUNFT.some((m) => m.test(herkunft))) return antwort("Herkunft nicht erlaubt", 403, null);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsKopf(herkunft) });

    const url = new URL(request.url);
    const teile = url.pathname.replace(/^\/+/, "").split("/");
    const name = teile.shift();
    const pfad = teile.join("/");

    if (name === "status" || name === "") {
      return antwort(JSON.stringify({ ok: true, version: VERSION, ziele: Object.keys(ZIELE), zeit: Date.now() }), 200, herkunft, "application/json");
    }
    const ziel = ZIELE[name];
    if (!ziel) return antwort("Unbekanntes Ziel", 404, herkunft);

    const istPost = request.method === "POST";
    if (!istPost && request.method !== "GET") return antwort("Nur GET/POST", 405, herkunft);
    const liste = istPost ? ziel.post || [] : ziel.pfade;
    if (!liste.some((m) => m.test(pfad))) return antwort("Pfad nicht erlaubt", 404, herkunft);

    // Abfrageparameter nur, wenn erlaubt
    const q = new URLSearchParams();
    for (const k of ziel.abfrage || []) {
      const v = url.searchParams.get(k);
      if (v != null && /^-?\d{1,3}(\.\d{1,4})?$/.test(v)) q.set(k, v);
    }
    const zielUrl = ziel.basis + pfad + (q.toString() ? "?" + q : "");

    let koerper = null;
    if (istPost) {
      koerper = await request.text();
      if (koerper.length > 20000) return antwort("Zu groß", 413, herkunft);
      try { JSON.parse(koerper); } catch { return antwort("Kein JSON", 400, herkunft); }
    }

    // Zwischenspeicher (pro Rechenzentrum)
    const cache = caches.default;
    const schluessel = new Request("https://vermittler.cache/" + name + "/" + pfad + "?" + q + (istPost ? "&b=" + (await hash(koerper)) : ""), { method: "GET" });
    let treffer = await cache.match(schluessel);
    if (treffer) {
      const h = new Headers(treffer.headers);
      corsKopf(herkunft).forEach((v, k) => h.set(k, v));
      h.set("X-Vermittler-Cache", "ja");
      return new Response(treffer.body, { status: treffer.status, headers: h });
    }

    let r;
    try {
      r = await fetch(zielUrl, {
        method: istPost ? "POST" : "GET",
        headers: { "User-Agent": UA, Accept: "application/json", ...(istPost ? { "Content-Type": "application/json" } : {}) },
        body: koerper,
        cf: { cacheTtl: 0 },
      });
    } catch (e) {
      return antwort("Dienst nicht erreichbar: " + e.message, 502, herkunft);
    }

    const h = corsKopf(herkunft);
    h.set("Content-Type", r.headers.get("Content-Type") || "application/json");
    for (const k of ["X-Rate-Limit-Remaining", "X-Rate-Limit-Retry-After-Seconds"]) {
      const v = r.headers.get(k);
      if (v != null) h.set(k, v);
    }
    const sek = r.ok ? (istPost ? 300 : ziel.sek) : 0;
    h.set("Cache-Control", r.ok ? `public, max-age=${sek}` : "no-store");
    h.set("X-Vermittler-Cache", "nein");
    const aus = new Response(r.body, { status: r.status, headers: h });
    if (r.ok && sek > 0) {
      const kopie = aus.clone();
      const ch = new Headers(kopie.headers);
      ch.delete("Access-Control-Allow-Origin");
      ch.delete("Vary");
      ctx.waitUntil(cache.put(schluessel, new Response(kopie.body, { status: kopie.status, headers: ch })));
    }
    return aus;
  },
};
