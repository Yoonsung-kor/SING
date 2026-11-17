// Who may use the API on a shared server: an invite code, a per-address pace, and daily caps per device.
// Everything lives in memory (a free server has no disk), so a restart starts the counts again.
// Nothing here logs a code, an address or a device id; only counts per day.
import { timingSafeEqual } from 'node:crypto';

export const DEFAULT_LIMITS = Object.freeze({ perMinute: 60, inviteFailures: 10, inviteWindowMs: 600000, aiPerDevice: 30, aiTotal: 200, videosPerDevice: 20 });

const OPEN = new Set(['/api/health', '/api/config']);
const AI = new Set(['/api/recommend', '/api/song-range', '/api/practice-feedback']);
const VIDEOS = '/api/song-videos';
const DEVICE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MINUTE_MS = 60000;
const KEEP_DAYS = 30;
const SWEEP_AT = 500;
const KST_MS = 9 * 3600000;

/** The date in Korea (UTC+9) as YYYY-MM-DD. */
export const kstDay = ms => new Date(ms + KST_MS).toISOString().slice(0, 10);

/** Constant-time comparison; a different length is simply "not equal". */
function same(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
}

const header = (req, name) => {
  const value = req.headers?.[name];
  return typeof value === 'string' ? value : Array.isArray(value) ? value[0] ?? '' : '';
};

const refuse = (status, error) => ({ status, body: { error } });

export function createAccess({ inviteCodes = [], adminKey = '', trustProxy = false, now = Date.now, limits = {} } = {}) {
  const limit = { ...DEFAULT_LIMITS, ...limits };
  const codes = inviteCodes.filter(code => typeof code === 'string' && code);
  const inviteRequired = codes.length > 0;
  // address -> { start, count } over fixed windows
  const minute = new Map();
  const failures = new Map();
  // Today's caps, dropped when the day changes.
  let today = null;
  let aiByDevice = new Map();
  let videosByDevice = new Map();
  let aiTotal = 0;
  // day -> { devices: Set, ai, videos }, the last 30 days
  const days = new Map();

  function addressOf(req) {
    if (trustProxy) {
      const forwarded = header(req, 'x-forwarded-for').split(',')[0].trim();
      if (forwarded) return forwarded;
    }
    return req.socket?.remoteAddress ?? '';
  }

  /** Counts one more in this address's window; returns the count. */
  function bump(table, address, windowMs, at) {
    let entry = table.get(address);
    if (!entry || at - entry.start >= windowMs) { entry = { start: at, count: 0 }; table.set(address, entry); }
    entry.count++;
    if (table.size > SWEEP_AT) for (const [key, value] of table) if (at - value.start >= windowMs) table.delete(key);
    return entry.count;
  }

  function current(table, address, windowMs, at) {
    const entry = table.get(address);
    return entry && at - entry.start < windowMs ? entry.count : 0;
  }

  function dayRecord(day) {
    if (today !== day) {
      today = day;
      aiByDevice = new Map();
      videosByDevice = new Map();
      aiTotal = 0;
    }
    let record = days.get(day);
    if (!record) {
      record = { devices: new Set(), ai: 0, videos: 0 };
      days.set(day, record);
      const keys = [...days.keys()].sort();
      while (keys.length > KEEP_DAYS) days.delete(keys.shift());
    }
    return record;
  }

  function check(req, pathname) {
    if (OPEN.has(pathname)) return null;
    const at = now();
    const device = header(req, 'x-sing-device');
    const validDevice = DEVICE.test(device);
    const record = dayRecord(kstDay(at));
    if (!inviteRequired) {
      // Local development: nothing is refused; a well-formed device id still counts for the day.
      if (validDevice) see(record, device, at);
      return null;
    }
    const address = addressOf(req);
    if (bump(minute, address, MINUTE_MS, at) > limit.perMinute) return refuse(429, 'slow-down');
    if (current(failures, address, limit.inviteWindowMs, at) >= limit.inviteFailures) return refuse(429, 'slow-down');
    const given = header(req, 'x-sing-invite');
    if (!given || !codes.some(code => same(code, given))) {
      bump(failures, address, limit.inviteWindowMs, at);
      return refuse(401, 'invite');
    }
    if (!validDevice) return refuse(400, 'device');
    see(record, device, at);
    if (AI.has(pathname)) {
      const mine = aiByDevice.get(device) ?? 0;
      if (mine >= limit.aiPerDevice || aiTotal >= limit.aiTotal) return refuse(429, 'daily-limit');
      aiByDevice.set(device, mine + 1);
      aiTotal++;
      record.ai++;
    } else if (pathname === VIDEOS) {
      const mine = videosByDevice.get(device) ?? 0;
      if (mine >= limit.videosPerDevice) return refuse(429, 'daily-limit');
      videosByDevice.set(device, mine + 1);
      record.videos++;
    }
    return null;
  }

  function see(record, device, at) {
    if (record.devices.has(device)) return;
    record.devices.add(device);
    console.log(JSON.stringify({ event: 'device', day: kstDay(at), devices: record.devices.size }));
  }

  function stats(key) {
    if (!adminKey || !key || !same(adminKey, key)) return null;
    return { days: [...days.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([day, record]) => ({ day, devices: record.devices.size, ai: record.ai, videos: record.videos })) };
  }

  return { inviteRequired, check, stats };
}
