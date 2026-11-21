// IPv4 helpers. Addresses are unsigned 32-bit integers internally.

export function ipToInt(s) {
  if (typeof s !== "string") return null;
  const p = s.trim().split(".");
  if (p.length !== 4) return null;
  let n = 0;
  for (const x of p) {
    if (!/^\d{1,3}$/.test(x)) return null;
    const v = Number(x);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n >>> 0;
}

export function intToIp(n) {
  n >>>= 0;
  return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
}

export const isIp = s => ipToInt(s) !== null;

// Prefix length of a contiguous mask, or null if the mask has holes.
export function maskLen(m) {
  m >>>= 0;
  let len = 0, zero = false;
  for (let i = 31; i >= 0; i--) {
    if ((m >>> i) & 1) { if (zero) return null; len++; } else zero = true;
  }
  return len;
}

export function lenMask(len) {
  return len <= 0 ? 0 : (0xffffffff << (32 - len)) >>> 0;
}

export const netOf = (ip, mask) => (ip & mask) >>> 0;
export const bcastOf = (ip, mask) => ((ip & mask) | ~mask) >>> 0;
export const sameNet = (a, b, mask) => ((a ^ b) & mask) === 0;
export const wildOf = mask => (~mask) >>> 0;
export const cidr = (ip, mask) => `${intToIp(netOf(ip, mask))}/${maskLen(mask)}`;
