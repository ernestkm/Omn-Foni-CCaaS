const SENSITIVE_KEY = /authoriz|auth|token|secret|password|passwd|credential|cookie|api[-_]?key|jwt|code_verifier|private[-_]?key/i;

let customWriter = null;

function redactText(text) {
  return text
    .replace(/(authorization\s*[:=]\s*)[^\s,;]+/gi, '$1[redacted]')
    .replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [redacted]')
    .replace(/\b(?:widget|access|refresh)-[a-f0-9]{12,}\b/gi, '[redacted]');
}

function safe(value, depth = 0) {
  if (typeof value === 'string') return redactText(value);
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (depth > 4) return '[truncated]';
  if (value instanceof Error) {
    return safe({ name: value.name, message: value.message, code: value.code, stack: value.stack }, depth);
  }
  if (Array.isArray(value)) return value.slice(0, 25).map((item) => safe(item, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = SENSITIVE_KEY.test(key) ? '[redacted]' : safe(item, depth + 1);
    }
    return out;
  }
  return String(value);
}

export function setLogWriter(writer) {
  customWriter = typeof writer === 'function' ? writer : null;
}

export function log(level, event, fields = {}) {
  const entry = {
    ...safe(fields),
    timestamp: new Date().toISOString(),
    level,
    event,
  };
  const line = `${JSON.stringify(entry)}\n`;
  if (customWriter) return customWriter(line, level);
  const stream = level === 'error' || level === 'fatal' ? process.stderr : process.stdout;
  stream.write(line);
}
