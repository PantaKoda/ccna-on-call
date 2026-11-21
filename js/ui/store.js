// Player progress, kept in the browser's localStorage: story results, the
// spaced-review schedule for practice skills, studied topics and exam history.

import { LEVELS, TIERS } from "../game/levels/index.js";
import { SKILLS } from "../game/practice.js";

const KEY = "ccna-on-call-v1";
const XP_FACTOR = [0, 0.6, 0.8, 1];
const MIN = 60e3, DAY = 864e5;
// How long until a skill comes back, by mastery level 0-5.
export const INTERVALS = [15 * MIN, DAY, 3 * DAY, 7 * DAY, 16 * DAY, 35 * DAY];
export const MAX_BOX = INTERVALS.length - 1;

function load() {
  const fresh = { levels: {}, skills: {}, studied: {}, q: {}, prefs: {} };
  try { return Object.assign(fresh, JSON.parse(localStorage.getItem(KEY) || "{}")); }
  catch { return fresh; }
}
const data = load();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* storage unavailable */ } };

// Tickets closed before the review queue existed: queue their skills now, due
// straight away, so earlier progress is not left out of the reviews.
{
  let added = false;
  for (const s of SKILLS) {
    if (s.after && data.levels[s.after] && !data.skills[s.id]) { data.skills[s.id] = { box: 0, due: Date.now(), reps: 0 }; added = true; }
  }
  if (added) save();
}

const unlockAll = new URLSearchParams(location.search).get("unlock") === "all";
const skillsOf = topic => SKILLS.filter(s => s.topic === topic);

export const store = {
  // ---------------------------------------------------------- story
  result: id => data.levels[id] || null,
  isDone: id => !!data.levels[id],
  isUnlocked(id) {
    if (unlockAll) return true;
    const i = LEVELS.findIndex(l => l.id === id);
    return i <= 0 || store.isDone(LEVELS[i - 1].id);
  },
  nextLevel: () => LEVELS.find(l => !store.isDone(l.id)) || null,
  xpFor: (level, starCount) => Math.round(level.xp * XP_FACTOR[starCount]),

  // Records a finished level; keeps the best result. Returns the XP gained now.
  record(level, starCount, seconds) {
    const prev = data.levels[level.id];
    const xp = store.xpFor(level, starCount);
    const gained = Math.max(0, xp - (prev ? prev.xp : 0));
    data.levels[level.id] = {
      stars: Math.max(starCount, prev ? prev.stars : 0),
      xp: Math.max(xp, prev ? prev.xp : 0),
      best: prev && prev.best ? Math.min(prev.best, seconds) : seconds,
    };
    save();
    return gained;
  },

  totals() {
    let xp = 0, starCount = 0, done = 0;
    for (const l of LEVELS) {
      const r = data.levels[l.id];
      if (r) { xp += r.xp; starCount += r.stars; done++; }
    }
    return { xp, stars: starCount, done, maxXp: LEVELS.reduce((a, l) => a + l.xp, 0), maxStars: LEVELS.length * 3, count: LEVELS.length };
  },

  // Rank follows the highest tier you have fully cleared.
  rank() {
    let rank = TIERS[0].rank, tier = 1;
    for (const t of TIERS) {
      const all = LEVELS.filter(l => l.tier === t.id).every(l => store.isDone(l.id));
      if (!all) { rank = t.rank; tier = t.id; break; }
      rank = "Network Architect"; tier = TIERS.length + 1;
    }
    return { rank, tier };
  },

  // ---------------------------------------------------------- topics
  // A practice skill opens once the ticket that teaches it is reachable.
  skillOpen: skill => unlockAll || !skill.after || store.isUnlocked(skill.after),
  isStudied: topic => !!data.studied[topic],
  setStudied(topic, on) { if (on) data.studied[topic] = Date.now(); else delete data.studied[topic]; save(); },

  // ---------------------------------------------------------- spaced review
  skill: id => data.skills[id] || null,

  // Closing a ticket puts the skills it taught in the review queue (first
  // review after 15 minutes). Returns the skills that were newly added.
  introduce(levelId) {
    const added = [];
    for (const s of SKILLS.filter(k => k.after === levelId)) {
      if (data.skills[s.id]) continue;
      data.skills[s.id] = { box: 0, due: Date.now() + INTERVALS[0], reps: 0 };
      added.push(s);
    }
    if (added.length) save();
    return added;
  },

  // Record a practice run. "good" means solved with at most one hint.
  //  - good and due:      mastery goes up, the next review moves further away
  //  - good but early:    extra practice, the schedule is left alone
  //  - not good:          mastery drops a step and it comes back soon
  practiced(id, good) {
    const now = Date.now();
    const s = data.skills[id] || { box: -1, due: 0, reps: 0 };
    const wasDue = s.box < 0 || s.due <= now;
    const before = Math.max(0, s.box);
    if (!good) { s.box = Math.max(0, s.box - 1); s.due = now + INTERVALS[0]; }
    else if (wasDue) { s.box = Math.min(s.box + 1, MAX_BOX); s.due = now + INTERVALS[s.box]; }
    s.reps++;
    s.last = now;
    data.skills[id] = s;
    save();
    return { box: s.box, before, due: s.due, wasDue, good };
  },

  due(now = Date.now()) {
    return Object.entries(data.skills).filter(([id, s]) => s.due <= now && SKILLS.some(k => k.id === id)).sort((a, b) => a[1].due - b[1].due).map(([id]) => id);
  },
  upcoming(now = Date.now()) {
    const next = Object.entries(data.skills).filter(([id, s]) => s.due > now && SKILLS.some(k => k.id === id)).sort((a, b) => a[1].due - b[1].due)[0];
    return next ? { id: next[0], due: next[1].due } : null;
  },
  // Average mastery (0-5) over the topic's skills that are being tracked, or null.
  mastery(topic) {
    const boxes = skillsOf(topic).map(s => data.skills[s.id]).filter(Boolean).map(s => s.box);
    return boxes.length ? boxes.reduce((a, b) => a + b, 0) / skillsOf(topic).length : null;
  },

  // ---------------------------------------------------------- exam history
  questionResult(id, ok) { data.q[id] = ok ? 1 : 0; save(); },
  qstat: id => data.q[id],          // 1 = last answer right, 0 = wrong, undefined = never seen

  pref: (k, fallback) => (k in data.prefs ? data.prefs[k] : fallback),
  setPref(k, v) { data.prefs[k] = v; save(); },

  reset() { data.levels = {}; data.skills = {}; data.studied = {}; data.q = {}; save(); },
};

// "in 3 h", "in 2 days", "now"
export function untilText(due, now = Date.now()) {
  const ms = due - now;
  if (ms <= 0) return "now";
  if (ms < 90 * MIN) return `in ${Math.max(1, Math.round(ms / MIN))} min`;
  if (ms < 36 * 3600e3) return `in ${Math.round(ms / 3600e3)} h`;
  return `in ${Math.round(ms / DAY)} days`;
}
