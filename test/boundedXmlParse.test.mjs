// test/boundedXmlParse.test.mjs — `node --test`, no dev dependency.
//
// Exercises the REAL parseXmlBounded(): actual worker_threads Worker, real timeout termination,
// real process-wide concurrency cap. (Earlier tests only re-implemented scan-then-parse in the
// test file and never spawned a worker — round-6 gap.)

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseXmlBounded, XmlParseError, activeParseCount } from '../src/utils/boundedXmlParse.mjs'

const settle = async () => { // let 'exit'/terminate handlers drain so activeParseCount returns to 0
  for (let i = 0; i < 20 && activeParseCount() !== 0; i++) await new Promise(r => setTimeout(r, 25))
}

test('parses a normal document in the worker and returns the object', async () => {
  const data = await parseXmlBounded('<Root><Layer><Name>ssta</Name></Layer></Root>')
  assert.ok(data.Root && data.Root.Layer)
  assert.equal(data.Root.Layer.Name, 'ssta')
  await settle()
  assert.equal(activeParseCount(), 0) // no leak
})

test('a slow parse is terminated at the timeout and reports parse-timeout', async () => {
  const slow = '<a>' + 'x<!--c-->'.repeat(200000) + '</a>' // ~2.6s to parse; scan would reject it, but we call parse directly
  const t0 = process.hrtime.bigint()
  await assert.rejects(
    () => parseXmlBounded(slow, { timeoutMs: 400 }),
    (err) => err instanceof XmlParseError && err.reason === 'parse-timeout'
  )
  const ms = Number(process.hrtime.bigint() - t0) / 1e6
  assert.ok(ms < 2000, `timeout fired late: ${ms.toFixed(0)}ms`) // ~400ms, well before the ~2.6s parse
  await settle()
  assert.equal(activeParseCount(), 0) // worker terminated, slot released
})

test('the concurrency cap rejects excess requests immediately with parse-overloaded', async () => {
  const doc = '<Root><Layer><Name>x</Name></Layer></Root>'
  // 3 synchronous calls with a cap of 2: the 3rd sees the cap and rejects at once.
  const results = await Promise.allSettled([
    parseXmlBounded(doc, { maxConcurrent: 2 }),
    parseXmlBounded(doc, { maxConcurrent: 2 }),
    parseXmlBounded(doc, { maxConcurrent: 2 })
  ])
  const overloaded = results.filter(r => r.status === 'rejected' && r.reason?.reason === 'parse-overloaded')
  const ok = results.filter(r => r.status === 'fulfilled')
  assert.equal(overloaded.length, 1)
  assert.equal(ok.length, 2)
  await settle()
  assert.equal(activeParseCount(), 0)
})
