/* =============================================================================
 * CardWise — Early-access store  (shared across all users via Upstash Redis)
 * -----------------------------------------------------------------------------
 * Implements the "first 100 people" gate + access counter + time tracker.
 *
 * Why a datastore: a global cap and a live counter must be shared across every
 * visitor and survive serverless cold starts — browser/localStorage and
 * in-memory maps can't do that. We use Upstash Redis (free, serverless REST).
 *
 * Configure by setting BOTH env vars (see README):
 *   UPSTASH_REDIS_REST_URL
 *   UPSTASH_REDIS_REST_TOKEN
 * If they're absent, kvConfigured() is false and the gate is disabled (the app
 * stays fully usable — the counter is simply hidden).
 *
 * Keys:
 *   cardwise:count     INT   number of spots claimed
 *   cardwise:claims    HASH  clientId -> spot number (dedupes one spot/browser)
 *   cardwise:timeline  ZSET  score = claim time (ms), member = spot number
 *   cardwise:launchAt  STR   timestamp (ms) of the first claim
 * ========================================================================== */

export const CAP = 100;

const URL = process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

const K_COUNT = 'cardwise:count';
const K_CLAIMS = 'cardwise:claims';
const K_TIMELINE = 'cardwise:timeline';
const K_LAUNCH = 'cardwise:launchAt';

export function kvConfigured() {
  return Boolean(URL && TOKEN);
}

/* Minimal Upstash REST client. command is a Redis command as an array,
 * e.g. redis('GET', 'key'). Returns the `result` field. */
async function redis(...command) {
  const res = await fetch(URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(`KV ${res.status}: ${data.error || 'request failed'}`);
  return data.result;
}

/* Atomic claim: dedupe by clientId, enforce the cap, record the timestamp and
 * the launch time — all in one server-side Lua step so the 100th boundary is
 * race-free. Returns [status, spotOrCount] where status is:
 *   2 = granted (new spot), 1 = already had a spot, 0 = full (cap reached). */
const CLAIM_LUA = `
local existing = redis.call('HGET', KEYS[2], ARGV[1])
if existing then return {1, tonumber(existing)} end
local count = tonumber(redis.call('GET', KEYS[1]) or '0')
local cap = tonumber(ARGV[3])
if count >= cap then return {0, count} end
count = count + 1
redis.call('SET', KEYS[1], count)
redis.call('HSET', KEYS[2], ARGV[1], count)
redis.call('ZADD', KEYS[3], ARGV[2], tostring(count))
redis.call('SETNX', KEYS[4], ARGV[2])
return {2, count}
`;

/**
 * Pure stats math — exported for unit testing.
 * @param {number} count            value of cardwise:count
 * @param {number|null} launchAtMs  value of cardwise:launchAt (ms) or null
 * @param {Array<{spot:number, atMs:number}>} timeline  sorted ascending by time
 * @param {number} now              current time (ms)
 */
export function computeStats(count, launchAtMs, timeline, now = Date.now()) {
  const taken = Number(count) || 0;
  const cap = CAP;
  const full = taken >= cap;
  const launch = launchAtMs != null ? Number(launchAtMs)
    : (timeline.length ? timeline[0].atMs : null);
  const latestAtMs = timeline.length ? timeline[timeline.length - 1].atMs : null;
  return {
    configured: true,
    cap,
    taken,
    remaining: Math.max(0, cap - taken),
    full,
    launchAtMs: launch,
    latestAtMs,
    elapsedMs: launch != null ? Math.max(0, now - launch) : null,
    // time from launch to the 100th claim, once the cap is reached
    reachedCapMs: full && launch != null && latestAtMs != null ? Math.max(0, latestAtMs - launch) : null,
    timeline,
  };
}

/* Parse ZRANGE ... WITHSCORES (flat [member, score, member, score, ...]). */
function parseTimeline(flat) {
  const out = [];
  if (Array.isArray(flat)) {
    for (let i = 0; i + 1 < flat.length; i += 2) {
      out.push({ spot: Number(flat[i]), atMs: Number(flat[i + 1]) });
    }
  }
  return out;
}

export async function getStats() {
  if (!kvConfigured()) return { configured: false, cap: CAP };
  const [count, launchAt, zrange] = await Promise.all([
    redis('GET', K_COUNT),
    redis('GET', K_LAUNCH),
    redis('ZRANGE', K_TIMELINE, '0', '-1', 'WITHSCORES'),
  ]);
  return computeStats(count, launchAt != null ? Number(launchAt) : null, parseTimeline(zrange));
}

export async function claimSpot(clientId) {
  if (!kvConfigured()) return { configured: false, cap: CAP, granted: true, already: false, full: false, spot: null };
  const now = Date.now();
  const result = await redis('EVAL', CLAIM_LUA, 4, K_COUNT, K_CLAIMS, K_TIMELINE, K_LAUNCH, String(clientId), String(now), String(CAP));
  const status = Number(result[0]);
  const spotOrCount = Number(result[1]);
  const stats = await getStats();
  return {
    ...stats,
    status,
    granted: status === 2,
    already: status === 1,
    full: status === 0,
    spot: status === 0 ? null : spotOrCount,
  };
}
