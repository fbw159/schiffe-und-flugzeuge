// Tabellen und Texte: Schiffsarten, Fahrtstatus, Länder, Flugzeugtypen, Fluggesellschaften, Squawk-Codes

// ------------------------------------------------------------------ Schiffe
/** Gruppen (Farbe, Name) – ähnlich wie man es von Schiffsradar-Seiten kennt */
export const SCHIFF_GRUPPEN = {
  fracht: { name: "Frachtschiffe", kurz: "Fracht", farbe: "#79d16a" },
  tanker: { name: "Tanker", kurz: "Tanker", farbe: "#ff5f5f" },
  passagier: { name: "Passagierschiffe & Fähren", kurz: "Passagier", farbe: "#5aa8ff" },
  schnell: { name: "Schnellboote", kurz: "Schnell", farbe: "#ffd84a" },
  fischerei: { name: "Fischerei", kurz: "Fischerei", farbe: "#ff9a4a" },
  dienst: { name: "Schlepper & Arbeitsschiffe", kurz: "Dienst", farbe: "#48dccf" },
  sport: { name: "Segel- & Sportboote", kurz: "Sport", farbe: "#e383ff" },
  behoerde: { name: "Behörden, Rettung & Marine", kurz: "Behörde", farbe: "#c3c8ff" },
  sonst: { name: "Sonstige & unbekannt", kurz: "Sonstige", farbe: "#9aa5ba" },
};
export const SCHIFF_GRUPPEN_LISTE = Object.keys(SCHIFF_GRUPPEN);

export function schiffGruppe(typ, kind) {
  if (kind === "sar") return "behoerde";
  const t = Number(typ) || 0;
  if (t >= 70 && t <= 79) return "fracht";
  if (t >= 80 && t <= 89) return "tanker";
  if (t >= 60 && t <= 69) return "passagier";
  if (t >= 40 && t <= 49) return "schnell";
  if (t === 30) return "fischerei";
  if (t === 36 || t === 37) return "sport";
  if (t === 35 || t === 51 || t === 55 || t === 58 || t === 59) return "behoerde";
  if ((t >= 31 && t <= 34) || t === 50 || t === 52 || t === 53 || t === 54) return "dienst";
  return "sonst";
}

const GEFAHR = { 1: " mit Gefahrgut (Kat. A)", 2: " mit Gefahrgut (Kat. B)", 3: " mit Gefahrgut (Kat. C)", 4: " mit Gefahrgut (Kat. D)" };
/** AIS-Schiffsart (ITU-R M.1371) in Worten */
export function schiffArt(typ, kind) {
  if (kind === "sar") return "Such- und Rettungsluftfahrzeug";
  if (kind === "aton") return "Seezeichen (AIS)";
  if (kind === "base") return "AIS-Landstation";
  const t = Number(typ) || 0;
  const z = t % 10, zehn = Math.floor(t / 10);
  const fest = {
    30: "Fischereifahrzeug", 31: "Schleppverband", 32: "Schleppverband (über 200 m lang)", 33: "Bagger / Unterwasserarbeiten",
    34: "Taucherarbeiten", 35: "Marine / Militär", 36: "Segelboot", 37: "Sportboot", 50: "Lotsenboot", 51: "Seenotrettung (SAR)",
    52: "Schlepper", 53: "Hafenversorger", 54: "Umweltschutzschiff", 55: "Behörde / Polizei", 56: "Spezialschiff", 57: "Spezialschiff",
    58: "Krankentransport", 59: "Nichtkampfschiff (Res. 18)",
  };
  if (fest[t]) return fest[t];
  const basis = { 2: "Bodeneffektfahrzeug", 4: "Schnellboot", 6: "Passagierschiff", 7: "Frachtschiff", 8: "Tanker", 9: "Sonstiges Schiff" }[zehn];
  if (basis) return basis + (GEFAHR[z] || "");
  return "Art nicht angegeben";
}

export const FAHRT_STATUS = {
  0: "unterwegs mit Maschine", 1: "vor Anker", 2: "manövrierunfähig", 3: "manövrierbehindert", 4: "durch Tiefgang behindert",
  5: "festgemacht", 6: "auf Grund gelaufen", 7: "beim Fischen", 8: "unterwegs unter Segeln", 11: "schleppt",
  12: "schiebt oder schleppt längsseits", 14: "Notsignal (AIS-SART / MOB / EPIRB)!",
};
export const fahrtStatus = (s) => (s == null || s === 15 ? null : FAHRT_STATUS[s] || null);
export const liegt = (s) => s === 1 || s === 5 || s === 6;
/** fährt das Schiff? (über 2 kn zählt die Fahrt mehr als ein vergessener Status „vor Anker“) */
export const faehrt = (s) => s.sog != null && s.sog > 0.5 && (!liegt(s.nav) || s.sog > 2);

/** Kurze Beschreibung der Größe mit Vergleich */
export function groessenVergleich(lM) {
  if (!lM) return "";
  if (lM >= 300) return `fast so lang wie ${String(Math.round(lM / 105 * 10) / 10).replace(".", ",")} Fußballfelder`;
  if (lM >= 150) return `so lang wie ${String(Math.round(lM / 105 * 10) / 10).replace(".", ",")} Fußballfelder`;
  if (lM >= 60) return `so lang wie ${Math.round(lM / 12)} Linienbusse hintereinander`;
  if (lM >= 20) return `so lang wie ${Math.round(lM / 4.5)} Autos hintereinander`;
  return "ein kleines Boot";
}

// ------------------------------------------------------------------ Länder
let regionen = null;
try { regionen = new Intl.DisplayNames(["de"], { type: "region" }); } catch { regionen = null; }
export function land(iso) {
  if (!iso) return "";
  try { return regionen ? regionen.of(String(iso).toUpperCase()) : iso; } catch { return iso; }
}
export function flagge(iso) {
  if (!iso || !/^[A-Za-z]{2}$/.test(iso)) return "";
  return String.fromCodePoint(...iso.toUpperCase().split("").map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

// ------------------------------------------------------------------ Flugzeuge
/**
 * ICAO-Typ → [Name, Spannweite m, Länge m, Form, Triebwerke]
 * Formen: jet2 (zweistrahlig), jet4 (vierstrahlig), heck (Triebwerke am Heck: Regional-/Geschäftsreisejet),
 * prop2 (zweimotorig Propeller/Turboprop), prop4, prop1 (einmotorig), heli, segler, kampf, ballon
 */
export const TYPEN = {
  // Airbus
  A19N: ["Airbus A319neo", 35.8, 33.8, "jet2"], A20N: ["Airbus A320neo", 35.8, 37.6, "jet2"], A21N: ["Airbus A321neo", 35.8, 44.5, "jet2"],
  A318: ["Airbus A318", 34.1, 31.4, "jet2"], A319: ["Airbus A319", 34.1, 33.8, "jet2"], A320: ["Airbus A320", 34.1, 37.6, "jet2"], A321: ["Airbus A321", 34.1, 44.5, "jet2"],
  A306: ["Airbus A300-600", 44.8, 54.1, "jet2"], A310: ["Airbus A310", 43.9, 46.7, "jet2"],
  A332: ["Airbus A330-200", 60.3, 58.8, "jet2"], A333: ["Airbus A330-300", 60.3, 63.7, "jet2"], A338: ["Airbus A330-800neo", 64, 58.8, "jet2"], A339: ["Airbus A330-900neo", 64, 63.7, "jet2"],
  A342: ["Airbus A340-200", 60.3, 59.4, "jet4"], A343: ["Airbus A340-300", 60.3, 63.7, "jet4"], A345: ["Airbus A340-500", 63.5, 67.9, "jet4"], A346: ["Airbus A340-600", 63.5, 75.4, "jet4"],
  A359: ["Airbus A350-900", 64.8, 66.8, "jet2"], A35K: ["Airbus A350-1000", 64.8, 73.8, "jet2"],
  A388: ["Airbus A380-800", 79.8, 72.7, "jet4"], BCS1: ["Airbus A220-100", 35.1, 35, "jet2"], BCS3: ["Airbus A220-300", 35.1, 38.7, "jet2"],
  A3ST: ["Airbus Beluga", 44.8, 56.2, "jet2"], A337: ["Airbus BelugaXL", 60.3, 63.1, "jet2"], A400: ["Airbus A400M Atlas", 42.4, 45.1, "prop4"],
  // Boeing
  B712: ["Boeing 717", 28.5, 37.8, "heck"], B733: ["Boeing 737-300", 28.9, 33.4, "jet2"], B734: ["Boeing 737-400", 28.9, 36.4, "jet2"], B735: ["Boeing 737-500", 28.9, 31, "jet2"],
  B736: ["Boeing 737-600", 34.3, 31.2, "jet2"], B737: ["Boeing 737-700", 35.8, 33.6, "jet2"], B738: ["Boeing 737-800", 35.8, 39.5, "jet2"], B739: ["Boeing 737-900", 35.8, 42.1, "jet2"],
  B37M: ["Boeing 737 MAX 7", 35.9, 35.6, "jet2"], B38M: ["Boeing 737 MAX 8", 35.9, 39.5, "jet2"], B39M: ["Boeing 737 MAX 9", 35.9, 42.2, "jet2"], B3XM: ["Boeing 737 MAX 10", 35.9, 43.8, "jet2"],
  B752: ["Boeing 757-200", 38.1, 47.3, "jet2"], B753: ["Boeing 757-300", 38.1, 54.4, "jet2"],
  B762: ["Boeing 767-200", 47.6, 48.5, "jet2"], B763: ["Boeing 767-300", 47.6, 54.9, "jet2"], B764: ["Boeing 767-400", 51.9, 61.4, "jet2"],
  B772: ["Boeing 777-200", 60.9, 63.7, "jet2"], B77L: ["Boeing 777-200LR / F", 64.8, 63.7, "jet2"], B773: ["Boeing 777-300", 60.9, 73.9, "jet2"], B77W: ["Boeing 777-300ER", 64.8, 73.9, "jet2"],
  B778: ["Boeing 777-8", 71.8, 70.9, "jet2"], B779: ["Boeing 777-9", 71.8, 76.7, "jet2"],
  B788: ["Boeing 787-8 Dreamliner", 60.1, 56.7, "jet2"], B789: ["Boeing 787-9 Dreamliner", 60.1, 62.8, "jet2"], B78X: ["Boeing 787-10 Dreamliner", 60.1, 68.3, "jet2"],
  B741: ["Boeing 747-100", 59.6, 70.6, "jet4"], B742: ["Boeing 747-200", 59.6, 70.6, "jet4"], B744: ["Boeing 747-400", 64.4, 70.7, "jet4"], B748: ["Boeing 747-8", 68.4, 76.3, "jet4"],
  P8: ["Boeing P-8 Poseidon", 37.6, 39.5, "jet2"], E3TF: ["Boeing E-3 Sentry (AWACS)", 44.4, 46.6, "jet4"], E3CF: ["Boeing E-3 Sentry (AWACS)", 44.4, 46.6, "jet4"],
  K35R: ["Boeing KC-135 Stratotanker", 39.9, 41.5, "jet4"], C17: ["Boeing C-17 Globemaster III", 51.7, 53, "jet4"], E6: ["Boeing E-6 Mercury", 45.2, 46.6, "jet4"],
  KC2: ["Boeing KC-46 Pegasus", 47.6, 50.5, "jet2"], R135: ["Boeing RC-135", 39.9, 41.5, "jet4"], MD11: ["McDonnell Douglas MD-11", 51.7, 61.6, "jet2"],
  // Embraer, Bombardier, ATR, De Havilland …
  E170: ["Embraer E170", 26, 29.9, "jet2"], E75L: ["Embraer E175", 26, 31.7, "jet2"], E75S: ["Embraer E175", 26, 31.7, "jet2"], E190: ["Embraer E190", 28.7, 36.2, "jet2"], E195: ["Embraer E195", 28.7, 38.7, "jet2"],
  E290: ["Embraer E190-E2", 33.7, 36.3, "jet2"], E295: ["Embraer E195-E2", 35.1, 41.5, "jet2"], E135: ["Embraer ERJ 135", 20, 26.3, "heck"], E145: ["Embraer ERJ 145", 20, 29.9, "heck"],
  E35L: ["Embraer Legacy 600", 21.2, 26.3, "heck"], E50P: ["Embraer Phenom 100", 12.3, 12.8, "heck"], E55P: ["Embraer Phenom 300", 16.2, 15.6, "heck"], E545: ["Embraer Praetor 500", 20, 19.7, "heck"], E550: ["Embraer Praetor 600", 21.5, 20.7, "heck"],
  CRJ2: ["Bombardier CRJ200", 21.2, 26.8, "heck"], CRJ7: ["Bombardier CRJ700", 23.2, 32.5, "heck"], CRJ9: ["Bombardier CRJ900", 24.9, 36.2, "heck"], CRJX: ["Bombardier CRJ1000", 26.2, 39.1, "heck"],
  AT43: ["ATR 42-300", 24.6, 22.7, "prop2"], AT45: ["ATR 42-500", 24.6, 22.7, "prop2"], AT46: ["ATR 42-600", 24.6, 22.7, "prop2"], AT72: ["ATR 72", 27, 27.2, "prop2"], AT75: ["ATR 72-500", 27, 27.2, "prop2"], AT76: ["ATR 72-600", 27, 27.2, "prop2"],
  DH8A: ["De Havilland Dash 8-100", 25.9, 22.3, "prop2"], DH8C: ["De Havilland Dash 8-300", 27.4, 25.7, "prop2"], DH8D: ["De Havilland Dash 8-400", 28.4, 32.8, "prop2"],
  DHC6: ["De Havilland Twin Otter", 19.8, 15.8, "prop2"], SF34: ["Saab 340", 21.4, 19.7, "prop2"], SB20: ["Saab 2000", 24.8, 27.3, "prop2"], JS41: ["BAe Jetstream 41", 18.3, 19.3, "prop2"],
  D328: ["Dornier 328", 21, 21.1, "prop2"], J328: ["Dornier 328JET", 21, 21.2, "heck"], D228: ["Dornier 228", 17, 16.6, "prop2"], B190: ["Beechcraft 1900", 17.7, 17.6, "prop2"],
  L410: ["Let L-410 Turbolet", 19.5, 14.4, "prop2"], C130: ["Lockheed C-130 Hercules", 40.4, 29.8, "prop4"], C30J: ["Lockheed C-130J Super Hercules", 40.4, 29.8, "prop4"],
  P3: ["Lockheed P-3 Orion", 30.4, 35.6, "prop4"], C160: ["Transall C-160", 40, 32.4, "prop2"], C295: ["Airbus C295", 25.8, 24.5, "prop2"], CN35: ["CASA CN-235", 25.8, 21.4, "prop2"],
  SU95: ["Suchoi Superjet 100", 27.8, 29.9, "jet2"], A124: ["Antonow An-124", 73.3, 69.1, "jet4"], A225: ["Antonow An-225", 88.4, 84, "jet4"], AN26: ["Antonow An-26", 29.2, 23.8, "prop2"],
  IL76: ["Iljuschin Il-76", 50.5, 46.6, "jet4"], RJ85: ["Avro RJ85", 26.3, 28.6, "jet4"], RJ1H: ["Avro RJ100", 26.3, 31, "jet4"], B462: ["BAe 146-200", 26.3, 28.6, "jet4"],
  F100: ["Fokker 100", 28.1, 35.5, "heck"], F70: ["Fokker 70", 28.1, 30.9, "heck"], MD82: ["McDonnell Douglas MD-82", 32.9, 45.1, "heck"], MD83: ["McDonnell Douglas MD-83", 32.9, 45.1, "heck"],
  // Geschäftsreisejets
  C25A: ["Cessna Citation CJ2", 15.1, 14.5, "heck"], C25B: ["Cessna Citation CJ3", 16.3, 15.6, "heck"], C25C: ["Cessna Citation CJ4", 15.5, 16.3, "heck"], C510: ["Cessna Citation Mustang", 13.2, 12.4, "heck"],
  C525: ["Cessna CitationJet", 14.3, 13, "heck"], C560: ["Cessna Citation V", 15.9, 14.9, "heck"], C56X: ["Cessna Citation Excel", 17.2, 15.8, "heck"], C68A: ["Cessna Citation Latitude", 22, 18.97, "heck"],
  C680: ["Cessna Citation Sovereign", 19.3, 19.4, "heck"], C700: ["Cessna Citation Longitude", 20.6, 22.3, "heck"], C750: ["Cessna Citation X", 21.1, 22.0, "heck"],
  CL30: ["Bombardier Challenger 300", 19.5, 20.9, "heck"], CL35: ["Bombardier Challenger 350", 21, 20.9, "heck"], CL60: ["Bombardier Challenger 600", 19.6, 20.9, "heck"],
  GL5T: ["Bombardier Global 5000", 28.7, 29.5, "heck"], GLEX: ["Bombardier Global Express", 28.7, 30.3, "heck"], GL7T: ["Bombardier Global 7500", 31.7, 33.8, "heck"],
  GLF4: ["Gulfstream IV", 23.7, 26.9, "heck"], GLF5: ["Gulfstream V", 28.5, 29.4, "heck"], GLF6: ["Gulfstream G650", 30.4, 30.4, "heck"], GA6C: ["Gulfstream G600", 28.9, 29.4, "heck"], GA7C: ["Gulfstream G700", 31.4, 33.5, "heck"],
  F2TH: ["Dassault Falcon 2000", 19.3, 20.2, "heck"], F900: ["Dassault Falcon 900", 19.3, 20.2, "heck"], FA7X: ["Dassault Falcon 7X", 26.2, 23.2, "heck"], FA8X: ["Dassault Falcon 8X", 26.3, 24.5, "heck"], FA6X: ["Dassault Falcon 6X", 25.9, 25.7, "heck"],
  LJ35: ["Learjet 35", 12, 14.8, "heck"], LJ45: ["Learjet 45", 14.6, 17.7, "heck"], LJ75: ["Learjet 75", 15.5, 17.7, "heck"], H25B: ["Hawker 800", 15.7, 15.6, "heck"],
  PC24: ["Pilatus PC-24", 17, 16.9, "heck"], HDJT: ["HondaJet", 12.1, 12.99, "heck"], SF50: ["Cirrus Vision Jet", 11.8, 9.4, "prop1"], BE40: ["Beechjet 400", 13.3, 14.8, "heck"],
  // Propeller, Kleinflugzeuge
  C150: ["Cessna 150", 10.2, 7.3, "prop1"], C152: ["Cessna 152", 10.2, 7.3, "prop1"], C172: ["Cessna 172 Skyhawk", 11, 8.3, "prop1"], C182: ["Cessna 182 Skylane", 11, 8.8, "prop1"],
  C206: ["Cessna 206", 11, 8.6, "prop1"], C208: ["Cessna 208 Caravan", 15.9, 11.5, "prop1"], C210: ["Cessna 210", 11.2, 8.6, "prop1"], C310: ["Cessna 310", 11.3, 9.7, "prop2"], C414: ["Cessna 414", 12.1, 11.1, "prop2"],
  P28A: ["Piper PA-28 Cherokee", 10.7, 7.3, "prop1"], P28R: ["Piper Arrow", 10.8, 7.5, "prop1"], PA34: ["Piper Seneca", 11.9, 8.7, "prop2"], PA31: ["Piper Navajo", 12.4, 10.6, "prop2"], P46T: ["Piper M500", 13.1, 8.8, "prop1"],
  SR20: ["Cirrus SR20", 11.7, 7.9, "prop1"], SR22: ["Cirrus SR22", 11.7, 7.9, "prop1"], DA40: ["Diamond DA40", 11.9, 8.1, "prop1"], DA42: ["Diamond DA42 Twin Star", 13.6, 8.6, "prop2"], DA62: ["Diamond DA62", 14.6, 9.2, "prop2"],
  DA20: ["Diamond DA20", 10.9, 7.2, "prop1"], BE20: ["Beechcraft King Air 200", 16.6, 13.3, "prop2"], B350: ["Beechcraft King Air 350", 17.6, 14.2, "prop2"], BE9L: ["Beechcraft King Air 90", 15.3, 10.8, "prop2"],
  BE36: ["Beechcraft Bonanza", 10.2, 8.4, "prop1"], BE58: ["Beechcraft Baron", 11.5, 9.1, "prop2"], PC12: ["Pilatus PC-12", 16.3, 14.4, "prop1"], PC6T: ["Pilatus Porter", 15.9, 11, "prop1"],
  PC21: ["Pilatus PC-21", 9.1, 11.2, "prop1"], TBM9: ["Daher TBM 900", 12.8, 10.7, "prop1"], TBM8: ["Daher TBM 850", 12.8, 10.6, "prop1"], TBM7: ["Daher TBM 700", 12.7, 10.6, "prop1"],
  P180: ["Piaggio P.180 Avanti", 14, 14.4, "prop2"], EV97: ["Evektor EV-97", 9.3, 6.2, "prop1"], C42: ["Comco Ikarus C42", 9.5, 6.3, "prop1"], AAT3: ["Aero AT-3", 7.6, 5.9, "prop1"],
  DR40: ["Robin DR400", 8.7, 6.96, "prop1"], RV7: ["Van's RV-7", 7.7, 6.2, "prop1"], RV8: ["Van's RV-8", 7.3, 6.4, "prop1"], RV9: ["Van's RV-9", 8.5, 6.2, "prop1"], RV10: ["Van's RV-10", 9.6, 7.4, "prop1"],
  AN2: ["Antonow An-2", 18.2, 12.4, "prop1"], DC3: ["Douglas DC-3", 29, 19.7, "prop2"], JU52: ["Junkers Ju 52", 29.3, 18.9, "prop4"],
  // Segelflugzeuge
  GLID: ["Segelflugzeug", 18, 7, "segler"], ASK2: ["Schleicher ASK 21", 17, 8.4, "segler"], DG80: ["DG-800", 18, 7.1, "segler"], DUOD: ["Schempp-Hirth Duo Discus", 20, 8.6, "segler"], VENT: ["Schempp-Hirth Ventus", 18, 6.6, "segler"],
  ARCP: ["Schempp-Hirth Arcus", 20, 8.7, "segler"], LS8: ["Rolladen-Schneider LS8", 18, 6.7, "segler"], ULAC: ["Ultraleichtflugzeug", 9.5, 6.3, "prop1"],
  // Hubschrauber
  EC35: ["Airbus H135 / EC135", 10.2, 12.2, "heli"], EC45: ["Airbus H145 / EC145", 11, 13, "heli"], H160: ["Airbus H160", 13.4, 15.7, "heli"], EC30: ["Airbus H130", 10.7, 12.6, "heli"], EC20: ["Airbus H120", 10, 11.5, "heli"],
  AS50: ["Airbus H125 Écureuil", 10.7, 12.9, "heli"], AS55: ["Airbus AS355", 10.7, 12.9, "heli"], AS65: ["Airbus AS365 Dauphin", 11.9, 13.7, "heli"], EC55: ["Airbus H155", 12.6, 14.3, "heli"],
  EC75: ["Airbus H175", 14.8, 18.1, "heli"], EC25: ["Airbus H225 Super Puma", 16.2, 19.5, "heli"], AS32: ["Airbus Super Puma", 15.6, 18.7, "heli"], NH90: ["NHIndustries NH90", 16.3, 19.6, "heli"],
  B06: ["Bell 206 JetRanger", 10.2, 11.8, "heli"], B407: ["Bell 407", 10.7, 12.7, "heli"], B412: ["Bell 412", 14, 17.1, "heli"], B429: ["Bell 429", 11, 13.1, "heli"], B505: ["Bell 505", 11.3, 12.9, "heli"],
  A109: ["Leonardo AW109", 11, 13, "heli"], A139: ["Leonardo AW139", 13.8, 16.7, "heli"], A169: ["Leonardo AW169", 12.1, 14.7, "heli"], A189: ["Leonardo AW189", 14.6, 17.6, "heli"],
  S76: ["Sikorsky S-76", 13.4, 16, "heli"], S92: ["Sikorsky S-92", 17.2, 20.9, "heli"], H60: ["Sikorsky Black Hawk", 16.4, 19.8, "heli"], R22: ["Robinson R22", 7.7, 8.8, "heli"], R44: ["Robinson R44", 10.1, 11.7, "heli"], R66: ["Robinson R66", 10.1, 11.7, "heli"],
  CH47: ["Boeing CH-47 Chinook", 18.3, 30.1, "heli"], H53: ["Sikorsky CH-53", 22, 30.2, "heli"], H53S: ["Sikorsky CH-53", 22, 30.2, "heli"], TIGR: ["Eurocopter Tiger", 13, 14.1, "heli"], BK17: ["MBB/Kawasaki BK 117", 11, 13, "heli"],
  // Militär
  EUFI: ["Eurofighter Typhoon", 10.95, 15.96, "kampf"], F35: ["Lockheed Martin F-35 Lightning II", 10.7, 15.7, "kampf"], F16: ["General Dynamics F-16", 9.96, 15.06, "kampf"], F18S: ["Boeing F/A-18 Super Hornet", 13.6, 18.3, "kampf"],
  F15: ["McDonnell Douglas F-15", 13.05, 19.43, "kampf"], TOR: ["Panavia Tornado", 13.9, 16.7, "kampf"], RFAL: ["Dassault Rafale", 10.9, 15.3, "kampf"], GRPN: ["Saab Gripen", 8.4, 14.1, "kampf"], HAWK: ["BAe Hawk", 9.4, 11.2, "kampf"],
  A10: ["Fairchild A-10", 17.5, 16.3, "kampf"], F22: ["Lockheed Martin F-22 Raptor", 13.6, 18.9, "kampf"], B52: ["Boeing B-52 Stratofortress", 56.4, 48.5, "jet4"], GLEX6: ["Global 6000", 28.7, 30.3, "heck"],
  MQ9: ["General Atomics MQ-9 Reaper (Drohne)", 20, 11, "prop1"], GLHK: ["Northrop Grumman RQ-4 Global Hawk (Drohne)", 39.9, 14.5, "jet2"], Q4: ["Northrop Grumman RQ-4 Global Hawk (Drohne)", 39.9, 14.5, "jet2"],
  // Sonstiges
  BALL: ["Ballon", 18, 18, "ballon"], ZZZZ: ["unbekannter Typ", 12, 10, "prop1"],
};

/** Ersatzgrößen nach ADS-B-Kategorie (A1 leicht … A7 Hubschrauber) */
const KATEGORIE = {
  A1: ["Leichtflugzeug", 11, 8, "prop1"], A2: ["Kleines Flugzeug", 18, 16, "prop2"], A3: ["Verkehrsflugzeug", 35, 38, "jet2"], A4: ["Boeing 757 (Wirbelschleppe)", 38, 47, "jet2"],
  A5: ["Großraumflugzeug", 62, 65, "jet2"], A6: ["Sehr schnelles Flugzeug", 11, 16, "kampf"], A7: ["Hubschrauber", 12, 13, "heli"],
  B1: ["Segelflugzeug", 17, 7, "segler"], B2: ["Ballon / Luftschiff", 18, 18, "ballon"], B4: ["Ultraleicht", 9, 6, "prop1"], B6: ["Drohne", 3, 2, "prop1"],
  C1: ["Bodenfahrzeug (Notfall)", 3, 6, "boden"], C2: ["Bodenfahrzeug", 3, 6, "boden"], C3: ["Hindernis", 4, 4, "boden"],
};
export const KATEGORIE_TEXT = {
  A0: "keine Angabe", A1: "leicht (unter 7 t)", A2: "klein (7–34 t)", A3: "groß (34–136 t)", A4: "groß mit starker Wirbelschleppe (B757)", A5: "schwer (über 136 t)",
  A6: "sehr schnell und wendig", A7: "Hubschrauber", B1: "Segelflugzeug", B2: "Ballon / Luftschiff", B3: "Fallschirmspringer", B4: "Ultraleicht / Hängegleiter",
  B6: "Drohne", B7: "Raumfahrzeug", C1: "Bodenfahrzeug (Notdienst)", C2: "Bodenfahrzeug (Service)", C3: "festes Hindernis",
};

/** Typ-Infos mit Ersatz nach Kategorie und Beschreibung (desc) */
export function flugTyp(t, kat, desc) {
  const a = (t && TYPEN[t]) || null;
  if (a) return { name: a[0], spann: a[1], laenge: a[2], form: a[3], bekannt: true };
  const k = KATEGORIE[kat] || null;
  let form = k ? k[3] : "jet2";
  if (desc && /HELICOPTER|COPTER|ROTOR/i.test(desc)) form = "heli";
  const name = desc ? hübsch(desc) : (t || (k ? k[0] : "Flugzeug"));
  return { name, spann: k ? k[1] : 30, laenge: k ? k[2] : 30, form, bekannt: false };
}
function hübsch(s) {
  // „AIRBUS A-320neo“ → „Airbus A-320neo“
  return String(s).toLowerCase().replace(/(^|[\s\-/(])([a-zäöü])/g, (m, a, b) => a + b.toUpperCase())
    .replace(/\b([A-Za-z]{1,3}\d+[a-z]*)\b/g, (m) => m.toUpperCase().replace(/NEO$/, "neo").replace(/MAX$/, "MAX"));
}

/** Kurztexte zu bekannten Typen (für „Wissenswert“) */
export const TYP_WISSEN = {
  A388: "Das größte Passagierflugzeug der Welt: zwei durchgehende Decks, bis zu 853 Sitze. Gebaut wurde es bis 2021.",
  B748: "Die letzte Version des „Jumbo-Jets“ – das Buckel-Oberdeck macht die 747 unverwechselbar. Die Produktion endete 2023.",
  B744: "Der klassische „Jumbo-Jet“ mit dem Buckel. Heute fliegt er vor allem als Frachter.",
  A124: "Eines der größten Frachtflugzeuge der Welt; die Nase klappt nach oben, damit ganze Lokomotiven hineinpassen.",
  A3ST: "Der „Beluga“ bringt Flugzeugteile zwischen den Airbus-Werken hin und her – darum der riesige Rumpf.",
  A337: "Der BelugaXL transportiert ganze Flügel der A350 zwischen den Airbus-Werken.",
  A359: "Rumpf und Flügel bestehen zu über 50 % aus Kohlefaser-Verbundstoff – das spart viel Gewicht und Treibstoff.",
  A35K: "Die längste Version der A350, mit sechs statt vier Rädern je Hauptfahrwerk.",
  B789: "Der Dreamliner hat große, elektrisch abdunkelbare Fenster ohne Rollos und einen Rumpf aus Kohlefaser.",
  B788: "Der Dreamliner hat große, elektrisch abdunkelbare Fenster ohne Rollos und einen Rumpf aus Kohlefaser.",
  B78X: "Die längste Version des Dreamliners.",
  B77W: "Die Triebwerke der 777 haben fast den Durchmesser eines 737-Rumpfs.",
  A20N: "Die neuen Triebwerke („neo“ = new engine option) verbrauchen rund 15–20 % weniger Treibstoff als die alte A320.",
  A21N: "Der meistbestellte Mittelstreckenjet der letzten Jahre – mit bis zu 244 Sitzen.",
  B38M: "Die MAX erkennt man an den gezackten Triebwerksverkleidungen und den geteilten Flügelspitzen.",
  B738: "Eines der meistgebauten Verkehrsflugzeuge überhaupt.",
  A320: "Das erste Verkehrsflugzeug mit digitaler Fly-by-Wire-Steuerung per Sidestick.",
  BCS3: "Ursprünglich als Bombardier CSeries entwickelt, sehr leise und sparsam.",
  DH8D: "Die Dash 8-400 ist einer der schnellsten Turboprops im Liniendienst.",
  AT76: "Turboprops wie die ATR sind auf kurzen Strecken sparsamer als Jets.",
  EUFI: "Kampfflugzeug von Deutschland, Großbritannien, Italien und Spanien; über 2.000 km/h schnell.",
  F35: "Tarnkappen-Kampfflugzeug; Deutschland beschafft 35 Stück als Tornado-Nachfolger.",
  E3TF: "Das AWACS-Radarflugzeug der NATO erkennt man am drehenden Radar-„Pilz“ über dem Rumpf. Heimatbasis: Geilenkirchen.",
  C17: "Der schwere Militärtransporter kann auf kurzen, unbefestigten Pisten landen.",
  A400: "Der Militärtransporter hat gegenläufige Propeller – auf jeder Seite drehen sie in andere Richtungen.",
  EC35: "Typischer Rettungshubschrauber in Deutschland (z. B. „Christoph“).",
  EC45: "Wird in Deutschland oft als Rettungs- und Polizeihubschrauber eingesetzt.",
  C172: "Das meistgebaute Flugzeug der Welt: über 45.000 Stück.",
  MD11: "Dreistrahliger Frachter: das dritte Triebwerk sitzt im Leitwerk.",
  B52: "Der Langstreckenbomber fliegt seit den 1950er-Jahren und soll noch bis in die 2050er im Dienst bleiben.",
  A225: "Das größte Flugzeug der Welt wurde 2022 bei Kyjiw zerstört.",
};

/** Fluggesellschaften nach ICAO-Kürzel (Rufzeichen-Anfang) */
export const AIRLINES = {
  DLH: "Lufthansa", CLH: "Lufthansa CityLine", LHX: "Lufthansa City Airlines", GEC: "Lufthansa Cargo", BOX: "AeroLogic", EWG: "Eurowings", EWE: "Eurowings Europe", CFG: "Condor", TUI: "TUIfly",
  DLA: "Air Dolomiti", AUA: "Austrian", SWR: "Swiss", EDW: "Edelweiss", BEL: "Brussels Airlines", SXS: "SunExpress", DCS: "DC Aviation", MSR: "EgyptAir", ELY: "El Al",
  KLM: "KLM", KLC: "KLM Cityhopper", TRA: "Transavia", TVF: "Transavia France", AFR: "Air France", HOP: "Air France Hop", BAW: "British Airways", SHT: "British Airways Shuttle", CFE: "BA CityFlyer",
  VIR: "Virgin Atlantic", EZY: "easyJet", EJU: "easyJet Europe", EZS: "easyJet Switzerland", RYR: "Ryanair", RUK: "Ryanair UK", MAY: "Malta Air", LDM: "Lauda Europe", BCY: "CityJet",
  WZZ: "Wizz Air", WMT: "Wizz Air Malta", WUK: "Wizz Air UK", VLG: "Vueling", IBE: "Iberia", IBS: "Iberia Express", AEA: "Air Europa", VOE: "Volotea", TAP: "TAP Air Portugal",
  ITY: "ITA Airways", AEE: "Aegean", OAL: "Olympic Air", THY: "Turkish Airlines", PGT: "Pegasus", LOT: "LOT Polish Airlines", CSA: "Czech Airlines", TVS: "Smartwings", BTI: "airBaltic",
  SAS: "SAS", SZS: "SAS Connect", NOZ: "Norwegian", NSZ: "Norwegian", NAX: "Norwegian", FIN: "Finnair", ICE: "Icelandair", WIF: "Widerøe", BRA: "Braathens", NJE: "NetJets Europe", VJT: "VistaJet",
  UAE: "Emirates", QTR: "Qatar Airways", ETD: "Etihad", SVA: "Saudia", GFA: "Gulf Air", OMA: "Oman Air", FDB: "flydubai", RJA: "Royal Jordanian", MEA: "Middle East Airlines", KAC: "Kuwait Airways",
  SIA: "Singapore Airlines", CPA: "Cathay Pacific", JAL: "Japan Airlines", ANA: "All Nippon Airways", KAL: "Korean Air", AAR: "Asiana", CCA: "Air China", CES: "China Eastern", CSN: "China Southern",
  THA: "Thai Airways", MAS: "Malaysia Airlines", GIA: "Garuda Indonesia", AIC: "Air India", QFA: "Qantas", ANZ: "Air New Zealand", ETH: "Ethiopian Airlines", SAA: "South African Airways", RAM: "Royal Air Maroc",
  AAL: "American Airlines", UAL: "United Airlines", DAL: "Delta Air Lines", ACA: "Air Canada", WJA: "WestJet", JBU: "JetBlue", SWA: "Southwest", ASA: "Alaska Airlines", TAM: "LATAM Brasil", LAN: "LATAM",
  FDX: "FedEx", UPS: "UPS Airlines", DHK: "DHL Air UK", BCS: "DHL (European Air Transport)", DHX: "DHL Aero Expreso", ABR: "ASL Airlines", CLX: "Cargolux", ABW: "AirBridgeCargo", MPH: "Martinair Cargo",
  GTI: "Atlas Air", CKS: "Kalitta Air", NCA: "Nippon Cargo", SWN: "West Air Sweden", AIZ: "Arkia", ENT: "Enter Air", SMX: "Smartwings", NOS: "Neos", AZW: "Air Zimbabwe", TOM: "TUI Airways",
  JAF: "TUI fly Belgium", TFL: "TUI fly Netherlands", MBU: "Marabu", DSM: "Discover Airlines", OCN: "Discover Airlines", AHO: "Air Hamburg", JEI: "Jet Executive", FFD: "Stuttgarter Flugdienst",
  GAF: "Luftwaffe", GAM: "Heer (Bundeswehr)", GNY: "Marine (Bundeswehr)", BPO: "Bundespolizei", CHX: "Luftrettung „Christoph“", NATO: "NATO", RCH: "US Air Force (Transport)", RRR: "Royal Air Force",
  FAF: "Französische Luftwaffe", IAM: "Italienische Luftwaffe", PLF: "Polnische Luftwaffe", BAF: "Belgische Luftwaffe", NAF: "Niederländische Luftwaffe", DAF: "Dänische Luftwaffe", SVF: "Schwedische Luftwaffe",
  HKY: "Hubschrauber (Polizei)", ADA: "ADAC Luftrettung", DRF: "DRF Luftrettung", LFA: "Lufthansa Flight Training", AEZ: "Aerologic", BER: "Berlin Brandenburg (Kalibrierung)", FCK: "Flugvermessung",
};
export function airline(callsign) {
  if (!callsign) return null;
  const m = /^([A-Z]{3})\d/.exec(callsign.trim().toUpperCase());
  if (m && AIRLINES[m[1]]) return { code: m[1], name: AIRLINES[m[1]] };
  if (/^CHX\d/.test(callsign)) return { code: "CHX", name: AIRLINES.CHX };
  if (/^NATO\d/.test(callsign)) return { code: "NATO", name: "NATO" };
  return null;
}

export const SQUAWK = {
  "7500": { text: "Entführung (Code 7500)", notfall: true },
  "7600": { text: "Funkausfall (Code 7600)", notfall: true },
  "7700": { text: "Luftnotfall (Code 7700)", notfall: true },
  "7400": { text: "Drohne: Verbindung verloren (Code 7400)", notfall: true },
  "7000": { text: "Sichtflug (VFR) – Standardcode in Europa" },
  "1200": { text: "Sichtflug (VFR) – Standardcode in Nordamerika" },
  "2000": { text: "Einflug ohne zugewiesenen Code" },
  "1000": { text: "Instrumentenflug, Mode-S-Kennung" },
  "0020": { text: "Rettungshubschrauber (Deutschland)" },
};
export const EMERGENCY = { general: "Allgemeiner Notfall", lifeguard: "Ambulanzflug mit Vorrang", minfuel: "Treibstoffmangel", nordo: "Funkausfall", unlawful: "Entführung", downed: "Flugzeug abgestürzt/notgelandet", reserved: "Notfall" };

/** Höhenfarben (wie bei Flugradar-Seiten): m → Farbe */
export const HOEHEN_FARBEN = [
  [0, "#ff7a2f"], [1000, "#ffb02e"], [2500, "#ffe23a"], [4500, "#8fe04a"], [6500, "#36d6b8"], [8500, "#3ab0ff"], [10500, "#6d7bff"], [12500, "#c06bff"],
];
export const BODEN_FARBE = "#a8a8a8";
