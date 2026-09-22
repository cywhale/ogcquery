// src/utils/parseWorker.mjs
//
// Runs arraybuffer-xml-parser off the main event loop. arraybuffer-xml-parser is super-linear on
// crafted input (many comments / interleaved text runs / huge attribute lists), parse() is
// synchronous so an AbortSignal can't stop it, and count-based pre-scans proved gameable to the
// byte. Parsing in a worker lets the caller enforce a hard wall-clock budget by terminating the
// worker, and — the main win — a pathological document never blocks the service's event loop.

import { parentPort, workerData } from 'node:worker_threads'
import { parse } from 'arraybuffer-xml-parser'

try {
  parentPort.postMessage({ ok: true, data: parse(workerData.xml, { arrayMode: false }) })
} catch (err) {
  parentPort.postMessage({ ok: false, error: String((err && err.message) || err) })
}
