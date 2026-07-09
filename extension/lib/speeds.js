/**
 * Speed ladder for AUTO-THROTTLE.
 * Slow = way under the scorer. Fast = full send (still observed).
 */

export const SPEEDS = [
  {
    id: "molasses",
    name: "Molasses",
    sub: "in January",
    emoji: "🧊",
    gapMs: 9000,
    serialize: true,
    staggerMs: 900,
    blurb: "Way below throttle. Thick. Patient. Survives winter.",
  },
  {
    id: "water",
    name: "Water",
    sub: "room temp",
    emoji: "💧",
    gapMs: 4500,
    serialize: true,
    staggerMs: 600,
    blurb: "Flows without drama. Soft gates rarely notice.",
  },
  {
    id: "brisk",
    name: "Brisk Walk",
    sub: "coffee in hand",
    emoji: "🚶",
    gapMs: 2500,
    serialize: true,
    staggerMs: 400,
    blurb: "Human pace with intent. Default safe cruise.",
  },
  {
    id: "job",
    name: "The Job",
    sub: "paid to ship",
    emoji: "💼",
    gapMs: 1200,
    serialize: true,
    staggerMs: 300,
    blurb: "Production cadence. Work the grid, don’t redline it.",
  },
  {
    id: "highway_star",
    name: "Highway Star",
    sub: "Deep Purple",
    emoji: "🎸",
    gapMs: 600,
    serialize: true,
    staggerMs: 200,
    blurb: "Spicy. Still serialized. Feel the engine, not the wall.",
  },
  {
    id: "black_beauty",
    name: "Black Beauty",
    sub: "full gallop",
    emoji: "🐎",
    gapMs: 300,
    serialize: true,
    staggerMs: 120,
    blurb: "Fast horse. Beautiful until the hard gate.",
  },
  {
    id: "casey_jones",
    name: "Casey Jones",
    sub: "danger at the wheel",
    emoji: "🚂",
    gapMs: 0,
    serialize: false,
    staggerMs: 0,
    blurb: "Full send. Parallel fan-out. You asked for the train wreck.",
  },
];

export const SPEED_BY_ID = Object.fromEntries(SPEEDS.map((s) => [s.id, s]));

/** Index on ladder 0=molasses … 6=casey */
export function speedIndex(id) {
  const i = SPEEDS.findIndex((s) => s.id === id);
  return i < 0 ? 3 : i;
}

export function speedByIndex(i) {
  const n = Math.max(0, Math.min(SPEEDS.length - 1, i));
  return SPEEDS[n];
}

/**
 * Auto policy: start mid-ladder, downshift hard on soft/hard, climb on clean OK streaks.
 */
export function nextAutoIndex(currentIndex, signal, okStreak) {
  let i = currentIndex;
  if (signal === "hard") return 0; // molasses
  if (signal === "soft") return Math.max(0, i - 2);
  if (signal === "ok") {
    if (okStreak >= 8 && i < 4) return i + 1; // climb toward job/highway
    if (okStreak >= 16 && i < 5) return i + 1;
    return i;
  }
  return i;
}

export const DEFAULT_SPEED_ID = "job";
export const HARD_COOLDOWN_MS = 12 * 60 * 1000; // 12 min sticky respect
export const SOFT_BUMP_GAP_MS = 3000; // extra pause after soft
