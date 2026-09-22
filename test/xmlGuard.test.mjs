// test/xmlGuard.test.mjs — `node --test`, no dev dependency.
//
// The pre-scan must count EVERY element, including tags starting with `_` or a Unicode letter —
// an ASCII-only `[a-zA-Z]` regex let those slip past the cap (round-3 finding). It must also skip
// comment/CDATA bodies so a `<` inside them is not miscounted, and stay fast on a bomb.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scanXmlLimits, MAX_XML_ELEMENTS, MAX_XML_DEPTH } from '../src/utils/xmlGuard.mjs'

const within = (ms, fn) => {
  const t0 = process.hrtime.bigint()
  const r = fn()
  assert.ok(Number(process.hrtime.bigint() - t0) / 1e6 < ms)
  return r
}

test('normal small document is within limits', () => {
  assert.equal(scanXmlLimits('<Root><Layer><Name>x</Name></Layer></Root>'), null)
})

test('underscore-named tags are counted (bypass regression #1)', () => {
  const bomb = '<a>' + '<_x>1</_x>'.repeat(700000) + '</a>'
  assert.equal(within(200, () => scanXmlLimits(bomb)), 'xml-too-many-elements')
})

test('Unicode-named tags are counted (bypass regression #1)', () => {
  const bomb = '<a>' + '<él>1</él>'.repeat(500000) + '</a>'
  assert.equal(within(200, () => scanXmlLimits(bomb)), 'xml-too-many-elements')
})

test('deep nesting is rejected', () => {
  const deep = '<a>'.repeat(4000) + '</a>'.repeat(4000)
  assert.equal(scanXmlLimits(deep), 'xml-too-deep')
})

test('a < inside a comment or CDATA is not miscounted', () => {
  assert.equal(scanXmlLimits('<a><!-- x < y < z -->' + '<L>1</L>'.repeat(3) + '</a>'), null)
  assert.equal(scanXmlLimits('<a><![CDATA[ 1 < 2 < 3 ]]><L>1</L></a>'), null)
})

test('self-closing tags do not increase depth', () => {
  assert.equal(scanXmlLimits('<a>' + '<b/>'.repeat(1000) + '</a>'), null)
})

test('limits are configurable', () => {
  assert.equal(scanXmlLimits('<a><b/><c/></a>', 1), 'xml-too-many-elements')
  assert.equal(scanXmlLimits('<a><b><c/></b></a>', 200000, 1), 'xml-too-deep')
  assert.ok(MAX_XML_ELEMENTS > 90000 && MAX_XML_DEPTH >= 15) // headroom over real capabilities
})
