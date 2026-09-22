// test/xmlGuard.test.mjs — `node --test`, no dev dependency.
//
// The pre-scan is the ONLY defence before arraybuffer-xml-parser's synchronous parse() (an
// AbortSignal can't interrupt it). It must reject the super-linear-parse payloads BEFORE parse:
// many comments (~2.6s/200k), interleaved text runs (~3s/200k), and `_`/Unicode element bombs —
// while passing real capabilities (GIBS: 90k tags, 30476 text runs, 0 comments, ~160ms parse).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parse } from 'arraybuffer-xml-parser'
import { scanXmlLimits, MAX_XML_ELEMENTS, MAX_XML_DEPTH, MAX_XML_SPECIAL, MAX_XML_TEXT_RUNS, MAX_XML_TAG_BYTES } from '../src/utils/xmlGuard.mjs'

const within = (ms, fn) => {
  const t0 = process.hrtime.bigint()
  const r = fn()
  assert.ok(Number(process.hrtime.bigint() - t0) / 1e6 < ms, 'scan too slow')
  return r
}

// Mirrors the route: scan first, only parse if the scan passes. This is the integration the
// reviewer asked for — a rejected payload must never reach parse().
const guardedParse = (xml) => {
  const reason = scanXmlLimits(xml)
  if (reason) return { rejected: reason }
  return { parsed: parse(xml, { arrayMode: false }) }
}

test('normal document passes and parses', () => {
  const r = guardedParse('<Root><Layer><Name>x</Name></Layer></Root>')
  assert.equal(r.rejected, undefined)
  assert.ok(r.parsed)
})

test('comment-flood is rejected before parse (round-4 #1)', () => {
  const bomb = '<a>' + 'x<!--c-->'.repeat(200000) + '</a>'
  const r = within(200, () => guardedParse(bomb))
  assert.equal(r.rejected, 'xml-too-many-special')
  assert.equal(r.parsed, undefined) // parse() never called
})

test('interleaved text-run flood is rejected before parse (round-4 #1)', () => {
  const bomb = '<a>' + 'x<b/>'.repeat(200000) + '</a>'
  const r = within(200, () => guardedParse(bomb))
  assert.equal(r.rejected, 'xml-too-many-text-runs')
})

test('underscore / Unicode element bombs are rejected', () => {
  assert.ok(within(200, () => scanXmlLimits('<a>' + '<_x>1</_x>'.repeat(700000) + '</a>')))
  assert.ok(within(200, () => scanXmlLimits('<a>' + '<él>1</él>'.repeat(500000) + '</a>')))
})

test('deep nesting is rejected', () => {
  assert.equal(scanXmlLimits('<a>'.repeat(4000) + '</a>'.repeat(4000)), 'xml-too-deep')
})

test('a < inside comment / CDATA is not miscounted', () => {
  assert.equal(scanXmlLimits('<a><!-- x < y < z -->' + '<L>1</L>'.repeat(3) + '</a>'), null)
  assert.equal(scanXmlLimits('<a><![CDATA[ 1 < 2 < 3 ]]><L>1</L></a>'), null)
})

test('self-closing tags do not increase depth', () => {
  assert.equal(scanXmlLimits('<a>' + '<b/>'.repeat(1000) + '</a>'), null)
})

test('caps are configurable and have headroom over real capabilities', () => {
  assert.equal(scanXmlLimits('<a><b/><c/></a>', { maxElements: 1 }), 'xml-too-many-elements')
  assert.equal(scanXmlLimits('<a><b><c/></b></a>', { maxDepth: 1 }), 'xml-too-deep')
  assert.equal(scanXmlLimits('<a><!--x--><!--y--></a>', { maxSpecial: 1 }), 'xml-too-many-special')
  assert.equal(scanXmlLimits('<a>p<b/>q</a>', { maxTextRuns: 1 }), 'xml-too-many-text-runs')
  assert.ok(MAX_XML_ELEMENTS > 90000 && MAX_XML_DEPTH >= 15)
  assert.ok(MAX_XML_TEXT_RUNS > 30476 && MAX_XML_SPECIAL >= 16) // GIBS: 30476 text runs, 0 special
})

test('a single element with a huge attribute list is rejected by tag-length (round-5 #2)', () => {
  let attrs = ''
  for (let i = 0; i < 450000; i++) attrs += ` a${i}="123456"`
  const bomb = `<a${attrs}/>`
  assert.ok(bomb.length > MAX_XML_TAG_BYTES)
  assert.equal(scanXmlLimits(bomb), 'xml-tag-too-long')
})

test('a normal tag with a few attributes is fine', () => {
  assert.equal(scanXmlLimits('<Layer queryable="1" opaque="0"><Name>x</Name></Layer>'), null)
})

test('a > inside an attribute value does not hide a huge attribute list (round-6 #2)', () => {
  let attrs = ' x=">"'
  for (let i = 0; i < 450000; i++) attrs += ` a${i}="123456"`
  assert.equal(scanXmlLimits(`<a${attrs}/>`), 'xml-tag-too-long')
  // a normal quoted > is fine
  assert.equal(scanXmlLimits('<a title="a > b"><b>x</b></a>'), null)
})
