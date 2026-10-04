// Server-side helpers for a route's saved road path ({ key, mode, legs, meters }, see routes PUT /:id/road-path).
// routeKey and the polyline format must stay identical to frontend/src/services/roads.js.

// ── encoded polyline (Google's format, 5 decimal places) ────────────────────────────────────────────────────────
function decodePolyline(str) {
  const points = []; let i = 0, lat = 0, lng = 0;
  while (i < str.length) {
    for (const axis of ['lat', 'lng']) {
      let shift = 0, result = 0, b;
      do { b = str.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20 && i <= str.length);
      const delta = (result & 1) ? ~(result >> 1) : (result >> 1);
      if (axis === 'lat') lat += delta; else lng += delta;
    }
    points.push([lat / 1e5, lng / 1e5]);
  }
  return points;
}

function encodePolyline(points) {
  let out = '', prevLat = 0, prevLng = 0;
  const enc = v => { v = v < 0 ? ~(v << 1) : v << 1; let s = ''; while (v >= 0x20) { s += String.fromCharCode((0x20 | (v & 0x1f)) + 63); v >>= 5; } return s + String.fromCharCode(v + 63); };
  for (const [la, ln] of points) {
    const lat = Math.round(la * 1e5), lng = Math.round(ln * 1e5);
    out += enc(lat - prevLat) + enc(lng - prevLng);
    prevLat = lat; prevLng = lng;
  }
  return out;
}

// ── which stops a saved road path was computed for ──────────────────────────────────────────────────────────────
function hash53(str) {           // cyrb53
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}
const coord = s => `${Number(s.lat).toFixed(6)},${Number(s.lng).toFixed(6)}`;
const routeKey = (stops, mode) => `${mode[0]}${hash53(stops.map(coord).join(';')).toString(36)}`;

// true when the saved road path still matches the route's stops (in route order)
const isCurrent = (roadPath, stops) =>
  Boolean(roadPath?.key && roadPath.mode && stops.length >= 2 && routeKey(stops, roadPath.mode) === roadPath.key);

// All legs joined into one line, so where one leg ends and the next begins (a stop) is not visible in the data.
function joinLegs(legs) {
  const points = [];
  for (const leg of legs) {
    for (const p of decodePolyline(leg)) {
      const last = points[points.length - 1];
      if (!last || last[0] !== p[0] || last[1] !== p[1]) points.push(p);
    }
  }
  return encodePolyline(points);
}

module.exports = { decodePolyline, encodePolyline, routeKey, isCurrent, joinLegs };
