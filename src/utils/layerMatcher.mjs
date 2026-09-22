// src/utils/layerMatcher.mjs
//
// Safe matcher for the user-controlled `layer` glob, where only `*` is a wildcard.
//
// History: the original code fed the pattern to `new RegExp` after translating `*`; #3 escaped
// the other metacharacters but still compiled `*` to `.*`. An external review then showed that a
// *chain* of wildcards — `layer=*a*a*a*a*a*a*a*a*b` against an upstream layer name of 40 'a's —
// compiles to `^.*a.*a...b$`, which still backtracks catastrophically (~3.2s offline). Regex is
// the wrong tool here: match the glob directly with a linear two-pointer scan, which has no
// backtracking at all (0.2ms on the same input). Cap both the pattern and the subject length.

export const MAX_LAYER_PATTERN = 256
export const MAX_LAYER_SUBJECT = 1024

// Anchored glob match; `*` matches any run (including empty). O(n*m) worst case, never
// exponential; with the caps below it is trivially bounded. Caller lowercases for case-insensitive.
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
  // Exact match keeps the pre-decode value (matches historical behaviour); cap length so a
  // multi-KB exact pattern cannot be used to force large comparisons.
  if (!raw.includes('*')) return { mode: 'exact', value: raw.slice(0, MAX_LAYER_PATTERN) }

  let decoded
  try { decoded = decodeURIComponent(raw) } catch { decoded = raw }
  return { mode: 'glob', pattern: decoded.slice(0, MAX_LAYER_PATTERN).toLowerCase() }
}

// True if `subject` (an upstream-supplied layer name/title) matches the compiled matcher.
// `none` = no filter (everything matches); exact is case-sensitive as before; glob is
// case-insensitive and length-bounded.
export function layerMatches (matcher, subject) {
  if (!matcher || matcher.mode === 'none') return true
  if (subject == null) return false
  const s = String(subject)
  if (matcher.mode === 'exact') return s === matcher.value
  if (matcher.mode === 'glob') return globMatch(matcher.pattern, s.slice(0, MAX_LAYER_SUBJECT).toLowerCase())
  return false
}
