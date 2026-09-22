// test/ssrfGuard.test.mjs — `node --test`, no dev dependency.
//
// Regression cover for the 2026-09-21 incident: /ogcquery/capability was walked across
// internal NTU hosts (127.0.0.1, 10.0.0.102, *.ntu.internal, and trailing-dot variants).
// Only offline-deterministic cases live here so the suite does not depend on a resolver.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assertSafeUrl, BlockedTargetError, normalizeHost, pinnedLookup } from '../src/utils/ssrfGuard.mjs'

const blocked = async (url) => {
  await assert.rejects(
    () => assertSafeUrl(url),
    (err) => err instanceof BlockedTargetError,
    `expected ${url} to be blocked`
  )
}

test('blocks loopback, private, link-local and reserved literals', async () => {
  for (const u of [
    'http://127.0.0.1/',
    'http://127.1.2.3/',
    'http://10.0.0.102:8011/',
    'http://172.16.0.1/',
    'http://192.168.2.37/',
    'http://169.254.169.254/',   // cloud metadata
    'http://100.64.0.1/',        // CGNAT
    'http://0.0.0.0/',
    'http://255.255.255.255/',
  ]) await blocked(u)
})

test('blocks alternate IPv4 spellings of loopback', async () => {
  // WHATWG URL folds these to 127.0.0.1; the guard must classify the folded form.
  for (const u of ['http://2130706433/', 'http://0x7f.0.0.1/', 'http://0177.0.0.1/']) {
    await blocked(u)
  }
})

test('blocks IPv6 loopback, unique-local, link-local and IPv4-mapped', async () => {
  for (const u of [
    'http://[::1]/',
    'http://[::]/',
    'http://[fc00::1]/',
    'http://[fe80::1]/',
    'http://[::ffff:127.0.0.1]/',
    'http://[::ffff:10.0.0.1]/',
  ]) await blocked(u)
})

test('blocks internal-only names, including trailing-dot variants', async () => {
  // The attacker probed both `exse-001.ntu.internal` and `exse-001.ntu.internal.`
  for (const u of [
    'http://localhost/',
    'http://localhost./',
    'http://ex2016-003.ntu.internal/',
    'http://ex2016-003.ntu.internal./',
    'http://exse-001.ntu.internal../',
    'http://printer.local/',
  ]) await blocked(u)
})

test('blocks non-http schemes', async () => {
  for (const u of ['ftp://example.com/', 'file:///etc/passwd', 'gopher://example.com/']) {
    await blocked(u)
  }
})

test('blocks unparseable input', async () => {
  for (const u of ['not-a-url', '', 'http://']) await blocked(u)
})

test('normalizeHost folds case, brackets and trailing dots', () => {
  assert.equal(normalizeHost('Example.COM.'), 'example.com')
  assert.equal(normalizeHost('EXSE-001.ntu.internal..'), 'exse-001.ntu.internal')
  assert.equal(normalizeHost('[::1]'), '::1')
  assert.equal(normalizeHost(''), '')
})

test('a public literal address is allowed and returned normalized', async () => {
  const { url, address, family } = await assertSafeUrl('https://140.112.65.37./some/path')
  assert.equal(url.hostname, '140.112.65.37')
  assert.equal(url.protocol, 'https:')
})

// --- redirect hops -------------------------------------------------------------------------
// getCapabilities() fetches with `redirect: 'manual'` and runs exactly the expression below on
// every hop. Under the default 'follow' the guard only ever saw the first URL, so a public host
// that 302s to 127.0.0.1 bypassed it completely.

test('a redirect Location resolving to an internal address is rejected', async () => {
  const current = 'https://example.com/ogc/wms?service=WMS&request=GetCapabilities'
  for (const location of [
    'http://127.0.0.1:8013/',
    'http://10.0.0.102:8011/v1/models',
    'http://ex2016-003.ntu.internal/owa/',
    '//127.0.0.1/',                 // protocol-relative, inherits https:
    'http://127.0.0.1.nip.io/',     // public name, private answer
    'file:///etc/passwd',
  ]) {
    await blocked(new URL(location, current).href)
  }
})

test('a relative redirect that stays on an allowed host is still followed', async () => {
  const current = 'https://example.com/ogc/wms?service=WMS&request=GetCapabilities'
  const { url: next } = await assertSafeUrl(new URL('/capabilities.xml', current))
  assert.equal(next.href, 'https://example.com/capabilities.xml')
})

test('pinnedLookup hands back the validated address in both call styles', () => {
  const lookup = pinnedLookup('93.184.216.34', 4)
  // callback style undici uses when it wants a single address
  lookup('example.com', {}, (err, addr, fam) => {
    assert.equal(err, null); assert.equal(addr, '93.184.216.34'); assert.equal(fam, 4)
  })
  // all: true style
  lookup('example.com', { all: true }, (err, list) => {
    assert.equal(err, null)
    assert.deepEqual(list, [{ address: '93.184.216.34', family: 4 }])
  })
})

test('assertSafeUrl returns a validated address to pin to', async () => {
  const { url, address, family } = await assertSafeUrl('https://example.com/')
  assert.equal(url.hostname, 'example.com')
  assert.ok(typeof address === 'string' && address.length > 0)
  assert.ok(family === 4 || family === 6)
})

test('blocks reserved / documentation ranges (review #5)', async () => {
  for (const u of [
    'http://192.0.2.1/',        // TEST-NET-1
    'http://198.51.100.1/',     // TEST-NET-2
    'http://203.0.113.1/',      // TEST-NET-3
    'http://[2001:db8::1]/',    // IPv6 documentation
    'http://[2001:10::1]/',     // ORCHID (deprecated)
    'http://[100::1]/',         // discard-only
    'http://[fec0::1]/',        // deprecated site-local
    'http://[::ffff:192.0.2.1]/', // IPv4-mapped documentation
  ]) {
    await assert.rejects(
      () => assertSafeUrl(u),
      (err) => err instanceof BlockedTargetError,
      `expected ${u} to be blocked`
    )
  }
})
