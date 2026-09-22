// src/utils/xmlGuard.mjs
//
// Cheap linear pre-scan run before handing user-fetched XML to arraybuffer-xml-parser. A byte cap
// alone does not bound parse cost, and the parser's node append is super-linear when many
// text/comment nodes accumulate as siblings: on vm37, 200k comments parse in ~2.6s and 200k
// interleaved `x<b/>` text runs in ~3s, while 90k nested element tags (NASA GIBS) parse in ~160ms.
// `parse()` is synchronous, so an AbortSignal can't interrupt it — this scan is the only defence.
//
// Element count alone can't tell these apart (200k clean elements parse in ~260ms). The cheap,
// robust discriminators are: number of comment/CDATA/PI nodes (real capabilities have ~0) and
// number of non-whitespace text runs (GIBS=30476, NLSC=569). Cap those tightly, plus element
// count and depth. The scan is a char reader (NOT an ASCII-name regex — a name may start with
// `_` or a Unicode letter), skips comment/CDATA/PI bodies, and bails as soon as any cap is hit.

export const MAX_XML_ELEMENTS = 200000
export const MAX_XML_DEPTH = 50
export const MAX_XML_SPECIAL = 4096     // comments + CDATA + PI (legit capabilities: 0–1)
export const MAX_XML_TEXT_RUNS = 80000  // non-ws text runs (~2.6x GIBS's 30476)
export const MAX_XML_TAG_BYTES = 65536  // a single <...> (name + attributes); legit tags are <1KB

const isWsRun = (s, from, to) => {
  for (let k = from; k < to; k++) {
    const cc = s.charCodeAt(k)
    if (cc !== 32 && cc !== 9 && cc !== 10 && cc !== 13) return false
  }
  return true
}

/** @returns {null} if within limits, or a short reason string if it exceeds them. */
export function scanXmlLimits (xml, opts = {}) {
  const maxElements = opts.maxElements ?? MAX_XML_ELEMENTS
  const maxDepth = opts.maxDepth ?? MAX_XML_DEPTH
  const maxSpecial = opts.maxSpecial ?? MAX_XML_SPECIAL
  const maxTextRuns = opts.maxTextRuns ?? MAX_XML_TEXT_RUNS
  const maxTagBytes = opts.maxTagBytes ?? MAX_XML_TAG_BYTES

  let depth = 0, elements = 0, special = 0, textRuns = 0
  const n = xml.length
  let i = 0
  while (i < n) {
    const lt = xml.indexOf('<', i)
    const textTo = lt === -1 ? n : lt
    if (textTo > i && !isWsRun(xml, i, textTo)) {
      if (++textRuns > maxTextRuns) return 'xml-too-many-text-runs'
    }
    if (lt === -1) break

    const c = xml[lt + 1]
    if (c === '!') {
      if (xml.startsWith('<!--', lt)) {
        if (++special > maxSpecial) return 'xml-too-many-special'
        const e = xml.indexOf('-->', lt + 4); i = e === -1 ? n : e + 3; continue
      }
      if (xml.startsWith('<![CDATA[', lt)) {
        if (++special > maxSpecial) return 'xml-too-many-special'
        const e = xml.indexOf(']]>', lt + 9); i = e === -1 ? n : e + 3; continue
      }
      const e = xml.indexOf('>', lt + 1); i = e === -1 ? n : e + 1; continue // <!DOCTYPE ...>
    }
    if (c === '?') {
      if (++special > maxSpecial) return 'xml-too-many-special'
      const e = xml.indexOf('?>', lt + 2); i = e === -1 ? n : e + 2; continue
    }
    const end = xml.indexOf('>', lt + 1)
    if (end === -1) break
    if (end - lt > maxTagBytes) return 'xml-tag-too-long' // e.g. an element with a huge attribute list
    if (c === '/') { depth--; i = end + 1; continue } // closing tag
    // opening tag (name may start with a letter, '_' or Unicode char)
    if (++elements > maxElements) return 'xml-too-many-elements'
    if (xml[end - 1] !== '/') { // not self-closing
      if (++depth > maxDepth) return 'xml-too-deep'
    }
    i = end + 1
  }
  return null
}
