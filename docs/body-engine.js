// Camera contact is an estimate, never a measurement of impact or force.
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const distance = (a, b, aspect = 1) => Math.hypot((a[0] - b[0]) * aspect, a[1] - b[1]);
const blend = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const other = hand => hand === 'Left' ? 'Right' : 'Left';
const valid = point => point && Number.isFinite(point.x) && Number.isFinite(point.y)
  && point.x >= -.05 && point.x <= 1.05 && point.y >= -.05 && point.y <= 1.05
  && (point.visibility ?? 1) >= .6 && (point.presence ?? 1) >= .6;

export function bodyObservation(landmarks, aspect = 4 / 3) {
  if (!landmarks || landmarks.length !== 33) return null;
  const point = index => [1 - landmarks[index].x, landmarks[index].y];
  const arms = {};
  for (const [hand, elbow, wrist, pinky, index] of [['Left', 13, 15, 17, 19], ['Right', 14, 16, 18, 20]]) {
    if (![elbow, wrist, pinky, index].every(i => valid(landmarks[i]))) continue;
    const end = point(wrist), start = point(elbow), length = distance(start, end, aspect);
    if (length < .075) continue;
    arms[hand] = {wrist: end, elbow: start, palm: blend(end, blend(point(pinky), point(index), .5), .65), length};
  }
  return {arms, aspect};
}

function project(point, start, end, aspect) {
  const dx = (end[0] - start[0]) * aspect, dy = end[1] - start[1];
  const t = ((point[0] - start[0]) * aspect * dx + (point[1] - start[1]) * dy) / (dx * dx + dy * dy);
  return {t, cursor: blend(start, end, clamp(t, 0, 1))};
}

class StrikeGate {
  constructor() { this.reset(); }
  reset() { this.previous = null; this.openSince = null; this.armed = false; this.lastHit = -Infinity; }
  update(t, gap, entry, exit) {
    const previous = this.previous;
    this.previous = {t, gap};
    const speed = previous ? (previous.gap - gap) / (t - previous.t) : 0;
    if (gap >= exit) {
      this.openSince ??= t;
      if (t - this.openSince >= .025) this.armed = true;
    } else this.openSince = null;
    if (gap > entry || !this.armed) return null;
    // Consume every contact edge, including slow placement: jitter cannot turn
    // an already touching pair into a strike on the following frame.
    this.armed = false;
    if (!previous || speed < .45 || t - this.lastHit < .13) return null;
    this.lastHit = t;
    return clamp(.28 + speed / 14, .3, 1);
  }
}

export class BodyPercussion {
  constructor() { this.sensitivity = 1; this.reset(); }
  reset() {
    this.gates = {hands: new StrikeGate(), Left: new StrikeGate(), Right: new StrikeGate()};
    this.previous = null; this.last = -Infinity; this.arms = {};
    this.hint = 'Show both elbows and hands'; this.lastEvent = null;
  }
  update(observation, t) {
    if (!Number.isFinite(t) || t <= this.last) return [];
    if (t - this.last > .22) this.reset();
    this.last = t;
    const arms = observation?.arms ?? {}, aspect = observation?.aspect ?? 4 / 3;
    this.arms = arms;
    if (!arms.Left || !arms.Right) {
      // No extrapolated contacts through occlusion or a newly acquired pose.
      for (const gate of Object.values(this.gates)) gate.reset();
      this.previous = null; this.hint = 'Show both elbows and hands'; return [];
    }
    const sensitivity = clamp(this.sensitivity, .75, 1.35);
    const scale = (arms.Left.length + arms.Right.length) / 2;
    const gap = distance(arms.Left.palm, arms.Right.palm, aspect) / scale;
    const pairExpression = this.gates.hands.update(t, gap, .42 * sensitivity, .68 * sensitivity);
    const movement = hand => this.previous
      ? distance(arms[hand].palm, this.previous[hand].palm, aspect) : 0;
    const actor = movement('Left') >= movement('Right') ? 'Left' : 'Right';
    const direction = this.previous && arms[actor].palm[1] < this.previous[actor].palm[1] ? 'up' : 'down';
    const candidates = [];
    if (pairExpression !== null) {
      const cursor = blend(arms.Left.palm, arms.Right.palm, .5);
      candidates.push({kind: 'hands', hand: actor, direction, expression: pairExpression, cursor,
        index: clamp(Math.floor((.85 - cursor[1]) / .6 * 8), 0, 7), zone: direction === 'up' ? 3 : 1});
    }
    for (const target of ['Left', 'Right']) {
      const arm = arms[target], hand = other(target), palm = arms[hand].palm;
      const projection = project(palm, arm.wrist, arm.elbow, aspect);
      if (projection.t < .14 || projection.t > 1.04) { this.gates[target].reset(); continue; }
      const contactGap = distance(palm, projection.cursor, aspect) / arm.length;
      const expression = this.gates[target].update(t, contactGap, .23 * sensitivity, .43 * sensitivity);
      if (expression !== null && pairExpression === null && gap > .42 * sensitivity) {
        const zone = clamp(Math.floor((projection.t - .14) / .86 * 4), 0, 3);
        candidates.push({kind: 'forearm', hand, target, zone, index: zone + (target === 'Right' ? 4 : 0),
          expression, direction, cursor: projection.cursor, gap: contactGap});
      }
    }
    this.previous = structuredClone(arms);
    // A single physical collision can overlap two projected zones. Emit once.
    const event = candidates.sort((a, b) => (a.gap ?? -1) - (b.gap ?? -1))[0];
    this.hint = event ? 'Tap registered · separate to play again'
      : this.gates.hands.armed ? 'Ready · tap hands or the opposite forearm' : 'Separate hands between taps';
    if (!event) return [];
    this.lastEvent = {...event, time: t};
    return [this.lastEvent];
  }
}
