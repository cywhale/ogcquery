// test/layerMatcher.test.mjs — `node --test`, no dev dependency.
//
// The `layer` query is user-controlled and was interpolated into `new RegExp` with only `*`
// translated, leaving `+ { } ( ) |` live. `layer=(a+)+` became `^(a+)+$`, a catastrophic-
// backtracking regex that could pin the single Node thread for tens of seconds on one request.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildLayerMatcher, MAX_LAYER_PATTERN } from '../src/utils/layerMatcher.mjs'

const runsFast = (re, subject, budgetMs = 50) => {
  const t0 = process.hrtime.bigint()
  re.test(subject)
  const ms = Number(process.hrtime.bigint() - t0) / 1e6
  assert.ok(ms < budgetMs, `re.test took ${ms.toFixed(1)}ms, over ${budgetMs}ms budget`)
}

test('wildcard semantics are preserved', () => {
  const m = buildLayerMatcher('*temperature')
  assert.equal(m.mode, 'regex')
  assert.ok(m.re.test('Sea_temperature'))
  assert.ok(m.re.test('temperature'))
  assert.ok(!m.re.test('temperature_anomaly'))

  const m2 = buildLayerMatcher('*temp*')
  assert.ok(m2.re.test('x_temp_y'))

  const m3 = buildLayerMatcher('SST') // case-insensitive
  assert.equal(m3.mode, 'exact')
  assert.equal(m3.value, 'SST')
})

test('empty / whitespace pattern means no filter', () => {
  assert.equal(buildLayerMatcher('').mode, 'none')
  assert.equal(buildLayerMatcher('   ').mode, 'none')
  assert.equal(buildLayerMatcher(undefined).mode, 'none')
})

test('regex metacharacters in a wildcard pattern are treated literally', () => {
  // `(a+)+` was the catastrophic case. With a `*` present it takes the regex path; the
  // metacharacters must be escaped so it can only ever match the literal string.
  const m = buildLayerMatcher('(a+)+*')
  assert.equal(m.mode, 'regex')
  assert.equal(m.re.source, '^\\(a\\+\\)\\+.*$')
  assert.ok(m.re.test('(a+)+_layer'))
  assert.ok(!m.re.test('aaaaaaaa'))
})

test('a catastrophic-backtracking payload now runs in well under the budget', () => {
  // `layer=(a+)+b` with a `*` appended so it reaches the regex branch.
  const m = buildLayerMatcher('(a+)+b*')
  assert.equal(m.mode, 'regex')
  for (const n of [24, 32, 40, 64]) {
    runsFast(m.re, 'a'.repeat(n))
  }
})

test('pattern length is capped', () => {
  const m = buildLayerMatcher('*' + 'a'.repeat(MAX_LAYER_PATTERN * 4))
  assert.equal(m.mode, 'regex')
  assert.ok(m.re.source.length <= MAX_LAYER_PATTERN + 8)
})

test('a value that is invalid even after escaping matches nothing rather than throwing', () => {
  // Escaping makes this hard to trigger, but the branch must never throw.
  assert.doesNotThrow(() => buildLayerMatcher('*\uD800*')) // lone surrogate
})
