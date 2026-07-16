/**
 * A word-game dictionary compiled to a DAWG (Directed Acyclic Word Graph) and a
 * compact binary encoding of it. Pure TypeScript — the SAME decoder runs in the
 * browser (playing) and on the server (replay validation), just like the game
 * engines.
 *
 * Format (little-endian):
 *   magic   "ADWG"            (4 bytes)
 *   version u8                (=1)
 *   lang    u8 len + UTF-8    (e.g. "pl")
 *   alphabet u16 byteLen + UTF-8  — the ordered distinct letters; a letter's
 *                                    index in this string is its edge letter code
 *   wordCount u32
 *   rootFirstEdge u32         — edge index where the root node's edges begin (0 = empty)
 *   edgeCount u32
 *   edges[]   u32 × edgeCount — edge[0] is a reserved sentinel (index 0 = "no node")
 *
 * Edge (u32):  (target << 8) | (letterCode << 2) | (terminal << 1) | last
 *   target     child node's first-edge index (0 = leaf, no children)  — 24 bits
 *   letterCode index into the alphabet                                 — 6 bits
 *   terminal   a word ends by taking this edge                         — 1 bit
 *   last       this is the final edge of its node's edge run           — 1 bit
 * A node is a contiguous run of edges terminated by the one with `last = 1`.
 */

export type LexiconLanguage = 'pl' | 'en';

export interface Lexicon {
  language: LexiconLanguage;
  /** Membership test, O(word length), after NFC + uppercase normalization. */
  has(word: string): boolean;
  wordCount: number;
}

const MAGIC = 0x47_57_44_41; // "ADWG" little-endian
const VERSION = 1;

/** Canonical form used everywhere: NFC (compose Polish letters) + uppercase. */
export function normalizeWord(word: string): string {
  return word.normalize('NFC').toUpperCase();
}

/** Code points of a word (so multi-byte Polish letters count as one letter). */
function letters(word: string): string[] {
  return Array.from(word);
}

// ---------------------------------------------------------------------------
// Build (offline): sorted word list → minimal DAWG → bytes
// ---------------------------------------------------------------------------

class BuildNode {
  final = false;
  /** letterCode → child. */
  edges = new Map<number, BuildNode>();
  /** Assigned when interned into the register / laid out. */
  id = -1;
  firstEdge = 0;
}

/** Signature that makes two subtrees equivalent (same finality + same outgoing edges). */
function signature(node: BuildNode): string {
  let s = node.final ? '1' : '0';
  const entries = [...node.edges.entries()].sort((a, b) => a[0] - b[0]);
  for (const [code, child] of entries) s += `;${code}>${child.id}`;
  return s;
}

/**
 * Build a minimal DAWG with Daciuk's incremental algorithm (needs SORTED,
 * de-duplicated input). Words are given as letter-code arrays over `alphabet`.
 */
function buildNodes(codedWords: number[][]): { root: BuildNode; count: number } {
  const root = new BuildNode();
  const register = new Map<string, BuildNode>();
  let nextId = 0;
  // The chain of not-yet-minimized nodes along the previously added word.
  const unchecked: { parent: BuildNode; code: number; child: BuildNode }[] = [];
  let prev: number[] = [];

  const replaceOrRegister = (downTo: number): void => {
    while (unchecked.length > downTo) {
      const { parent, code, child } = unchecked.pop()!;
      const key = signature(child);
      const existing = register.get(key);
      if (existing) {
        parent.edges.set(code, existing); // merge into the canonical equivalent
      } else {
        child.id = nextId++;
        register.set(key, child);
      }
    }
  };

  for (const word of codedWords) {
    let i = 0;
    while (i < word.length && i < prev.length && word[i] === prev[i]) i++;
    replaceOrRegister(i);
    let node = unchecked.length > 0 ? unchecked[unchecked.length - 1].child : root;
    for (let j = i; j < word.length; j++) {
      const child = new BuildNode();
      node.edges.set(word[j], child);
      unchecked.push({ parent: node, code: word[j], child });
      node = child;
    }
    node.final = true;
    prev = word;
  }
  replaceOrRegister(0);
  return { root, count: codedWords.length };
}

/** Encode a (already normalized, sorted, unique) word list into DAWG bytes. */
export function encodeLexicon(language: LexiconLanguage, sortedWords: string[]): Uint8Array {
  // Alphabet: distinct letters in code-point order.
  const alphabetSet = new Set<string>();
  for (const w of sortedWords) for (const ch of letters(w)) alphabetSet.add(ch);
  const alphabet = [...alphabetSet].sort();
  if (alphabet.length > 64) {
    throw new Error(`Alphabet too large (${alphabet.length} > 64) — widen the edge letter field.`);
  }
  const codeOf = new Map(alphabet.map((ch, idx) => [ch, idx]));
  const codedWords = sortedWords.map((w) => letters(w).map((ch) => codeOf.get(ch)!));

  const { root, count } = buildNodes(codedWords);

  // Lay out nodes: collect reachable, assign each a contiguous edge run.
  const nodes: BuildNode[] = [];
  const seen = new Set<BuildNode>();
  const collect = (n: BuildNode): void => {
    if (seen.has(n)) return;
    seen.add(n);
    nodes.push(n);
    for (const child of n.edges.values()) collect(child);
  };
  collect(root);

  let cursor = 1; // edge index 0 is the reserved "no node" sentinel
  for (const n of nodes) {
    n.firstEdge = n.edges.size > 0 ? cursor : 0;
    cursor += n.edges.size;
  }
  const edges = new Uint32Array(cursor);
  for (const n of nodes) {
    if (n.edges.size === 0) continue;
    const entries = [...n.edges.entries()].sort((a, b) => a[0] - b[0]);
    let i = n.firstEdge;
    entries.forEach(([code, child], k) => {
      const last = k === entries.length - 1 ? 1 : 0;
      const terminal = child.final ? 1 : 0;
      edges[i] = (child.firstEdge * 256 + code * 4 + terminal * 2 + last) >>> 0;
      i += 1;
    });
  }

  // Serialize header + edges.
  const langBytes = new TextEncoder().encode(language);
  const alphaBytes = new TextEncoder().encode(alphabet.join(''));
  const headerLen = 4 + 1 + 1 + langBytes.length + 2 + alphaBytes.length + 4 + 4 + 4;
  const buf = new ArrayBuffer(headerLen + edges.length * 4);
  const view = new DataView(buf);
  let o = 0;
  view.setUint32(o, MAGIC, true); o += 4;
  view.setUint8(o, VERSION); o += 1;
  view.setUint8(o, langBytes.length); o += 1;
  new Uint8Array(buf, o, langBytes.length).set(langBytes); o += langBytes.length;
  view.setUint16(o, alphaBytes.length, true); o += 2;
  new Uint8Array(buf, o, alphaBytes.length).set(alphaBytes); o += alphaBytes.length;
  view.setUint32(o, count, true); o += 4;
  view.setUint32(o, root.firstEdge, true); o += 4;
  view.setUint32(o, edges.length, true); o += 4;
  for (let k = 0; k < edges.length; k++) {
    view.setUint32(o, edges[k], true);
    o += 4;
  }
  return new Uint8Array(buf);
}

// ---------------------------------------------------------------------------
// Decode (runtime): bytes → Lexicon with O(len) has()
// ---------------------------------------------------------------------------

export function decodeLexicon(bytes: Uint8Array): Lexicon {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let o = 0;
  if (view.getUint32(o, true) !== MAGIC) throw new Error('decodeLexicon: bad magic');
  o += 4;
  const version = view.getUint8(o); o += 1;
  if (version !== VERSION) throw new Error(`decodeLexicon: unsupported version ${version}`);
  const langLen = view.getUint8(o); o += 1;
  const language = new TextDecoder().decode(new Uint8Array(bytes.buffer, bytes.byteOffset + o, langLen)) as LexiconLanguage;
  o += langLen;
  const alphaLen = view.getUint16(o, true); o += 2;
  const alphabet = new TextDecoder().decode(new Uint8Array(bytes.buffer, bytes.byteOffset + o, alphaLen));
  o += alphaLen;
  const wordCount = view.getUint32(o, true); o += 4;
  const rootFirstEdge = view.getUint32(o, true); o += 4;
  const edgeCount = view.getUint32(o, true); o += 4;

  const edges = new Uint32Array(edgeCount);
  for (let k = 0; k < edgeCount; k++) {
    edges[k] = view.getUint32(o, true);
    o += 4;
  }

  // letter → code, over code points (so 'Ą' is one entry).
  const codeOf = new Map<string, number>();
  Array.from(alphabet).forEach((ch, idx) => codeOf.set(ch, idx));

  const has = (word: string): boolean => {
    const codes: number[] = [];
    for (const ch of letters(normalizeWord(word))) {
      const c = codeOf.get(ch);
      if (c === undefined) return false; // a letter not in this alphabet → not a word
      codes.push(c);
    }
    if (codes.length === 0) return false;
    let node = rootFirstEdge;
    for (let k = 0; k < codes.length; k++) {
      if (node === 0) return false; // no children left but letters remain
      let i = node;
      let matched = false;
      for (;;) {
        const e = edges[i];
        if (((e >>> 2) & 0x3f) === codes[k]) {
          if (k === codes.length - 1) return ((e >>> 1) & 1) === 1;
          node = e >>> 8;
          matched = true;
          break;
        }
        if ((e & 1) === 1) break; // last edge of this node, no match
        i += 1;
      }
      if (!matched) return false;
    }
    return false;
  };

  return { language, has, wordCount };
}

/**
 * Convenience: build a Lexicon directly from an in-memory word list (no file).
 * Normalizes, de-dupes and sorts, so callers can pass raw words. Handy for tests
 * and small fixtures.
 */
export function lexiconFromWords(language: LexiconLanguage, words: string[]): Lexicon {
  const norm = [...new Set(words.map(normalizeWord))].sort();
  return decodeLexicon(encodeLexicon(language, norm));
}
