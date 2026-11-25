import { rateLimits } from './config.js';
import { clientIp } from './clientip.js';

const MAX_BUCKETS = 10_000;

export function createRateLimiter({
  enabled = rateLimits.enabled,
  windowMs = rateLimits.windowMs,
  max = rateLimits.max,
  widgetMax = rateLimits.widgetMax,
  now = Date.now,
} = {}) {
  const buckets = new Map();

  const limiter = (req, route = {}) => {
    if (!enabled) return null;

    const pattern = route.pattern?.source ?? route.pattern ?? req.url ?? '';
    const isWidgetPost = route.auth === 'widget' && req.method === 'POST';
    const limit = isWidgetPost ? widgetMax : max;
    if (!Number.isFinite(limit) || limit <= 0) return null;

    const key = `${clientIp(req) || 'unknown'}|${req.method}|${pattern}`;
    const nowMs = now();
    let bucket = buckets.get(key);
    if (!bucket || nowMs - bucket.start >= windowMs) {
      bucket = { start: nowMs, count: 0 };
      buckets.set(key, bucket);
    }
    bucket.count += 1;

    if (buckets.size > MAX_BUCKETS) {
      for (const [entry, value] of buckets) {
        if (nowMs - value.start >= windowMs) buckets.delete(entry);
      }
    }

    if (bucket.count <= limit) return null;
    return {
      limit,
      pattern,
      retryAfter: Math.max(1, Math.ceil((bucket.start + windowMs - nowMs) / 1000)),
    };
  };

  limiter.reset = () => buckets.clear();
  return limiter;
}

export const rateLimiter = createRateLimiter();
