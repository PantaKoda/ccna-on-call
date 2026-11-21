// Player progress, kept in the browser's localStorage: which exam version is
// being studied, story results, how many random variants of each lab were
// solved, studied topics and exam history. Progress is shared between the two
// exam versions; the version only decides what is shown.

import { LEVELS, TIERS } from "../game/levels/index.js";
import { EXAMS } from "../game/topics.js";

const KEY = "ccna-on-call-v1";
const XP_FACTOR = [0, 0.6, 0.8, 1];

function load() {
  const fresh = { levels: {}, variants: {}, studied: {}, q: {}, prefs: {} };
  try {
    const data = Object.assign(fresh, JSON.parse(localStorage.getItem(KEY) || "{}"));
    delete data.skills;      // left over from the review queue of version 0.3
    // version 0.4 kept only a count per lab
    for (const [id, v] of Object.entries(data.variants)) if (typeof v === "number") data.variants[id] = { n: v, xp: 0 };
    return data;
  } catch { return fresh; }
}
const data = load();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* storage unavailable */ } };

const unlockAll = new URLSearchParams(location.search).get("unlock") === "all";

export const store = {
  // ---------------------------------------------------------- exam version
  examChosen: () => data.prefs.exam in EXAMS,
  exam: () => (data.prefs.exam in EXAMS ? data.prefs.exam : "v1"),
  setExam(id) { data.prefs.exam = id; save(); },
  // the levels of the chosen exam, in career order
  levels: () => LEVELS.filter(l => !l.only || l.only === store.exam()),

  // ---------------------------------------------------------- story
  result: id => data.levels[id] || null,
  isDone: id => !!data.levels[id],
  isUnlocked(id) {
    if (unlockAll) return true;
    const list = store.levels();
    const i = list.findIndex(l => l.id === id);
    return store.isDone(id) || i === 0 || (i > 0 && store.isDone(list[i - 1].id));
  },
  nextLevel: () => store.levels().find(l => !store.isDone(l.id)) || null,
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
    const list = store.levels();
    let ticketXp = 0, starCount = 0, done = 0, variantXp = 0, variants = 0;
    for (const l of list) {
      const r = data.levels[l.id];
      if (r) { ticketXp += r.xp; starCount += r.stars; done++; }
      const v = data.variants[l.id];
      if (v) { variantXp += v.xp; variants += v.n; }
    }
    // xp is everything earned; ticketXp out of maxXp is progress through the career path
    return { xp: ticketXp + variantXp, ticketXp, variantXp, variants, stars: starCount, done, maxXp: list.reduce((a, l) => a + l.xp, 0), maxStars: list.length * 3, count: list.length };
  },

  // Rank follows the highest tier you have fully cleared.
  rank() {
    const list = store.levels();
    let rank = TIERS[0].rank, tier = 1;
    for (const t of TIERS) {
      const all = list.filter(l => l.tier === t.id).every(l => store.isDone(l.id));
      if (!all) { rank = t.rank; tier = t.id; break; }
      rank = "Network Architect"; tier = TIERS.length + 1;
    }
    return { rank, tier };
  },

  // ---------------------------------------------------------- random variants
  // A lab's variants open once its original has been solved.
  variantsOpen: levelId => unlockAll || store.isDone(levelId),
  variantStats: levelId => data.variants[levelId] || { n: 0, xp: 0 },
  // Every solved variant earns the lab's points again, by the same star rules
  // as the original. Returns { n, xp, gained }.
  variantSolved(level, starCount) {
    const v = data.variants[level.id] || { n: 0, xp: 0 };
    const gained = store.xpFor(level, starCount);
    data.variants[level.id] = { n: v.n + 1, xp: v.xp + gained };
    save();
    return { ...data.variants[level.id], gained };
  },

  // ---------------------------------------------------------- topics and exams
  isStudied: topic => !!data.studied[topic],
  setStudied(topic, on) { if (on) data.studied[topic] = Date.now(); else delete data.studied[topic]; save(); },

  questionResult(id, ok) { data.q[id] = ok ? 1 : 0; save(); },
  qstat: id => data.q[id],          // 1 = last answer right, 0 = wrong, undefined = never seen

  pref: (k, fallback) => (k in data.prefs ? data.prefs[k] : fallback),
  setPref(k, v) { data.prefs[k] = v; save(); },

  reset() { data.levels = {}; data.variants = {}; data.studied = {}; data.q = {}; save(); },
};
