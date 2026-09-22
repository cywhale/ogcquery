// src/utils/layerMatcher.mjs
//
// Safe matcher for the user-controlled `layer` glob, where only `*` is a wildcard.
//
// History: originally compiled to `new RegExp` (only `*` translated) -> `layer=(a+)+` backtracked;
// #3 escaped metacharacters but still turned `*` into `.*`, so a wildcard CHAIN (`*a*a*...*b`)
// still backtracked (~3.2s offline). #6 replaced regex with a linear two-pointer glob. A second
// review then noted the length caps *sliced* the input, which changes anchored-match semantics
// (a truncated pattern/subject can match when the full value would not). So: over-long inputs are
// now REJECTED (match nothing), never silently truncated.

export const MAX_LAYER_PATTERN = 256
export const MAX_LAYER_SUBJECT = 1024

// Anchored glob match; `*` matches any run (including empty). Linear two-pointer, no backtracking.
function globMatch (pat, txt) {
  let p = 0, t = 0, star = -1, mark = 0
  while (t < txt.length) {
    if (p < pat.length && pat[p] === txt[t]) { p++; t++ }
    else if (p < pat.length && pat[p] === '*') { star = p; mark = t; p++ }
    else if (star !== -1) { p = star + 1; mark++; t = mark }
    else return false
  }
  while (p < pat.length && pat[p] === '*') p++
  return p === pat.length
}

export function buildLayerMatcher (pattern) {
  const raw = (pattern ?? '').trim()
  if (raw === '') return { mode: 'none' }
  // Over-long pattern: reject rather than slice (slicing would match the wrong thing).
  if (raw.length > MAX_LAYER_PATTERN) return { mode: 'nomatch' }
  // Exact match keeps the pre-decode value (historical, case-sensitive behaviour).
  if (!raw.includes('*')) return { mode: 'exact', value: raw }

  let decoded
  try { decoded = decodeURIComponent(raw) } catch { decoded = raw }
  if (decoded.length > MAX_LAYER_PATTERN) return { mode: 'nomatch' }
  return { mode: 'glob', pattern: decoded.toLowerCase() }
}

// True if `subject` (an upstream-supplied layer name/title) matches the matcher. `none` = no
// filter; `nomatch` = never; exact is case-sensitive; glob is case-insensitive. An over-long
// subject is rejected (false), never truncated — a partial anchored match would be incorrect.
export function layerMatches (matcher, subject) {
  if (!matcher || matcher.mode === 'none') return true
  if (matcher.mode === 'nomatch') return false
  if (subject == null) return false
  const s = String(subject)
  if (s.length > MAX_LAYER_SUBJECT) return false
  if (matcher.mode === 'exact') return s === matcher.value
  if (matcher.mode === 'glob') return globMatch(matcher.pattern, s.toLowerCase())
  return false
}
