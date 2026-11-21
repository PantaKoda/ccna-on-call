// Player progress, kept in the browser's localStorage: story results, how many
// random variants of each lab were solved, studied topics and exam history.

import { LEVELS, TIERS } from "../game/levels/index.js";

const KEY = "ccna-on-call-v1";
const XP_FACTOR = [0, 0.6, 0.8, 1];

function load() {
  const fresh = { levels: {}, variants: {}, studied: {}, q: {}, prefs: {} };
  try {
    const data = Object.assign(fresh, JSON.parse(localStorage.getItem(KEY) || "{}"));
    delete data.skills;      // left over from the review queue of version 0.3
    return data;
  } catch { return fresh; }
}
const data = load();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* storage unavailable */ } };

const unlockAll = new URLSearchParams(location.search).get("unlock") === "all";

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

  // ---------------------------------------------------------- random variants
  // A lab's variants open once its original has been solved.
  variantsOpen: levelId => unlockAll || store.isDone(levelId),
  variantCount: levelId => data.variants[levelId] || 0,
  variantSolved(levelId) { data.variants[levelId] = (data.variants[levelId] || 0) + 1; save(); return data.variants[levelId]; },

  // ---------------------------------------------------------- topics and exams
  isStudied: topic => !!data.studied[topic],
  setStudied(topic, on) { if (on) data.studied[topic] = Date.now(); else delete data.studied[topic]; save(); },

  questionResult(id, ok) { data.q[id] = ok ? 1 : 0; save(); },
  qstat: id => data.q[id],          // 1 = last answer right, 0 = wrong, undefined = never seen

  pref: (k, fallback) => (k in data.prefs ? data.prefs[k] : fallback),
  setPref(k, v) { data.prefs[k] = v; save(); },

  reset() { data.levels = {}; data.variants = {}; data.studied = {}; data.q = {}; save(); },
};
