import { useEffect, useState } from 'react';
import { TRAVEL_MODE, roadsAvailable, computeRoadLegs } from './roads';

// Google Maps app/website travel modes for the "Open in Google Maps" link
const MAPS_MODE = { BICYCLE: 'bicycling', WALK: 'walking', DRIVE: 'driving' }[TRAVEL_MODE];

// Link that opens turn-by-turn directions from the device's location to a position
export const directionsUrl = to =>
  `https://www.google.com/maps/dir/?api=1&destination=${to.lat},${to.lng}&travelmode=${MAPS_MODE}`;

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
      const straight = [[origin.lat, origin.lng], [target.lat, target.lng]];
      if (!roadsAvailable()) { setState({ origin, path: straight, meters: 0, status: 'straight' }); return; }
      setState({ origin, path: null, meters: 0, status: 'loading' });
      try {
        const { legs, meters } = await computeRoadLegs([origin, target]);
        if (cancelled) return;
        // computeRoadLegs answers a straight line with 0 metres when Google has no road between the two points
        setState({ origin, path: legs[0], meters, status: meters > 0 ? 'ready' : 'straight' });
      } catch (e) {
        if (cancelled) return;
        console.warn('Directions unavailable, drawing a straight line:', e.message);
        setState({ origin, path: straight, meters: 0, status: 'straight' });
      }
    }, err => {
      if (cancelled) return;
      console.warn('GPS:', err.message);
      setState({ origin: null, path: null, meters: 0, status: 'no-location' });
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
    return () => { cancelled = true; };
  }, [target?.lat, target?.lng, nonce]);   // eslint-disable-line react-hooks/exhaustive-deps

  return state;
}
