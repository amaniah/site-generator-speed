// makefun-site's text rules: the HTML escape table, the slug rule and the long date (README.md, "Text").
// Combined, performance-optimised equivalents of text.js and frontmatter.js.

/** The HTML escape table, in this order: & < > " ' (README.md). */
const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

const ESCAPE_RE = /[&<>"']/g;
const ESCAPE_TEST = /[&<>"']/;

/** `text` with & < > " and ' escaped. */
export function escapeHtml(text) {
  if (!ESCAPE_TEST.test(text)) return text;
  return text.replace(ESCAPE_RE, (c) => ESCAPES[c]);
}

/** The most characters a slug keeps before a collision suffix. */
export const SLUG_MAX = 64;

const ASCII = /^[\x00-\x7F]*$/;

const slugCache = new Map();

/**
 * The slug of `text`: NFKD, combining marks dropped, A-Z lowered, every run of characters other than a-z and 0-9 one
 * "-", none at either end, at most SLUG_MAX characters (a "-" left at the cut dropped), and "untitled" when nothing is
 * left.
 */
export function slugify(text) {
  const cached = slugCache.get(text);
  if (cached !== undefined) return cached;
  let result;
  fast: {
    let allAlnum = true;
    let anyUpper = false;
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      if (c >= 97 && c <= 122) continue;
      if (c >= 65 && c <= 90) { anyUpper = true; continue; }
      if (c >= 48 && c <= 57) continue;
      allAlnum = false;
      break;
    }
    if (allAlnum) {
      let s = anyUpper ? text.toLowerCase() : text;
      s = s.slice(0, SLUG_MAX);
      result = s === '' ? 'untitled' : s;
      break fast;
    }
    let plain;
    if (ASCII.test(text)) plain = text;
    else plain = text.normalize('NFKD').replace(/\p{M}/gu, '');
    const pieces = [];
    let gap = false;
    for (const ch of plain) {
      let keep = null;
      if (ch >= 'A' && ch <= 'Z') keep = ch.toLowerCase();
      else if ((ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9')) keep = ch;
      if (keep === null) {
        gap = pieces.length > 0;
        continue;
      }
      if (gap) pieces.push('-');
      gap = false;
      pieces.push(keep);
    }
    let out = pieces.join('').slice(0, SLUG_MAX).replace(/-+$/, '');
    result = out === '' ? 'untitled' : out;
  }
  if (slugCache.size < 10000) slugCache.set(text, result);
  return result;
}

/** `slug` made unique against `taken` (and added to it): the first of slug, slug-2, slug-3 ... not taken. */
export function uniqueSlug(slug, taken) {
  let out = slug;
  for (let n = 2; taken.has(out); n++) out = `${slug}-${n}`;
  taken.add(out);
  return out;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const dateCache = new Map();

/** A YYYY-MM-DD date in words, from the string alone: "2026-11-09" is "9 November 2026". */
export function longDate(date) {
  const cached = dateCache.get(date);
  if (cached !== undefined) return cached;
  const [y, m, d] = date.split('-');
  const result = `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`;
  if (dateCache.size < 10000) dateCache.set(date, result);
  return result;
}

// makefun-site's front matter (README.md, "Front matter"): a strict subset of YAML's block mappings, its own. A source
// opens on a line "---" and its front matter runs to the next line "---"; every line between is blank, a comment
// ("#" first) or "key: value" with one space after the colon. Seven keys are known, each with its own value grammar,
// and anything else refuses the file with the first reason met, line by line.

/** The keys a source's front matter may give. */
export const KEYS = Object.freeze(['title', 'date', 'tags', 'draft', 'layout', 'slug', 'summary']);

const LINE = /^([a-z_]+):(?: (.*))?$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const NAME = /^[a-z0-9-]+$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TAG = /^[^"[\]]+$/;

/** The days of month `m` (1-12) of year `y`, by the Gregorian rule. */
function daysIn(y, m) {
  if (m === 2) return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28;
  return [4, 6, 9, 11].includes(m) ? 30 : 31;
}

/** A string value: "..." with \" and \\ its only escapes, or bare, the rest of the line (never opening on " or [). */
function stringOf(raw) {
  if (raw.startsWith('"')) {
    if (raw.length < 2 || !raw.endsWith('"')) return { error: 'a quoted string is not closed' };
    let out = '';
    for (let i = 1; i < raw.length - 1; i++) {
      const c = raw[i];
      if (c === '\\') {
        const n = raw[i + 1];
        if ((n !== '"' && n !== '\\') || i + 1 === raw.length - 1) return { error: 'a quoted string holds an escape other than \\" or \\\\' };
        out += n;
        i++;
      } else if (c === '"') return { error: 'a quoted string holds a stray quote' };
      else out += c;
    }
    return { value: out };
  }
  if (raw.startsWith('[')) return { error: 'a bare string opens on [' };
  return { value: raw };
}

/** One key's value, or why it is refused. */
function valueOf(key, raw) {
  switch (key) {
    case 'title':
    case 'summary': {
      const s = stringOf(raw);
      return 'error' in s ? { error: `key "${key}": ${s.error}` } : s;
    }
    case 'date': {
      const m = DATE.exec(raw);
      const y = m ? Number(m[1]) : 0;
      const mo = m ? Number(m[2]) : 0;
      const d = m ? Number(m[3]) : 0;
      if (!m || y < 1970 || y > 2099 || mo < 1 || mo > 12 || d < 1 || d > daysIn(y, mo)) return { error: 'key "date": not a date from 1970-01-01 to 2099-12-31 (YYYY-MM-DD)' };
      return { value: raw };
    }
    case 'tags': {
      if (!raw.startsWith('[') || !raw.endsWith(']')) return { error: 'key "tags": not a list [a, b]' };
      const inner = raw.slice(1, -1);
      if (inner.trim() === '') return { value: [] };
      const tags = inner.split(',').map((t) => t.trim());
      if (tags.some((t) => t === '' || !TAG.test(t))) return { error: 'key "tags": an empty tag, or one holding " [ or ]' };
      return { value: tags };
    }
    case 'draft':
      return raw === 'true' ? { value: true } : raw === 'false' ? { value: false } : { error: 'key "draft": true or false' };
    case 'layout':
      return NAME.test(raw) ? { value: raw } : { error: 'key "layout": not a template name' };
    case 'slug':
      return SLUG.test(raw) && raw.length <= 64 ? { value: raw } : { error: 'key "slug": not a slug' };
    default:
      return { error: `unknown key "${key}"` };
  }
}

const BLANK = /^[ \t]*$/;

/**
 * A source's front matter and body: { data, body }, or { error } with the first reason it is refused. `text` has "\n"
 * line ends.
 */
export function parseFrontMatter(text) {
  if (text !== '---' && (text.length < 4 || text.charCodeAt(0) !== 45 || text.charCodeAt(1) !== 45 ||
      text.charCodeAt(2) !== 45 || text.charCodeAt(3) !== 10)) return { error: 'no front matter' };
  let pos;
  let lineStart;
  if (text === '---') {
    pos = 3;
    lineStart = 3;
  } else {
    pos = 4;
    lineStart = 4;
  }
  let close = -1;
  let closeEnd = -1;
  let i = 1;
  for (;;) {
    if (lineStart >= text.length) {
      const line = text.slice(lineStart);
      if (line === '---') { close = i; closeEnd = -1; }
      break;
    }
    const nl = text.indexOf('\n', lineStart);
    const end = nl === -1 ? text.length : nl;
    const line = text.slice(lineStart, end);
    if (line === '---') {
      close = i;
      closeEnd = nl === -1 ? -1 : nl + 1;
      break;
    }
    if (nl === -1) break;
    i++;
    lineStart = nl + 1;
  }
  if (close === -1) return { error: 'the front matter is not closed' };
  const data = {};
  lineStart = pos;
  for (let j = 1; j < close; j++) {
    let nl = lineStart >= text.length ? -1 : text.indexOf('\n', lineStart);
    const end = nl === -1 ? text.length : nl;
    const line = text.slice(lineStart, end);
    lineStart = end + 1;
    if (BLANK.test(line) || line.charCodeAt(0) === 35) continue;
    const m = LINE.exec(line);
    if (!m) return { error: `line ${j + 1} is not "key: value"` };
    const key = m[1];
    const raw = (m[2] ?? '').replace(/[ \t]+$/, '');
    if (!KEYS.includes(key)) return { error: `unknown key "${key}"` };
    if (Object.hasOwn(data, key)) return { error: `key "${key}" is given twice` };
    if (raw === '') return { error: `key "${key}" has no value` };
    const v = valueOf(key, raw);
    if ('error' in v) return v;
    data[key] = v.value;
  }
  if (!Object.hasOwn(data, 'title')) return { error: 'no title' };
  return { data, body: closeEnd === -1 ? '' : text.slice(closeEnd) };
}

/** Empty every module-level cache. */
export function clearCaches() {
  slugCache.clear();
  dateCache.clear();
}
