// src/utils/layerMatcher.mjs
//
// Builds a safe matcher from the user-controlled `layer` query, a glob in which only `*` is
// special. The original code did `decodeURIComponent(patx).replace(/\*/g, '(.*)')` and handed
// the result straight to `new RegExp`, so `+`, `{}`, `()`, `|` etc. passed through untouched:
// `layer=(a+)+` compiled to `^(a+)+$`, a catastrophic-backtracking regex. Offline, 28 'a's
// against it took >1s per test(); the fixed form runs in microseconds.
//
// Escape every regex metacharacter first, then re-enable only the `*` wildcard. Cap the length,
// and never let a malformed value throw.

export const MAX_LAYER_PATTERN = 256

export function buildLayerMatcher (pattern) {
  const raw = (pattern ?? '').trim()
  if (raw === '') return { mode: 'none' }
  // Exact match keeps the pre-decode value, matching the previous behaviour.
  if (!raw.includes('*')) return { mode: 'exact', value: raw }

  let decoded
  try { decoded = decodeURIComponent(raw) } catch { decoded = raw }
  if (decoded.length > MAX_LAYER_PATTERN) decoded = decoded.slice(0, MAX_LAYER_PATTERN)

  const escaped = decoded
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')  // escape every regex metacharacter, including *
    .replace(/\\\*/g, '.*')                   // then re-enable only the * wildcard
  try {
    return { mode: 'regex', re: new RegExp(`^${escaped}$`, 'i') }
  } catch {
    return { mode: 'nomatch' } // unparseable even after escaping -> matches nothing
  }
}
