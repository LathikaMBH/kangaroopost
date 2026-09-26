import { useEffect, useRef, useState } from 'react';
import { APIProvider, Map, AdvancedMarker, AdvancedMarkerAnchorPoint, Polyline, Circle, useMap } from '@vis.gl/react-google-maps';

// Google Maps for KangarooPost (create-route page + rider navigation).
// The API key lives in frontend/.env as VITE_GOOGLE_MAPS_API_KEY (see .env.example).
export const GOOGLE_MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
// Advanced markers need a Map ID. Google's DEMO_MAP_ID works for development; create your own for production.
const MAP_ID = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID';

// the app stores positions as [lat, lng]; Google wants { lat, lng }
export const toLL = p => (Array.isArray(p) ? { lat: p[0], lng: p[1] } : p);

function MapMessage({ title, children }) {
  return (
    <div style={{ position:'absolute', inset:0, background:'var(--el)', color:'var(--mut)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', textAlign:'center', padding:'14px 18px', gap:6, zIndex:5 }}>
      <i className="ti ti-map-off" style={{ fontSize:30, color:'var(--apt)' }} />
      <div style={{ fontWeight:700, fontSize:14, color:'var(--tx)' }}>{title}</div>
      <div style={{ fontSize:11.5, lineHeight:1.5, maxWidth:300 }}>{children}</div>
    </div>
  );
}

export default function MapCanvas({ center, zoom = 16, onMapClick, children }) {
  const [authFailed, setAuthFailed] = useState(false);

  // Google calls this global when it rejects the key (wrong key, billing off, API not enabled, referrer not allowed)
  useEffect(() => {
    window.gm_authFailure = () => setAuthFailed(true);
    return () => { delete window.gm_authFailure; };
  }, []);

  if (!GOOGLE_MAPS_KEY) {
    return (
      <div style={{ position:'relative', width:'100%', height:'100%' }}>
        <MapMessage title="Google Maps API key needed">
          Add <code>VITE_GOOGLE_MAPS_API_KEY=your_key</code> to <code>frontend/.env</code> and restart the frontend (<code>npm run dev</code>).
        </MapMessage>
      </div>
    );
  }

  return (
    <div style={{ position:'relative', width:'100%', height:'100%' }}>
      <APIProvider apiKey={GOOGLE_MAPS_KEY}>
        <Map
          mapId={MAP_ID}
          defaultCenter={toLL(center)}
          defaultZoom={zoom}
          gestureHandling="greedy"
          disableDefaultUI
          mapTypeControl
          clickableIcons={false}
          style={{ width:'100%', height:'100%' }}
          onClick={e => { const ll = e.detail?.latLng; if (ll && onMapClick) onMapClick(ll); }}
        >
          {children}
        </Map>
      </APIProvider>
      {authFailed && (
        <MapMessage title="Google rejected the API key">
          Check that the key is correct, the <b>Maps JavaScript API</b> is enabled, billing is on, and the key allows this site
          (<code>{window.location.origin}</code>).
        </MapMessage>
      )}
    </div>
  );
}

// Pan the map to a position (e.g. first GPS fix). Re-runs only when the position changes.
export function MapFocus({ target, zoom }) {
  const map = useMap();
  const t = target && toLL(target);
  useEffect(() => {
    if (!map || !t) return;
    map.panTo(t);
    if (zoom) map.setZoom(zoom);
  }, [map, t?.lat, t?.lng, zoom]);
  return null;
}

// Fit the map to show every position at once (e.g. a route's stops). Re-fits when the set of positions changes.
export function MapFitBounds({ positions, padding = 56 }) {
  const map = useMap();
  const key = positions?.map(p => { const ll = toLL(p); return `${ll?.lat},${ll?.lng}`; }).join(';');
  useEffect(() => {
    if (!map || !positions || positions.length === 0) return;
    if (positions.length === 1) { map.setCenter(toLL(positions[0])); map.setZoom(16); return; }
    const bounds = new window.google.maps.LatLngBounds();
    positions.forEach(p => bounds.extend(toLL(p)));
    map.fitBounds(bounds, padding);
  }, [map, key, padding]);
  return null;
}

// Follow a moving position (rider). First fix jumps + zooms in, afterwards it pans smoothly.
export function MapFollow({ pos, follow, zoom = 17 }) {
  const map = useMap();
  const first = useRef(true);
  const t = pos && toLL(pos);
  useEffect(() => {
    if (!map || !t || !follow) return;
    if (first.current) { map.setCenter(t); map.setZoom(zoom); first.current = false; }
    else map.panTo(t);
  }, [map, t?.lat, t?.lng, follow]);
  return null;
}

// Numbered round pin (same look as before: coloured circle, white border, number/✓ inside)
export function CircleMarker({ position, color, label, size = 32, onClick, zIndex }) {
  return (
    <AdvancedMarker position={toLL(position)} anchorPoint={AdvancedMarkerAnchorPoint.CENTER} onClick={onClick} zIndex={zIndex}>
      <div style={{ width:size, height:size, borderRadius:'50%', background:color, border:'2.5px solid white', display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontWeight:700, fontSize: size < 28 ? 10 : 12, boxShadow:'0 2px 8px rgba(0,0,0,0.4)', cursor: onClick ? 'pointer' : 'default' }}>
        {label}
      </div>
    </AdvancedMarker>
  );
}

// "You are here" blue dot
export function DotMarker({ position, size = 22 }) {
  return (
    <AdvancedMarker position={toLL(position)} anchorPoint={AdvancedMarkerAnchorPoint.CENTER} zIndex={1000}>
      <div style={{ width:size, height:size, borderRadius:'50%', background:'#4285F4', border:'3px solid white', boxShadow:'0 0 0 4px rgba(66,133,244,0.25)' }} />
    </AdvancedMarker>
  );
}

// Line through a list of [lat, lng] points, solid or dashed
export function RouteLine({ path, color, weight = 3, opacity = 1, dashed = false }) {
  if (!path || path.length < 2) return null;
  const pts = path.map(toLL);
  if (!dashed) return <Polyline path={pts} strokeColor={color} strokeWeight={weight} strokeOpacity={opacity} clickable={false} />;
  // Google has no dashArray: draw repeating short strokes as line "icons" instead
  return (
    <Polyline path={pts} strokeOpacity={0} clickable={false}
      icons={[{ icon: { path: 'M 0,-1 0,1', strokeOpacity: opacity, strokeColor: color, scale: weight }, offset: '0', repeat: '14px' }]} />
  );
}

// Circle with a radius in metres (used for the 20 m mailbox detection zone)
export function RadiusCircle({ center, radius, color }) {
  return <Circle center={toLL(center)} radius={radius} strokeColor={color} strokeOpacity={0.8} strokeWeight={2} fillColor={color} fillOpacity={0.08} clickable={false} />;
}
