#!/usr/bin/env python3
"""Build a pre-computed archive of MX-impacting tropical cyclones from
IBTrACS, NOAA's authoritative international best-track dataset.

Output: public/data/hurricanes-mx.json — GeoJSON FeatureCollection with
one LineString per qualifying storm, plus a metadata block. Each
feature carries (name, year, basin, maxCat, maxWindKt) for the
hist-storms overlay's color + label.

Filter criteria:
  - Year >= MIN_YEAR (default 1990, last ~35 seasons).
  - Basin in {NA, EP} — Atlantic + Eastern Pacific (the two that
    affect MX).
  - At least one track point inside MX_BBOX.
  - Max wind ≥ MIN_KT (default 34 kt = tropical storm).

We sample track points at ~6-h intervals to keep the file size
reasonable; the source CSV has 3-h fixes for newer storms.
"""
from __future__ import annotations

import csv
import io
import json
import os
import sys
import urllib.request
from typing import Optional

MIN_YEAR = int(os.environ.get('MIN_YEAR', '1990'))
MIN_KT = int(os.environ.get('MIN_KT', '34'))  # tropical storm
MX_BBOX = {'west': -118, 'south': 14, 'east': -85, 'north': 33}

# IBTrACS public access. Two regional files cover MX-relevant basins;
# combined they're ~30-50 MB but most rows fall outside MX_BBOX so the
# filtered output is < 1 MB.
URLS = [
    'https://www.ncei.noaa.gov/data/international-best-track-archive-for-climate-stewardship-ibtracs/v04r01/access/csv/ibtracs.NA.list.v04r01.csv',
    'https://www.ncei.noaa.gov/data/international-best-track-archive-for-climate-stewardship-ibtracs/v04r01/access/csv/ibtracs.EP.list.v04r01.csv',
]


def saffir_simpson(kt: int) -> int:
    """Max-wind (kt) → Saffir-Simpson cat (0 if <64; 1..5 thereafter)."""
    if kt >= 137:
        return 5
    if kt >= 113:
        return 4
    if kt >= 96:
        return 3
    if kt >= 83:
        return 2
    if kt >= 64:
        return 1
    return 0  # TS or weaker


def parse_float(s: str) -> Optional[float]:
    s = s.strip()
    if not s or s == ' ':
        return None
    try:
        return float(s)
    except ValueError:
        return None


def main() -> None:
    # Map SID → { name, year, basin, points: [(iso, lat, lng, wind)] }.
    storms: dict[str, dict] = {}

    for url in URLS:
        print(f'fetching {url}', file=sys.stderr)
        with urllib.request.urlopen(url, timeout=120) as r:  # noqa: S310
            data = r.read().decode('utf-8', errors='replace')
        # IBTrACS CSVs have two header lines (column names + units). Skip the
        # units line.
        lines = data.splitlines()
        if len(lines) < 3:
            continue
        header = lines[0]
        body = lines[2:]
        rdr = csv.DictReader([header] + body)
        for row in rdr:
            try:
                year = int((row.get('SEASON') or '0').strip())
            except ValueError:
                continue
            if year < MIN_YEAR:
                continue
            basin = (row.get('BASIN') or '').strip()
            if basin not in ('NA', 'EP'):
                continue
            sid = (row.get('SID') or '').strip()
            if not sid:
                continue
            lat = parse_float(row.get('LAT') or '')
            lng = parse_float(row.get('LON') or '')
            if lat is None or lng is None:
                continue
            iso = (row.get('ISO_TIME') or '').strip()
            wind = parse_float(row.get('WMO_WIND') or '') or 0
            usa_wind = parse_float(row.get('USA_WIND') or '') or 0
            kt = int(max(wind, usa_wind))
            s = storms.setdefault(
                sid,
                {
                    'name': (row.get('NAME') or 'UNNAMED').strip(),
                    'year': year,
                    'basin': basin,
                    'maxKt': 0,
                    'mxImpacting': False,
                    'points': [],
                },
            )
            if (
                MX_BBOX['west'] <= lng <= MX_BBOX['east']
                and MX_BBOX['south'] <= lat <= MX_BBOX['north']
            ):
                s['mxImpacting'] = True
            if kt > s['maxKt']:
                s['maxKt'] = kt
            s['points'].append((iso, lat, lng, kt))

    # Filter: must be MX-impacting AND reach MIN_KT at some point.
    qualifying = [
        s for s in storms.values() if s['mxImpacting'] and s['maxKt'] >= MIN_KT
    ]
    qualifying.sort(key=lambda s: (-s['year'], s['name']))

    # Build features. Sample points at ~6 h intervals to keep file size
    # reasonable. IBTrACS rows are 3 h for recent storms.
    features = []
    for s in qualifying:
        pts = sorted(s['points'], key=lambda p: p[0])
        # Stride: take every 2nd point (6 h from 3 h source).
        sampled = pts[::2]
        if len(sampled) < 2:
            continue
        coords = [[round(lng, 2), round(lat, 2)] for (_iso, lat, lng, _kt) in sampled]
        max_cat = saffir_simpson(s['maxKt'])
        features.append({
            'type': 'Feature',
            'properties': {
                'name': s['name'].title(),
                'year': s['year'],
                'basin': s['basin'],
                'maxCat': max_cat,
                'maxWindKt': s['maxKt'],
                'label': f"{s['name'].title()} {s['year']}",
            },
            'geometry': {'type': 'LineString', 'coordinates': coords},
        })

    fc = {
        'type': 'FeatureCollection',
        'features': features,
        'metadata': {
            'source': 'NOAA IBTrACS v04r01 (NA + EP basins)',
            'license': 'CC-BY 4.0 (NCEI)',
            'minYear': MIN_YEAR,
            'minWindKt': MIN_KT,
            'bbox': MX_BBOX,
            'count': len(features),
        },
    }
    out_path = 'public/data/hurricanes-mx.json'
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(fc, f, separators=(',', ':'), ensure_ascii=False)
    print(f'wrote {len(features)} MX-impacting storms to {out_path}', file=sys.stderr)


if __name__ == '__main__':
    main()
