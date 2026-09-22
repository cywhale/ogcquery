// test/layerMatcher.test.mjs — `node --test`, no dev dependency.
//
// `layer` is a user-controlled glob where only `*` is a wildcard. It was interpolated into
// `new RegExp` (only `*` translated), so `layer=(a+)+` became `^(a+)+$`; #3 escaped the other
// metacharacters but still compiled `*` to `.*`, and an external review showed a wildcard CHAIN
// (`*a*a*...*b`) still backtracks catastrophically. The matcher is now a linear two-pointer glob
// with no regex at all.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildLayerMatcher, layerMatches, MAX_LAYER_PATTERN, MAX_LAYER_SUBJECT } from '../src/utils/layerMatcher.mjs'

test('wildcard semantics are preserved', () => {
  const m = buildLayerMatcher('*temperature')
  assert.equal(m.mode, 'glob')
  assert.ok(layerMatches(m, 'Sea_temperature'))
  assert.ok(layerMatches(m, 'temperature'))
  assert.ok(!layerMatches(m, 'temperature_anomaly'))

  assert.ok(layerMatches(buildLayerMatcher('*temp*'), 'x_temp_y'))

  const m3 = buildLayerMatcher('SST')
  assert.equal(m3.mode, 'exact')
  assert.equal(m3.value, 'SST')
})

test('empty / whitespace pattern means no filter', () => {
  assert.equal(buildLayerMatcher('').mode, 'none')
  assert.equal(buildLayerMatcher('   ').mode, 'none')
  assert.equal(buildLayerMatcher(undefined).mode, 'none')
  assert.ok(layerMatches(buildLayerMatcher(''), 'anything'))
})

test('regex metacharacters in a wildcard pattern are treated literally', () => {
  const m = buildLayerMatcher('(a+)+*')
  assert.equal(m.mode, 'glob')
  assert.ok(layerMatches(m, '(a+)+_layer'))   // literal prefix then anything
  assert.ok(!layerMatches(m, 'aaaaaaaa'))     // the `+` is not a quantifier
})

test('the (a+)+ backtracking payload runs in well under budget', () => {
  const m = buildLayerMatcher('(a+)+b*')
  for (const n of [24, 32, 40, 64, 512]) {
    const t0 = process.hrtime.bigint()
    layerMatches(m, 'a'.repeat(n))
    const ms = Number(process.hrtime.bigint() - t0) / 1e6
    assert.ok(ms < 50, `n=${n} took ${ms.toFixed(1)}ms`)
  }
})

test('wildcard CHAIN cannot cause super-linear time (review #1)', () => {
  const m = buildLayerMatcher('*a*a*a*a*a*a*a*a*b')
  assert.equal(m.mode, 'glob')
  const t0 = process.hrtime.bigint()
  const hit = layerMatches(m, 'a'.repeat(4000)) // no trailing 'b' -> worst case
  const ms = Number(process.hrtime.bigint() - t0) / 1e6
  assert.equal(hit, false)
  assert.ok(ms < 50, `chain glob took ${ms.toFixed(1)}ms`)
})

test('glob semantics: case-insensitive, anchored, exact stays case-sensitive', () => {
  assert.ok(layerMatches(buildLayerMatcher('*temp*'), 'x_TEMP_y'))
  assert.ok(!layerMatches(buildLayerMatcher('*sst'), 'ssta'))
  assert.ok(layerMatches(buildLayerMatcher('sst_*_2020'), 'sst_x_2020'))
  assert.ok(layerMatches(buildLayerMatcher('exact'), 'exact'))
  assert.ok(!layerMatches(buildLayerMatcher('exact'), 'EXACT'))
})

test('pattern length is capped', () => {
  const m = buildLayerMatcher('*' + 'a'.repeat(MAX_LAYER_PATTERN * 4))
  assert.equal(m.mode, 'glob')
  assert.ok(m.pattern.length <= MAX_LAYER_PATTERN)
})

test('exact pattern length is capped too', () => {
  const m = buildLayerMatcher('a'.repeat(MAX_LAYER_PATTERN * 4))
  assert.equal(m.mode, 'exact')
  assert.ok(m.value.length <= MAX_LAYER_PATTERN)
})

test('subject length is capped so an oversized upstream name cannot blow up matching', () => {
  assert.ok(layerMatches(buildLayerMatcher('*'), 'z'.repeat(MAX_LAYER_SUBJECT * 4)))
})

test('a lone surrogate never throws', () => {
  assert.doesNotThrow(() => buildLayerMatcher('*\uD800*'))
  assert.doesNotThrow(() => layerMatches(buildLayerMatcher('*\uD800*'), 'x'))
})
