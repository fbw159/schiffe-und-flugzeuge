#!/usr/bin/env python3
"""Baut data/haefen.json aus der UN/LOCODE-Liste (nur Orte mit Hafen-Funktion).

Quelle: https://github.com/datasets/un-locode (data/code-list.csv, UNECE UN/LOCODE, ODC-PDDL)
Aufruf:  python3 tools/haefen_bauen.py code-list.csv data/haefen.json
Format:  {"DEKEL": ["Kiel", 54.333, 10.133], "DEWIS": ["Wismar"], …}  (Koordinaten nur, wenn bekannt)
"""
import csv, json, re, sys

def main(quelle, ziel):
    out = {}
    with open(quelle, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            if not (r["Function"] or "").startswith("1") or r["Change"] == "X":
                continue
            code = r["Country"] + r["Location"]
            m = re.match(r"(\d{2})(\d{2})([NS])\s+(\d{3})(\d{2})([EW])", r["Coordinates"] or "")
            if m:
                lat = int(m[1]) + int(m[2]) / 60
                lon = int(m[4]) + int(m[5]) / 60
                lat = -lat if m[3] == "S" else lat
                lon = -lon if m[6] == "W" else lon
                out[code] = [r["Name"].strip(), round(lat, 3), round(lon, 3)]
            else:
                out[code] = [r["Name"].strip()]
    with open(ziel, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(len(out), "Häfen")

if __name__ == "__main__":
    main(*(sys.argv[1:3] if len(sys.argv) >= 3 else ("code-list.csv", "data/haefen.json")))
