import { useEffect, useRef, useState } from 'react';
import { TRAVEL_MODE, roadsAvailable, computeRoadLegs } from './roads';

// Google Maps app/website travel modes for the "Open in Google Maps" link
const MAPS_MODE = { BICYCLE: 'bicycling', WALK: 'walking', DRIVE: 'driving' }[TRAVEL_MODE];

// Link that opens turn-by-turn directions from the device's location to a position
export const directionsUrl = to =>
  `https://www.google.com/maps/dir/?api=1&destination=${to.lat},${to.lng}&travelmode=${MAPS_MODE}`;

// Road path between two positions ({ lat, lng }) → { path, meters, status: 'ready' | 'straight' }
async function roadBetween(origin, target) {
  const straight = { path: [[origin.lat, origin.lng], [target.lat, target.lng]], meters: 0, status: 'straight' };
  if (!roadsAvailable()) return straight;
  try {
    const { legs, meters } = await computeRoadLegs([origin, target]);
    // computeRoadLegs answers a straight line with 0 metres when Google has no road between the two points
    return meters > 0 ? { path: legs[0], meters, status: 'ready' } : straight;
  } catch (e) {
    console.warn('Directions unavailable, drawing a straight line:', e.message);
    return straight;
  }
}

// Road directions from the user's current location to one target ({ lat, lng }).
//   nonce : bump it to ask again (e.g. the same stop clicked twice → fresh GPS fix)
// Returns { origin, path, meters, status }:
//   status 'idle' | 'locating' | 'loading' | 'ready' | 'straight' (no road found / Routes API unavailable)
//          | 'no-location' (GPS denied or unavailable)
//   path   [ [lat,lng], ... ] from origin to target, or null
export default function useDirections(target, nonce) {
  const [state, setState] = useState({ origin: null, path: null, meters: 0, status: 'idle' });

  useEffect(() => {
    if (!target) { setState({ origin: null, path: null, meters: 0, status: 'idle' }); return; }
    if (!navigator.geolocation) { setState({ origin: null, path: null, meters: 0, status: 'no-location' }); return; }

    let cancelled = false;
    setState({ origin: null, path: null, meters: 0, status: 'locating' });
    navigator.geolocation.getCurrentPosition(async pos => {
      if (cancelled) return;
      const origin = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      if (roadsAvailable()) setState({ origin, path: null, meters: 0, status: 'loading' });
      const road = await roadBetween(origin, target);
      if (!cancelled) setState({ origin, ...road });
    }, err => {
      if (cancelled) return;
      console.warn('GPS:', err.message);
      setState({ origin: null, path: null, meters: 0, status: 'no-location' });
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
    return () => { cancelled = true; };
  }, [target?.lat, target?.lng, nonce]);   // eslint-disable-line react-hooks/exhaustive-deps

  return state;
}

// ── following a moving rider to one target ───────────────────────────────────────────────────────────────────────
const OFF_PATH_M = 40;       // further than this from the drawn road → the rider took another way, ask again
const RETRY_MOVED_M = 150;   // after a straight-line answer, ask again once the rider has moved this far
const MIN_GAP_MS = 20000;    // never ask Google more often than this

// metres → local flat x/y around a latitude (fine for the few kilometres to a first stop)
const flat = (lat0, [lat, lng]) => [lng * 111320 * Math.cos(lat0 * Math.PI / 180), lat * 110540];

// Nearest point of a path to p → { dist (metres), seg (index of the segment it lies on), at ([lat,lng]) }
export function nearestOnPath(p, path) {
  const P = flat(p[0], p);
  let best = { dist: Infinity, seg: 0, at: path[0] };
  for (let i = 0; i < path.length - 1; i++) {
    const A = flat(p[0], path[i]), B = flat(p[0], path[i + 1]);
    const dx = B[0] - A[0], dy = B[1] - A[1], len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((P[0] - A[0]) * dx + (P[1] - A[1]) * dy) / len2)) : 0;
    const d = Math.hypot(A[0] + t * dx - P[0], A[1] + t * dy - P[1]);
    if (d < best.dist) {
      const [la, ln] = path[i], [lb, nb] = path[i + 1];
      best = { dist: d, seg: i, at: [la + t * (lb - la), ln + t * (nb - ln)] };
    }
  }
  return best;
}

// Road path from a moving position (pos: [lat,lng], e.g. the rider's GPS) to a target ({ lat, lng }).
// Google is asked once, then only again when the rider leaves that road (or after a straight-line answer, once they
// have moved on), at most every MIN_GAP_MS. In between, the drawn path starts at the rider and loses the part they
// have already covered.
// Returns { path, status }: status 'idle' | 'loading' | 'ready' | 'straight'; path [ [lat,lng], ... ] or null
export function useApproachPath(pos, target) {
  const [road, setRoad] = useState(null);   // { from: [lat,lng], path, status } of the last answer
  const asking = useRef(false), lastAsk = useRef(0), gen = useRef(0);   // gen: answers for an older target are dropped
  const tKey = target ? `${target.lat},${target.lng}` : '';

  useEffect(() => { gen.current++; asking.current = false; lastAsk.current = 0; setRoad(null); }, [tKey]);

  useEffect(() => {
    if (!pos || !target || asking.current) return;
    if (road) {
      const off = road.status === 'ready'
        ? nearestOnPath(pos, road.path).dist > OFF_PATH_M
        : roadsAvailable() && nearestOnPath(pos, [road.from, road.from]).dist > RETRY_MOVED_M;
      if (!off || Date.now() - lastAsk.current < MIN_GAP_MS) return;
    }
    // not cancelled when the rider moves on: GPS updates come faster than Google answers
    asking.current = true; lastAsk.current = Date.now();
    const g = gen.current, from = [pos[0], pos[1]];
    roadBetween({ lat: from[0], lng: from[1] }, target).then(r => {
      if (g !== gen.current) return;
      asking.current = false;
      setRoad({ from, path: r.path, status: r.status });
    });
  }, [pos?.[0], pos?.[1], tKey, road]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (!pos || !target) return { path: null, status: 'idle' };
  if (!road) return { path: [pos, [target.lat, target.lng]], status: roadsAvailable() ? 'loading' : 'straight' };
  if (road.status !== 'ready') return { path: [pos, [target.lat, target.lng]], status: road.status };
  const near = nearestOnPath(pos, road.path);
  return { path: [pos, near.at, ...road.path.slice(near.seg + 1)], status: 'ready' };
}
