// test/ssrfGuard.test.mjs — `node --test`, no dev dependency.
//
// Regression cover for the 2026-09-21 incident: /ogcquery/capability was walked across
// internal NTU hosts (127.0.0.1, 10.0.0.102, *.ntu.internal, and trailing-dot variants).
// Only offline-deterministic cases live here so the suite does not depend on a resolver.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assertSafeUrl, BlockedTargetError, normalizeHost } from '../src/utils/ssrfGuard.mjs'

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
  const url = await assertSafeUrl('https://140.112.65.37./some/path')
  assert.equal(url.hostname, '140.112.65.37')
  assert.equal(url.protocol, 'https:')
})
