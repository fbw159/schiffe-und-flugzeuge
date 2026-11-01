# Schiffe & Flugzeuge live

**Seite:** https://fbw159.github.io/schiffe-und-flugzeuge/

Schiffe und Flugzeuge live auf einem Globus – gemacht fürs Handy, schön auch am PC.

- **Umschalter** oben: Schiffe oder Flugzeuge.
- **Globus** mit Tag und Nacht; beim Heranzoomen eine detaillierte Karte (oder Satellitenbild).
- **Schiffe als Figuren:** jede Art hat ihre eigene kleine Seitenansicht (Containerschiff, Tanker, Fähre, Segelboot, Schlepper …), ein Strich zeigt die Fahrtrichtung. Im Ebenen-Menü auf schlichte Pfeile umschaltbar.
- **Echte Größe:** Nah herangezoomt werden Schiffe als Rumpf in ihrer echten Länge und Breite gezeigt (an der richtigen Stelle zur AIS-Antenne), Flugzeuge mit ihrer echten Spannweite.
- **Antippen** zeigt alles, was bekannt ist – Schiffe: Foto, Art, Flagge, Tempo, Kurs, Ziel mit Ankunft, Maße, Tiefgang, Werft, Baujahr, Tonnage, Eigner, Fahrtweg der letzten 24 Stunden, „kommt dir am nächsten in … min“; Flugzeuge: Foto, Fluggesellschaft, Route mit Fortschritt und Ankunftszeit, Typ, Kennzeichen, Höhe, Steigrate, Tempo, Mach, Wind und Temperatur in Flughöhe, Squawk mit Bedeutung, Flugweg.
- **Liste, Highlights, Filter:** Was ist in der Nähe, was ist das größte Schiff / das höchste Flugzeug, Notfälle, Arten ein- und ausblenden.
- **Live-Blick:** Handy auf ein Schiff oder Flugzeug halten – es erscheint genau dort, wo es ist (Kamera, Kompass, Lagesensoren): Schiffe als Seitenansicht je nach Art (Containerschiff, Tanker, Fähre, Segelboot, Schlepper, Fischkutter …), Bug in Fahrtrichtung, Flugzeuge als Umriss mit der Nase in Flugrichtung – nah und groß auch in ihrer echten Größe. Antippen öffnet alle Infos wie auf der Karte (Foto, Route, Register, Flugdaten …) plus Blickrichtung und Höhe über dem Horizont. „Hinführen“ zeigt mit einem Pfeil, wohin man schauen muss. Kompass-Abgleich an einem bekannten Objekt.

Nicht für die Navigation! Daten können fehlen, verspätet oder falsch sein.

## Datenquellen

| Was | Quelle | Lizenz / Bedingungen |
|---|---|---|
| Schiffe (Positionen, Live-Strom, Fahrtweg, Register) | [Open Waters AIS](https://openwaters.io/ais/) – sammelt AISHub, aisstream.io, Digitraffic, BarentsWatch, freiwillige Empfänger | frei für private Nutzung; Digitraffic CC BY 4.0, BarentsWatch NLOD 2.0, Freiwillige CC0, Register Wikidata CC0 |
| Schiffsfotos | Wikimedia Commons | Lizenz je Foto (wird angezeigt) |
| Häfen (Ziel „DEKEL“ → Kiel) | UN/LOCODE (UNECE), über [datasets/un-locode](https://github.com/datasets/un-locode) | frei |
| Flugzeuge | [adsb.lol](https://adsb.lol) über einen eigenen Vermittler (siehe unten) | ODbL |
| Flugrouten, Flugzeugdaten | [adsbdb](https://www.adsbdb.com), sonst adsb.lol | frei |
| Flugzeugfotos | [planespotters.net](https://www.planespotters.net) | Foto © Fotograf, mit Link |
| Karte | [OpenFreeMap](https://openfreemap.org), © OpenStreetMap-Mitwirkende, OpenMapTiles | ODbL |
| Satellitenbild | Sentinel-2 cloudless 2024 von [EOX](https://s2maps.eu) | CC BY-NC-SA 4.0 (enthält veränderte Copernicus-Sentinel-Daten) |
| „Gerade über …“ | Natural Earth (aus dem Projekt *Sterne und Satelliten*) | gemeinfrei |
| Missweisung (Kompass) | WMM2025, NOAA | gemeinfrei |

## Vermittler für Flugdaten (`relay/`)

Freie Flugdaten-Dienste erlauben keine Abrufe direkt aus fremden Webseiten (kein CORS). Darum läuft ein kleiner
**Cloudflare Worker** (kostenloser Tarif): `https://schiffe-flugzeuge.fbw159.workers.dev`.
Er leitet nur bestimmte, lesende Abfragen an `api.adsb.lol` weiter, setzt die CORS-Kopfzeilen für diese Seite und
speichert Antworten wenige Sekunden zwischen. Code: [`relay/worker.js`](relay/worker.js).
Die Adresse lässt sich in den Einstellungen der Seite ändern.

## Aufbau

Reines HTML/CSS/JavaScript (ES-Module), kein Build-Schritt.

| Datei | Inhalt |
|---|---|
| `index.html`, `css/app.css` | Gerüst und Aussehen (Kopfzeile, Umschalter, Blatt/Leiste, Infobox, Live-Blick, Dialoge) |
| `js/main.js` | Ablauf: Modus, Standort, Daten, Zeichnen, Liste, Highlights, Filter, Infobox, Live-Blick |
| `js/karte.js` | MapLibre-Globus, Grundkarte (angepasst), Satellitenbild, Tag/Nacht, Ebenen für Schiffe (Figuren, Pfeile, Rümpfe, Fahrtrichtung) und Flugzeuge |
| `js/schiffe.js` | Open Waters AIS: Ausschnitt laden, Live-Strom (WebSocket), Einzelheiten, Fahrtweg, Suche, Fotos, Häfen |
| `js/flugzeuge.js` | Flugdaten über den Vermittler (mehrere Kreise für große Ausschnitte), Route, Stammdaten, Fotos |
| `js/symbole.js` | Rumpf- und Flugzeug-Umrisse als Distanzfeld-Symbole (einfärbbar, scharf auch stark vergrößert) |
| `js/infobox.js` | Inhalte der Infobox |
| `js/live.js` | Live-Blick (Lagesensoren, Kompass mit Missweisung, Kamera, Figuren, Fähnchen, volle Infokarte, Hinführen, Abgleich) |
| `js/figuren.js` | Figuren für Karte und Live-Blick: 16 Seitenansichten von Schiffen je nach Art, Flugzeug-Umrisse – mit Rand, zwischengespeichert |
| `js/geo.js` | Entfernung, Richtung, Großkreis, Koppelnavigation, Ost-Nord-Oben, Tag/Nacht-Grenze |
| `js/texte.js` | Schiffsarten, Fahrtstatus, Flugzeugtypen mit Maßen, Fluggesellschaften, Squawk-Codes |
| `js/orte.js`, `data/orte.json` | „über der Ostsee“ / „über Deutschland“ |
| `js/magvar.js` | Missweisung WMM2025 (aus npm „magvar“, MIT) |
| `data/haefen.json` | Häfen aus UN/LOCODE (`tools/haefen_bauen.py`) |
| `lib/` | MapLibre GL JS 6.16.0 (BSD-3-Clause) |
| `relay/worker.js` | Cloudflare Worker (Vermittler) |
