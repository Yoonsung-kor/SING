// The one way the page talks to the server: every request carries this phone's random device id and,
// once the friend has entered it, the invite code. A refused code, a daily limit and a sleeping server
// are reported to the app through callbacks. Requests are never sent twice (an AI call costs money).
const INVITE = /^[A-Za-z0-9_-]{8,64}$/;
const DEVICE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const KEYS = Object.freeze({ invite: 'sing.invite', device: 'sing.device' });
const LIMITS = ['daily-limit', 'slow-down'];

/** The browser's localStorage, or null: with site data blocked even reading the property throws. */
function browserStorage() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

/** localStorage when it works; memory when it is missing or blocked (private windows, in-app browsers). Never throws. */
export function safeStorage(local = browserStorage()) {
  const memory = new Map();
  return {
    get(key) {
      try { const value = local?.getItem(key); if (typeof value === 'string') return value; } catch { /* blocked: memory below */ }
      return memory.get(key) ?? null;
    },
    set(key, value) {
      memory.set(key, value);
      try { local?.setItem(key, value); } catch { /* blocked: memory keeps it for this visit */ }
    },
    remove(key) {
      memory.delete(key);
      try { local?.removeItem(key); } catch { /* blocked */ }
    },
  };
}

/** The code in an invite link (https://…/#invite=CODE), or null. */
export function inviteFromHash(hash) {
  const match = /^#invite=([^&]+)/.exec(String(hash ?? ''));
  if (!match) return null;
  let code;
  try { code = decodeURIComponent(match[1]); } catch { return null; }
  return INVITE.test(code) ? code : null;
}

/** What a friend typed or pasted into the invite field: the code itself, or the whole invite link (an iPhone's
 * home-screen app keeps its own storage, so it asks once more, and the link is what the friend has at hand). */
export function inviteFromInput(text) {
  const value = String(text ?? '').trim();
  if (INVITE.test(value)) return value;
  const link = /#invite=[^\s&]+/.exec(value);
  return link ? inviteFromHash(link[0]) : null;
}

export function createApi({ fetchImpl = (...args) => fetch(...args), storage = safeStorage(), newId = () => crypto.randomUUID(), onWaking = () => {}, onInvite = () => {}, onLimit = () => {}, wakeAfterMs = 2500, timer = setTimeout } = {}) {
  const invite = {
    get() { const code = storage.get(KEYS.invite); return code && INVITE.test(code) ? code : null; },
    set(code) { storage.set(KEYS.invite, code); },
    clear() { storage.remove(KEYS.invite); },
  };

  function deviceId() {
    let id = storage.get(KEYS.device);
    if (!id || !DEVICE.test(id)) { id = newId(); storage.set(KEYS.device, id); }
    return id;
  }

  /** Like fetch(path, options), with the two headers added. The answer is returned unread. */
  async function request(path, options = {}) {
    const headers = new Headers(options.headers ?? {});
    headers.set('X-Sing-Device', deviceId());
    const code = invite.get();
    if (code) headers.set('X-Sing-Invite', code);
    const response = await fetchImpl(path, { ...options, headers });
    if (response.status === 401 || response.status === 429) {
      const body = await response.clone().json().catch(() => null);
      if (response.status === 401 && body?.error === 'invite') { invite.clear(); onInvite(); }
      if (response.status === 429 && LIMITS.includes(body?.error)) onLimit(body.error);
    }
    return response;
  }

  /** Asks whether the server is up. A free server may be asleep; if no answer comes quickly, the app says it is opening. */
  async function wake() {
    let settled = false;
    let shown = false;
    timer(() => { if (!settled) { shown = true; onWaking(true); } }, wakeAfterMs);
    try {
      const response = await fetchImpl('/api/health', { cache: 'no-store' });
      settled = true;
      if (shown) onWaking(false);
      return response.ok;
    } catch {
      settled = true;
      onWaking(false);
      return false;
    }
  }

  return { request, wake, invite, deviceId };
}
