// src/utils/ssrfGuard.mjs
//
// SSRF guard for the user-supplied-URL fetch site (/ogcquery/capability).
// Node built-ins only (node:net, node:dns/promises) — no new dependency.
//
// Added 2026-09-22 after an incident in which api.odb.ntu.edu.tw was used as an attack
// relay: an external client walked /ogcquery/capability?url=... across internal NTU hosts
// (127.0.0.1, 10.0.0.102:8011, *.ntu.internal, including trailing-dot variants such as
// `exse-001.ntu.internal.`) and read the outcome off the error messages.
//
// Two rules follow from that:
//   1. Never fetch a target that resolves to an internal address.
//   2. Never let the caller tell *why* a fetch failed — see genericFetchFailure() in the
//      route. A distinguishable error is an internal-host enumeration oracle even when the
//      fetch itself is blocked.

import net from 'node:net'
import dns from 'node:dns/promises'

// Thrown for anything the caller is not allowed to learn about. The route maps every one of
// these to a single generic response; `reason` is for server-side logs only.
export class BlockedTargetError extends Error {
  constructor (reason) {
    super('blocked: target is not an allowed address')
    this.name = 'BlockedTargetError'
    this.reason = reason
  }
}

// Strip the brackets URL.hostname keeps around an IPv6 literal.
const stripBrackets = (host) =>
  host.length >= 2 && host[0] === '[' && host[host.length - 1] === ']'
    ? host.slice(1, -1)
    : host

// `example.com.` and `example.com` are the same name in DNS but different strings. The
// attacker probed both, so fold them here — before any comparison or classification.
const normalizeHost = (host) => {
  let h = stripBrackets(String(host || '')).trim().toLowerCase()
  while (h.endsWith('.')) h = h.slice(0, -1)
  return h
}

// ---- IPv4 ------------------------------------------------------------------------------

const ipv4ToInt = (ip) => {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  let n = 0
  for (const p of parts) {
    if (!/^\d+$/.test(p)) return null
    const v = Number(p)
    if (v < 0 || v > 255) return null
    n = (n * 256) + v
  }
  return n >>> 0
}

const inCidr4 = (ipInt, baseStr, bits) => {
  const baseInt = ipv4ToInt(baseStr)
  if (baseInt === null) return false
  if (bits === 0) return true
  const mask = (0xffffffff << (32 - bits)) >>> 0
  return (ipInt & mask) === (baseInt & mask)
}

const DENY_V4 = [
  ['0.0.0.0', 8],      // unspecified / "this host"
  ['10.0.0.0', 8],     // private
  ['100.64.0.0', 10],  // CGNAT
  ['127.0.0.0', 8],    // loopback
  ['169.254.0.0', 16], // link-local, incl. cloud metadata 169.254.169.254
  ['172.16.0.0', 12],  // private
  ['192.0.0.0', 24],   // IETF protocol assignments
  ['192.168.0.0', 16], // private
  ['192.0.2.0', 24],   // TEST-NET-1 (documentation)
  ['192.88.99.0', 24], // 6to4 relay anycast (deprecated)
  ['198.18.0.0', 15],  // benchmarking
  ['198.51.100.0', 24],// TEST-NET-2 (documentation)
  ['203.0.113.0', 24], // TEST-NET-3 (documentation)
  ['224.0.0.0', 4],    // multicast
  ['240.0.0.0', 4],    // reserved, incl. 255.255.255.255
]

const isDeniedV4 = (ip) => {
  const ipInt = ipv4ToInt(ip)
  if (ipInt === null) return true // unparseable -> fail closed
  return DENY_V4.some(([base, bits]) => inCidr4(ipInt, base, bits))
}

// ---- IPv6 ------------------------------------------------------------------------------

// Expand to 8 groups, handling :: compression and an embedded IPv4 tail (::ffff:127.0.0.1).
const ipv6Groups = (ip) => {
  let s = ip
  const pct = s.indexOf('%')
  if (pct !== -1) s = s.slice(0, pct) // drop zone id

  const lastColon = s.lastIndexOf(':')
  if (lastColon !== -1 && s.slice(lastColon + 1).includes('.')) {
    const v4Int = ipv4ToInt(s.slice(lastColon + 1))
    if (v4Int === null) return null
    s = s.slice(0, lastColon + 1) +
        ((v4Int >>> 16) & 0xffff).toString(16) + ':' + (v4Int & 0xffff).toString(16)
  }

  const halves = s.split('::')
  if (halves.length > 2) return null
  const toGroups = (part) => part === '' ? [] : part.split(':').map((g) => {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return NaN
    return parseInt(g, 16)
  })

  let groups
  if (halves.length === 2) {
    const head = toGroups(halves[0])
    const tail = toGroups(halves[1])
    const fill = 8 - head.length - tail.length
    if (fill < 0) return null
    groups = [...head, ...Array(fill).fill(0), ...tail]
  } else {
    groups = toGroups(halves[0])
  }
  if (groups.length !== 8 || groups.some(Number.isNaN)) return null
  return groups
}

const isDeniedV6 = (ip) => {
  const g = ipv6Groups(ip)
  if (g === null) return true // unparseable -> fail closed

  const allZeroExceptLast = g.slice(0, 7).every((x) => x === 0)
  if (allZeroExceptLast && (g[7] === 0 || g[7] === 1)) return true // :: and ::1

  // IPv4-mapped / IPv4-compatible: classify the embedded IPv4 instead.
  if (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0)) {
    const v4 = `${(g[6] >>> 8) & 0xff}.${g[6] & 0xff}.${(g[7] >>> 8) & 0xff}.${g[7] & 0xff}`
    return isDeniedV4(v4)
  }

  if ((g[0] & 0xfe00) === 0xfc00) return true // fc00::/7 unique-local
  if ((g[0] & 0xffc0) === 0xfe80) return true // fe80::/10 link-local
  if ((g[0] & 0xffc0) === 0xfec0) return true // fec0::/10 deprecated site-local
  if ((g[0] & 0xff00) === 0xff00) return true // ff00::/8 multicast
  if (g[0] === 0x0064 && g[1] === 0xff9b) return true // 64:ff9b::/96 NAT64
  if (g[0] === 0x0100 && g[1] === 0x0000) return true // 100::/64 discard-only
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true // 2001:db8::/32 documentation
  if (g[0] === 0x2001 && (g[1] & 0xfff0) === 0x0010) return true // 2001:10::/28 ORCHID (deprecated)
  if (g[0] === 0x2001 && (g[1] & 0xfff0) === 0x0020) return true // 2001:20::/28 ORCHIDv2
  if (g[0] === 0x2001 && g[1] === 0x0002 && g[2] === 0x0000) return true // 2001:2::/48 BMWG benchmarking
  return false
}

const isDeniedIp = (ip) => net.isIP(ip) === 6 ? isDeniedV6(ip) : isDeniedV4(ip)

// ---- public API -------------------------------------------------------------------------

const DENIED_NAMES = new Set(['localhost'])
const DENIED_SUFFIXES = ['.localhost', '.local', '.internal', '.home.arpa']

/**
 * Validate a user-supplied URL before fetching it.
 *
 * Resolves the hostname and rejects if ANY returned address is internal, which closes the
 * "one A record is public, the other is 10.x" variant of the bypass. Returns the URL with a
 * normalized hostname so the caller fetches exactly what was checked.
 *
 * Note (honest limitation): this resolves and then hands the URL to `fetch`, which resolves
 * again independently, so a DNS-rebinding window remains. Pinning to the validated address
 * is a follow-up, not part of this fix.
 *
 * @param {URL|string} input
 * @returns {Promise<{url: URL, address: string, family: number}>} validated URL + pinned address
 * @throws {BlockedTargetError}
 */
export async function assertSafeUrl (input) {
  let url
  try {
    url = input instanceof URL ? new URL(input.href) : new URL(String(input))
  } catch {
    throw new BlockedTargetError('unparseable-url')
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new BlockedTargetError(`scheme-not-allowed:${url.protocol}`)
  }

  const host = normalizeHost(url.hostname)
  if (host === '') throw new BlockedTargetError('empty-host')
  if (DENIED_NAMES.has(host)) throw new BlockedTargetError(`denied-name:${host}`)
  if (DENIED_SUFFIXES.some((s) => host.endsWith(s))) {
    throw new BlockedTargetError(`denied-suffix:${host}`)
  }

  // Literal IP: classify directly, never send it to DNS.
  if (net.isIP(host) !== 0) {
    const fam = net.isIP(host)
    if (isDeniedIp(host)) throw new BlockedTargetError(`denied-ip-literal:${host}`)
    url.hostname = fam === 6 ? `[${host}]` : host
    return { url, address: host, family: fam }
  }

  let addresses
  try {
    addresses = await dns.lookup(host, { all: true, verbatim: true })
  } catch (err) {
    // DNS failure is deliberately indistinguishable from a blocked target for the caller.
    throw new BlockedTargetError(`dns-failed:${host}:${err.code || err.message}`)
  }
  if (!addresses.length) throw new BlockedTargetError(`dns-empty:${host}`)

  for (const { address } of addresses) {
    if (isDeniedIp(address)) {
      throw new BlockedTargetError(`denied-resolved-ip:${host}->${address}`)
    }
  }

  url.hostname = host
  // Pin to a validated address: fetch() re-resolves the name independently, so without this a
  // rebind between validation and connect could still reach an internal target. Every returned
  // address passed the check above, so the first is safe to pin.
  const chosen = addresses[0]
  return { url, address: chosen.address, family: chosen.family }
}

// Force the connection to an already-validated address while leaving Host and TLS SNI as the
// hostname, so certificate validation still works. Pairs with assertSafeUrl() to close the
// resolve-then-fetch DNS-rebinding window for the hop being fetched.
export function pinnedLookup (address, family) {
  return (hostname, options, callback) => {
    if (options && options.all) return callback(null, [{ address, family }])
    return callback(null, address, family)
  }
}

export { normalizeHost }
