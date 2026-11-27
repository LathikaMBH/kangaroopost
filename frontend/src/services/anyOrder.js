// KAN-55: delivering in any order. A mailbox is marked when the rider is near it and it is on the rider's left (the
// driver's window) for the way they are going, so on a road with boxes on both sides only the side being delivered is
// marked: one side on the way out, the other on the way back. Each box's side is saved as the compass bearing from the
// road to the box (side_bearing, worked out by the server from the road path); null = no side, marked either way.
import { getDistance, PROXIMITY_METRES } from './gps';

export const HEADING_METRES = 12;   // the direction of travel is taken over at least this far
const FAST_ENOUGH = 2;              // m/s: from here the phone's own heading is good enough

// compass bearing (0–360) from a to b ([lat, lng])
export function bearing(a, b) {
  const φ1 = a[0] * Math.PI / 180, φ2 = b[0] * Math.PI / 180, Δλ = (b[1] - a[1]) * Math.PI / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2), x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

// is a box whose side bearing is `side` on the left of a rider heading `heading`? Left is 90° anticlockwise of the
// heading; a box more than 70° off that (ahead of or behind the rider, e.g. while turning) does not count.
export function onLeft(side, heading) {
  const d = (side - heading + 360) % 360;
  return d >= 200 && d <= 340;
}

// The rider's direction of travel. When they stop, the last direction they were moving in is kept.
export function createHeading() {
  let anchor = null, heading = null;
  return {
    update(pos, coords = {}) {
      if (Number.isFinite(coords.heading) && Number.isFinite(coords.speed) && coords.speed >= FAST_ENOUGH) {
        heading = coords.heading; anchor = pos;
      } else if (!anchor) anchor = pos;
      else if (getDistance(anchor[0], anchor[1], pos[0], pos[1]) >= HEADING_METRES) { heading = bearing(anchor, pos); anchor = pos; }
      return heading;
    },
    get: () => heading,
  };
}

// the undelivered mailbox to mark at this position: the nearest within range that is on the rider's left, or has no
// side. A box with a side waits until the direction of travel is known.
export function pickMailbox(stops, delivered, pos, heading) {
  let best = null;
  for (const s of stops) {
    if (s.type !== 'mailbox' || delivered.has(s.id)) continue;
    const dist = getDistance(pos[0], pos[1], s.lat, s.lng);
    if (dist > PROXIMITY_METRES) continue;
    if (s.side_bearing != null && (heading == null || !onLeft(s.side_bearing, heading))) continue;
    if (!best || dist < best.dist) best = { stop: s, dist };
  }
  return best?.stop || null;
}

// the nearest undelivered apartment within `range` metres, or null
export function nearApartment(stops, delivered, pos, range = PROXIMITY_METRES) {
  let best = null;
  for (const s of stops) {
    if (s.type !== 'apartment' || delivered.has(s.id)) continue;
    const dist = getDistance(pos[0], pos[1], s.lat, s.lng);
    if (dist <= range && (!best || dist < best.dist)) best = { stop: s, dist };
  }
  return best?.stop || null;
}

// "north side" etc. for a side bearing, for the route owner
export function sideLabel(side) {
  if (side == null) return 'no side';
  return ['north', 'east', 'south', 'west'][Math.round(side / 90) % 4] + ' side';
}
