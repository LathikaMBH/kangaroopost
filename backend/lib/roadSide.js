// KAN-55: which side of the road a mailbox is on, from the route's saved road path (the line along the roads between
// the stops). Stored as the compass bearing from the nearest point of the road to the box (0 = the box is north of the
// road, 90 = east ...). The rider app compares it with the rider's direction of travel: a box is on the rider's left
// when this bearing is about 90° to the left of where they are going. Works whichever way the road is driven.
const { decodePolyline } = require('./roadPath');

const MIN_METRES = 1.5;   // closer to the road line than this: too close to tell the side
const MAX_METRES = 30;    // further than this: the box is not on this road
const MAX_COS = 0.5;      // the box must be roughly beside the road (60°–120° from it), not ahead of it (a dead end, a corner)

// metres east/north of (lat0, lng0); exact enough over a few hundred metres
const project = (lat0, lng0) => {
  const kx = 111320 * Math.cos(lat0 * Math.PI / 180), ky = 110540;
  return ([lat, lng]) => [(lng - lng0) * kx, (lat - lat0) * ky];
};

// bearing (0–360) of a box from the road, or null when it can't be told. path: [[lat, lng], ...]
function sideBearing(box, path) {
  if (!path || path.length < 2) return null;
  const xy = project(box.lat, box.lng);
  let best = null;
  for (let i = 1; i < path.length; i++) {
    const [ax, ay] = xy(path[i - 1]), [bx, by] = xy(path[i]);
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    if (!len2) continue;
    const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));   // the box is at (0, 0)
    const fx = ax + t * dx, fy = ay + t * dy, dist = Math.hypot(fx, fy);
    if (!best || dist < best.dist) best = { dist, fx, fy, dx, dy };
  }
  if (!best || best.dist < MIN_METRES || best.dist > MAX_METRES) return null;
  const vx = -best.fx, vy = -best.fy;                                   // from the road to the box
  const cos = Math.abs(vx * best.dx + vy * best.dy) / (best.dist * Math.hypot(best.dx, best.dy));
  if (cos > MAX_COS) return null;
  return Math.round(((Math.atan2(vx, vy) * 180 / Math.PI) + 360) % 360 * 10) / 10;
}

// side bearing for each mailbox of a route, from its saved road path's legs (encoded polylines). Apartments get none:
// the rider confirms those by hand.
function routeSides(stops, legs) {
  const path = legs.flatMap(decodePolyline);
  return stops.map(s => ({ id: s.id, bearing: s.type === 'mailbox' ? sideBearing(s, path) : null }));
}

module.exports = { sideBearing, routeSides };
