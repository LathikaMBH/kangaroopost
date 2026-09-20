// Road-following lines for a route.
//
// The map used to draw a straight line from stop to stop. Here we ask Google's Routes API for the actual road (or
// cycle path) between each pair of consecutive stops. The result is saved with the route (see useRoadPath), so it is
// only requested when a route's stops change, never when a route is merely viewed.
//
// Travel mode: VITE_ROUTE_TRAVEL_MODE = BICYCLE (default) | WALK | DRIVE. Walking and cycling routes are in beta at
// Google, which requires showing MODE_WARNING next to the map.

const API_KEY = import.meta.env?.VITE_GOOGLE_MAPS_API_KEY || '';
const ENDPOINT = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const MODES = ['BICYCLE', 'WALK', 'DRIVE'];

export const TRAVEL_MODE = MODES.includes(String(import.meta.env?.VITE_ROUTE_TRAVEL_MODE || '').toUpperCase())
  ? String(import.meta.env.VITE_ROUTE_TRAVEL_MODE).toUpperCase()
  : 'BICYCLE';

// Google asks apps to show these for walking / bicycling routes
export const MODE_WARNING = {
  BICYCLE: "Bicycling directions are in beta. Use caution – this route may contain streets that aren't suited for bicycling.",
  WALK: 'Walking directions are in beta. Use caution – this route may be missing sidewalks or pedestrian paths.',
  DRIVE: '',
}[TRAVEL_MODE];

export const roadsAvailable = () => Boolean(API_KEY);

// ── encoded polyline (Google's format, 5 decimal places) ────────────────────────────────────────────────────────
export function decodePolyline(str) {
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

export function encodePolyline(points) {
  let out = '', prevLat = 0, prevLng = 0;
  const enc = v => { v = v < 0 ? ~(v << 1) : v << 1; let s = ''; while (v >= 0x20) { s += String.fromCharCode((0x20 | (v & 0x1f)) + 63); v >>= 5; } return s + String.fromCharCode(v + 63); };
  for (const [la, ln] of points) {
    const lat = Math.round(la * 1e5), lng = Math.round(ln * 1e5);
    out += enc(lat - prevLat) + enc(lng - prevLng);
    prevLat = lat; prevLng = lng;
  }
  return out;
}

// ── identifying a set of stops, so a saved road path can be matched to the stops it was computed for ──────────────
function hash53(str) {           // cyrb53: small, fast, good spread
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}
const coord = s => `${Number(s.lat).toFixed(6)},${Number(s.lng).toFixed(6)}`;
export const routeKey = (stops, mode = TRAVEL_MODE) => `${mode[0]}${hash53(stops.map(coord).join(';')).toString(36)}`;

// ── splitting a long route into requests ─────────────────────────────────────────────────────────────────────────
// One request may have an origin, a destination and up to 10 stops in between (12 points, 11 legs); beyond that the
// price goes up. A 40-stop route therefore becomes 4 requests that share their boundary stop.
export function chunkRanges(count, maxPoints = 12) {
  const ranges = [];
  for (let start = 0; start < count - 1;) { const end = Math.min(start + maxPoints - 1, count - 1); ranges.push([start, end]); start = end; }
  return ranges;
}

const chunkCache = new Map();   // an unchanged part of a route is not requested again while the page is open

class RoutesError extends Error {}

async function requestChunk(points, mode, apiKey) {
  const ll = p => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST', signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': 'routes.legs.polyline.encodedPolyline,routes.legs.distanceMeters' },
      body: JSON.stringify({ origin: ll(points[0]), destination: ll(points[points.length - 1]), intermediates: points.slice(1, -1).map(ll), travelMode: mode }),
    });
  } catch (e) { throw new RoutesError(e.name === 'AbortError' ? 'Routes API timed out' : `Routes API not reachable (${e.message})`); }
  finally { clearTimeout(timer); }

  // "no route between these points" is a real answer (keep a straight line there); anything else is a problem worth retrying later
  if (res.status === 400 || res.status === 404) return null;
  if (!res.ok) throw new RoutesError(`Routes API answered ${res.status}`);
  const legs = (await res.json())?.routes?.[0]?.legs;
  if (!legs || legs.length !== points.length - 1 || legs.some(l => !l.polyline?.encodedPolyline)) return null;
  return { legs: legs.map(l => decodePolyline(l.polyline.encodedPolyline)), meters: legs.reduce((n, l) => n + (l.distanceMeters || 0), 0) };
}

// → { legs: [ [ [lat,lng], ... ], ... ] (one array of points per pair of consecutive stops), meters }
export async function computeRoadLegs(stops, mode = TRAVEL_MODE, apiKey = API_KEY) {
  if (!apiKey) throw new RoutesError('No Google API key');
  const legs = []; let meters = 0;
  for (const [a, b] of chunkRanges(stops.length)) {
    const pts = stops.slice(a, b + 1);
    const ck = `${mode}|${pts.map(coord).join(';')}`;
    let got = chunkCache.get(ck);
    if (!got) {
      got = await requestChunk(pts, mode, apiKey);
      if (!got) got = { legs: pts.slice(0, -1).map((p, i) => [[p.lat, p.lng], [pts[i + 1].lat, pts[i + 1].lng]]), meters: 0, straight: true };
      if (chunkCache.size > 200) chunkCache.clear();
      chunkCache.set(ck, got);
    }
    legs.push(...got.legs); meters += got.meters;
  }
  return { legs, meters };
}
