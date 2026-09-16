"""Trim src/zcta.json (Esri JSON, NAD83 State Plane MO West ft, ~500 ZCTAs)
down to the ZIPs touching the 6-county KC region, reprojected to WGS84 and
simplified, for the map's ZIP overlay (src/assets/zcta_kc.geojson).

Runs fully offline: python prep_zcta.py

Pure Python + pyproj on purpose: shapely's GEOS build in the ArcGIS Pro
python clone segfaults on these geometries.
"""

import json
from pathlib import Path

from pyproj import Transformer

SRC = Path("src/zcta.json")
OUT = Path("src/assets/zcta_kc.geojson")

# Rough lon/lat bounds of Wyandotte, Johnson, Platte, Clay, Jackson, and Cass
# counties. A ZIP is kept if its bounding box overlaps this one.
REGION = (-95.06, 38.45, -93.96, 39.61)  # xmin, ymin, xmax, ymax

# ~10 m in degrees; drops state-plane vertex noise without visibly moving
# boundaries (or opening gaps between neighboring ZIPs) at map zoom levels.
SIMPLIFY_TOLERANCE = 0.0001

# 5 decimal places is ~1 m.
PLACES = 5

to_wgs84 = Transformer.from_crs("ESRI:102698", "EPSG:4326", always_xy=True)


def signed_area(ring):
    # Shoelace; positive = counter-clockwise.
    return sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(ring, ring[1:])) / 2


def point_in_ring(pt, ring):
    x, y = pt
    inside = False
    for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            inside = not inside
    return inside


def simplify(points, tol):
    """Douglas-Peucker on an open polyline (iterative, so no recursion limit)."""
    if len(points) < 3:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        a, b = stack.pop()
        (ax, ay), (bx, by) = points[a], points[b]
        dx, dy = bx - ax, by - ay
        seg = (dx * dx + dy * dy) ** 0.5
        best, best_i = 0.0, None
        for i in range(a + 1, b):
            px, py = points[i]
            d = (
                abs(dy * px - dx * py + bx * ay - by * ax) / seg
                if seg
                else ((px - ax) ** 2 + (py - ay) ** 2) ** 0.5
            )
            if d > best:
                best, best_i = d, i
        if best_i is not None and best > tol:
            keep[best_i] = True
            stack += [(a, best_i), (best_i, b)]
    return [p for p, k in zip(points, keep) if k]


def to_geojson_geometry(esri_rings):
    rings = []
    for ring in esri_rings:
        xs, ys = zip(*ring)
        lon, lat = to_wgs84.transform(xs, ys)
        pts = list(zip(lon, lat))
        if pts[0] != pts[-1]:
            pts.append(pts[0])
        # Simplify as an open line so the closing vertex is always kept.
        pts = simplify(pts, SIMPLIFY_TOLERANCE)
        pts = [(round(x, PLACES), round(y, PLACES)) for x, y in pts]
        if len(pts) >= 4 and signed_area(pts) != 0:
            rings.append(pts)

    # Esri: clockwise = outer, counter-clockwise = hole. GeoJSON (RFC 7946)
    # wants the opposite winding, and holes grouped under their outer ring.
    outers = [[r[::-1]] for r in rings if signed_area(r) < 0]
    for hole in (r for r in rings if signed_area(r) > 0):
        owner = next((o for o in outers if point_in_ring(hole[0], o[0])), None)
        if owner:
            owner.append(hole[::-1])
    if not outers:
        return None
    if len(outers) == 1:
        return {"type": "Polygon", "coordinates": outers[0]}
    return {"type": "MultiPolygon", "coordinates": outers}


def overlaps_region(geometry):
    polys = (
        [geometry["coordinates"]]
        if geometry["type"] == "Polygon"
        else geometry["coordinates"]
    )
    xs = [x for poly in polys for x, _ in poly[0]]
    ys = [y for poly in polys for _, y in poly[0]]
    xmin, ymin, xmax, ymax = REGION
    return min(xs) <= xmax and max(xs) >= xmin and min(ys) <= ymax and max(ys) >= ymin


def main():
    data = json.loads(SRC.read_text())
    features = []
    for f in data["features"]:
        geometry = to_geojson_geometry(f["geometry"]["rings"])
        if geometry is None or not overlaps_region(geometry):
            continue
        features.append(
            {
                "type": "Feature",
                "properties": {"ZIP": f["attributes"]["GeoID"]},
                "geometry": geometry,
            }
        )

    features.sort(key=lambda feat: feat["properties"]["ZIP"])
    OUT.write_text(
        json.dumps({"type": "FeatureCollection", "features": features}, separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"{len(features)} ZIPs -> {OUT} ({OUT.stat().st_size / 1e6:.2f} MB)")


if __name__ == "__main__":
    main()
