// src/utils/xmlGuard.mjs
//
// Cheap structural pre-scan run before handing user-fetched XML to the parser. A byte cap alone
// does not bound parse cost (8MB of tiny elements parses in ~1.5s; deep nesting overflows the
// stack), so reject documents with too many elements or too much nesting first.
//
// This is a char scanner, NOT an ASCII-name regex: an XML tag name may start with '_' or a
// Unicode letter, and an earlier `[a-zA-Z]` regex let `<_x>` / Unicode elements slip past the
// element cap uncounted. Here every `<` that is not a comment/CDATA/PI/declaration or a close tag
// counts as an element, and comment/CDATA bodies are skipped so a `<` inside them is not
// miscounted. Conservative: it can only over-count, never under-count.

export const MAX_XML_ELEMENTS = 200000
export const MAX_XML_DEPTH = 50

/**
 * @returns {null} if within limits, or a short reason string if it exceeds them.
 */
export function scanXmlLimits (xml, maxElements = MAX_XML_ELEMENTS, maxDepth = MAX_XML_DEPTH) {
  let depth = 0, elements = 0
  const n = xml.length
  for (let i = 0; i < n; i++) {
    if (xml.charCodeAt(i) !== 0x3c) continue // not '<'
    const c = xml[i + 1]
    if (c === '!') {
      if (xml.startsWith('<!--', i)) { const e = xml.indexOf('-->', i + 4); i = e === -1 ? n : e + 2; continue }
      if (xml.startsWith('<![CDATA[', i)) { const e = xml.indexOf(']]>', i + 9); i = e === -1 ? n : e + 2; continue }
      const e = xml.indexOf('>', i + 1); i = e === -1 ? n : e; continue // <!DOCTYPE ...>
    }
    if (c === '?') { const e = xml.indexOf('?>', i + 2); i = e === -1 ? n : e + 1; continue } // <?pi?>
    if (c === '/') { depth--; continue } // closing tag
    const end = xml.indexOf('>', i + 1)
    if (end === -1) break
    elements++
    if (elements > maxElements) return 'xml-too-many-elements'
    if (xml[end - 1] !== '/') { // not self-closing
      depth++
      if (depth > maxDepth) return 'xml-too-deep'
    }
    i = end
  }
  return null
}
