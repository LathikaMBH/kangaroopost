import { useEffect, useMemo, useState } from 'react';
import api from './api';
import { TRAVEL_MODE, roadsAvailable, routeKey, computeRoadLegs, decodePolyline, encodePolyline } from './roads';

const failedKeys = new Set();   // sets of stops that failed once: do not hammer Google for them again this session

// The road-following line for a route's stops.
//   saved   : the route's saved road path from the server ({ key, mode, legs }) — used as is when it matches the stops
//   canSave : may this user store a newly computed path (owner, admin, assigned rider)?
// Returns { legs, status }: legs is an array (one array of [lat,lng] per pair of stops) or null → draw straight lines.
// A path is only requested when the stops changed and no saved path matches, and only after the stops stopped
// changing for a moment (so pinning several stops in a row costs one request, not one per tap).
export default function useRoadPath({ routeId, stops, saved, canSave = false, enabled = true }) {
  const mode = TRAVEL_MODE;
  const key = useMemo(() => (stops.length >= 2 ? routeKey(stops, mode) : null), [stops, mode]);
  const [state, setState] = useState({ key: null, legs: null, status: 'idle' });

  useEffect(() => {
    if (!enabled || !key || !roadsAvailable()) return;
    if (saved?.key === key && Array.isArray(saved.legs)) { setState({ key, legs: saved.legs.map(decodePolyline), status: 'ready' }); return; }
    if (state.key === key && state.legs) return;                       // already computed for these stops
    if (failedKeys.has(key)) { setState({ key, legs: null, status: 'fallback' }); return; }

    let cancelled = false;
    setState({ key, legs: null, status: 'loading' });
    const timer = setTimeout(async () => {
      try {
        const { legs, meters } = await computeRoadLegs(stops, mode);
        if (cancelled) return;
        setState({ key, legs, status: 'ready' });
        if (canSave && routeId) api.saveRoadPath(routeId, { key, mode, legs: legs.map(encodePolyline), meters }).catch(() => {});
      } catch (e) {
        if (cancelled) return;
        failedKeys.add(key);
        setState({ key, legs: null, status: 'fallback' });
        console.warn('Road path unavailable, drawing straight lines:', e.message);
      }
    }, 900);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [key, enabled, routeId, canSave, saved?.key]);   // eslint-disable-line react-hooks/exhaustive-deps

  return { legs: state.key === key ? state.legs : null, status: key ? (state.key === key ? state.status : 'loading') : 'idle', mode };
}
