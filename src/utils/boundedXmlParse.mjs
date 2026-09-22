// src/utils/boundedXmlParse.mjs
//
// Parse XML in a worker_threads Worker under three bounds, so a caller-chosen (possibly hostile)
// document cannot exhaust the service:
//   - a hard wall-clock timeout (terminate the worker) — parse() is synchronous and can't be
//     AbortSignal-cancelled, and count-based pre-scans proved gameable to the byte;
//   - a process-wide concurrency cap — one request spawns one worker, and without a cap many
//     concurrent requests (distributed, so nginx's per-IP rate limit doesn't help) could spawn
//     unbounded workers and exhaust CPU/memory;
//   - a per-worker memory cap (resourceLimits) — a worker that balloons is killed, not the host.
// The main event loop is never blocked regardless of the document, because parse() runs off-thread.

import { Worker } from 'node:worker_threads'

export const PARSE_TIMEOUT_MS = 5000
export const MAX_CONCURRENT_PARSES = 4
export const WORKER_MAX_OLD_MB = 256

let active = 0
export function activeParseCount () { return active }

export class XmlParseError extends Error {
  constructor (reason) { super(reason); this.name = 'XmlParseError'; this.reason = reason }
}

export function parseXmlBounded (xml, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? PARSE_TIMEOUT_MS
  const maxConcurrent = opts.maxConcurrent ?? MAX_CONCURRENT_PARSES
  return new Promise((resolve, reject) => {
    if (active >= maxConcurrent) return reject(new XmlParseError('parse-overloaded'))

    let worker
    try {
      worker = new Worker(new URL('./parseWorker.mjs', import.meta.url), {
        workerData: { xml },
        resourceLimits: { maxOldGenerationSizeMb: WORKER_MAX_OLD_MB }
      })
    } catch {
      return reject(new XmlParseError('parse-worker-spawn'))
    }

    active++
    let settled = false
    const finish = (fn, arg) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      active--
      worker.terminate().catch(() => {})
      fn(arg)
    }
    const timer = setTimeout(() => finish(reject, new XmlParseError('parse-timeout')), timeoutMs)
    worker.once('message', (msg) => (msg && msg.ok)
      ? finish(resolve, msg.data)
      : finish(reject, new XmlParseError('parse-error')))
    worker.once('error', () => finish(reject, new XmlParseError('parse-worker-error')))
    worker.once('exit', () => finish(reject, new XmlParseError('parse-worker-exit')))
  })
}
