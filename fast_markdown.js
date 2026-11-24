import { escapeHtml, slugify, uniqueSlug } from './fast_text_fm.js';

const FENCE_OPEN = /^```([A-Za-z0-9_+-]*)[ \t]*$/;
const FENCE_CLOSE = /^```[ \t]*$/;
const HEADING = /^(#{1,6})[ \t]+(.*?)[ \t]*$/;
const HR = /^(?:---|\*\*\*)[ \t]*$/;
const BULLET = /^[-*] (.*)$/;
const ORDERED = /^(\d{1,9})\. (.*)$/;
const CONTINUED = /^ {2,}\S/;

const SPACE = 32, TAB = 9;

function isBlank(line) {
  for (let j = 0; j < line.length; j++) {
    const c = line.charCodeAt(j);
    if (c !== SPACE && c !== TAB) return false;
  }
  return true;
}

function trimLine(line) {
  let a = 0;
  let b = line.length;
  while (a < b) {
    const c = line.charCodeAt(a);
    if (c !== SPACE && c !== TAB) break;
    a++;
  }
  while (b > a) {
    const c = line.charCodeAt(b - 1);
    if (c !== SPACE && c !== TAB) break;
    b--;
  }
  return a === 0 && b === line.length ? line : line.slice(a, b);
}

function headingOf(line) {
  if (line.charCodeAt(0) !== 35) return null;
  const m = HEADING.exec(line);
  return m === null || m[2] === '' ? null : { depth: m[1].length, text: m[2] };
}

function isHr(line) {
  const c = line.charCodeAt(0);
  if (c !== 45 && c !== 42) return false;
  return HR.test(line);
}

function endsParagraph(line) {
  if (line.length === 0) return true;
  const c = line.charCodeAt(0);
  if (c === SPACE || c === TAB) {
    return isBlank(line);
  }
  if (c === 96) return FENCE_OPEN.test(line);
  if (c === 35) return headingOf(line) !== null;
  if (c === 45 || c === 42) return isHr(line);
  return false;
}

const ESCAPABLE = new Set(['\\', '`', '*', '_', '[', ']', '(', ')', '#', '+', '-', '.', '!', '>']);

function findUnescaped(s, what, from) {
  for (let j = from; j <= s.length - what.length; j++) {
    if (s[j] === '\\' && j + 1 < s.length && ESCAPABLE.has(s[j + 1])) {
      j++;
      continue;
    }
    if (s.startsWith(what, j)) return j;
  }
  return -1;
}

function findSingleStar(s, from) {
  for (let j = from; j < s.length; j++) {
    const c = s[j];
    if (c === '\\' && j + 1 < s.length && ESCAPABLE.has(s[j + 1])) {
      j++;
      continue;
    }
    if (c !== '*') continue;
    if (s[j + 1] === '*') {
      j++;
      continue;
    }
    return j;
  }
  return -1;
}

const WS = /\s/;

export function lex(src) {
  const lines = src.split('\n');
  const tokens = [];
  let i = 0;
  const len = lines.length;
  while (i < len) {
    const line = lines[i];
    const first = line.length === 0 ? 0 : line.charCodeAt(0);
    if (line.length === 0 || first === SPACE || first === TAB) {
      if (isBlank(line)) {
        i++;
        continue;
      }
    }
    if (first === 96) {
      const fence = FENCE_OPEN.exec(line);
      if (fence !== null) {
        const body = [];
        i++;
        while (i < len) {
          const l = lines[i];
          if (l.length > 0 && l.charCodeAt(0) === 96 && FENCE_CLOSE.test(l)) break;
          body.push(l);
          i++;
        }
        i++;
        tokens.push({ type: 'code', lang: fence[1], lines: body });
        continue;
      }
    }
    if (first === 35) {
      const heading = headingOf(line);
      if (heading !== null) {
        tokens.push({ type: 'heading', depth: heading.depth, text: heading.text });
        i++;
        continue;
      }
    }
    if (first === 45 || first === 42) {
      if (isHr(line)) {
        tokens.push({ type: 'hr' });
        i++;
        continue;
      }
    }
    if (first === 62) {
      const body = [];
      while (i < len && lines[i].charCodeAt(0) === 62) {
        const l = lines[i];
        body.push(l.charCodeAt(1) === 32 ? l.slice(2) : l.slice(1));
        i++;
      }
      tokens.push({ type: 'blockquote', lines: body.map(trimLine).filter((l) => l !== '') });
      continue;
    }
    let bullet = null;
    let ordered = null;
    if (first === 45 || first === 42) {
      bullet = BULLET.exec(line);
    } else if (first >= 48 && first <= 57) {
      ordered = ORDERED.exec(line);
    } else {
      bullet = BULLET.exec(line);
      if (bullet === null) ordered = ORDERED.exec(line);
    }
    if (bullet !== null || ordered !== null) {
      const isOrdered = ordered !== null;
      const marker = isOrdered ? ORDERED : BULLET;
      const items = [];
      while (i < len) {
        const l = lines[i];
        const m = marker.exec(l);
        if (m !== null) {
          items.push([trimLine(isOrdered ? m[2] : m[1])]);
          i++;
        } else if (l.charCodeAt(0) === SPACE && l.charCodeAt(1) === SPACE && CONTINUED.test(l)) {
          items[items.length - 1].push(trimLine(l));
          i++;
        } else break;
      }
      tokens.push({ type: 'list', ordered: isOrdered, start: isOrdered ? Number(ordered[1]) : 1, items: items.map((parts) => parts.join('\n')) });
      continue;
    }
    const body = [trimLine(line)];
    i++;
    while (i < len && !endsParagraph(lines[i])) body.push(trimLine(lines[i++]));
    tokens.push({ type: 'paragraph', text: body.join('\n') });
  }
  return tokens;
}

export function inline(s, env) {
  const out = [];
  const n = s.length;
  let run = 0;
  let i = 0;
  while (i < n) {
    const c = s[i];
    if (c === '\\') {
      if (i + 1 < n && ESCAPABLE.has(s[i + 1])) {
        if (i > run) out.push(escapeHtml(s.slice(run, i)));
        out.push(escapeHtml(s[i + 1]));
        i += 2;
        run = i;
        continue;
      }
      i++;
      continue;
    }
    if (c === '`') {
      const j = s.indexOf('`', i + 1);
      if (j > i + 1) {
        if (i > run) out.push(escapeHtml(s.slice(run, i)));
        out.push(`<code>${escapeHtml(s.slice(i + 1, j))}</code>`);
        i = j + 1;
        run = i;
      } else {
        i++;
      }
      continue;
    }
    if (c === '*') {
      if (s[i + 1] === '*') {
        const j = findUnescaped(s, '**', i + 2);
        if (j > i + 2) {
          if (i > run) out.push(escapeHtml(s.slice(run, i)));
          out.push(`<strong>${inline(s.slice(i + 2, j), env)}</strong>`);
          i = j + 2;
          run = i;
        } else {
          i += 2;
        }
        continue;
      }
      const j = findSingleStar(s, i + 1);
      if (j > i + 1) {
        if (i > run) out.push(escapeHtml(s.slice(run, i)));
        out.push(`<em>${inline(s.slice(i + 1, j), env)}</em>`);
        i = j + 1;
        run = i;
      } else {
        i++;
      }
      continue;
    }
    if (c === '[') {
      const k = findUnescaped(s, ']', i + 1);
      const m = k !== -1 && s[k + 1] === '(' ? s.indexOf(')', k + 2) : -1;
      const target = m === -1 ? '' : s.slice(k + 2, m);
      if (target !== '' && !WS.test(target)) {
        if (i > run) out.push(escapeHtml(s.slice(run, i)));
        out.push(`<a href="${escapeHtml(env.link(target))}">${inline(s.slice(i + 1, k), env)}</a>`);
        i = m + 1;
        run = i;
        continue;
      }
      i++;
      continue;
    }
    i++;
  }
  if (n > run) out.push(escapeHtml(s.slice(run, n)));
  return out.join('');
}

export function renderMarkdown(src, env) {
  const ids = new Set();
  const out = [];
  const toc = [];
  let excerpt = null;
  const lines = src.split('\n');
  const len = lines.length;
  let i = 0;
  while (i < len) {
    const line = lines[i];
    const first = line.length === 0 ? 0 : line.charCodeAt(0);
    if (line.length === 0 || first === SPACE || first === TAB) {
      if (isBlank(line)) {
        i++;
        continue;
      }
    }
    if (first === 96) {
      const fence = FENCE_OPEN.exec(line);
      if (fence !== null) {
        const lang = fence[1];
        const cls = lang === '' ? '' : ` class="language-${escapeHtml(lang)}"`;
        out.push(`<pre><code${cls}>`);
        i++;
        while (i < len) {
          const l = lines[i];
          if (l.length > 0 && l.charCodeAt(0) === 96 && FENCE_CLOSE.test(l)) break;
          out.push(escapeHtml(l), '\n');
          i++;
        }
        i++;
        out.push(`</code></pre>\n`);
        continue;
      }
    }
    if (first === 35) {
      const heading = headingOf(line);
      if (heading !== null) {
        const depth = heading.depth;
        const text = heading.text;
        const id = uniqueSlug(slugify(text), ids);
        const html = inline(text, env);
        out.push(`<h${depth} id="${id}">${html}</h${depth}>\n`);
        if (depth === 2 || depth === 3) toc.push({ level: depth, id, html });
        i++;
        continue;
      }
    }
    if (first === 45 || first === 42) {
      if (isHr(line)) {
        out.push(`<hr>\n`);
        i++;
        continue;
      }
    }
    if (first === 62) {
      const body = [];
      while (i < len && lines[i].charCodeAt(0) === 62) {
        const l = lines[i];
        const t = trimLine(l.charCodeAt(1) === 32 ? l.slice(2) : l.slice(1));
        if (t !== '') body.push(t);
        i++;
      }
      out.push(body.length === 0 ? `<blockquote>\n</blockquote>\n` : `<blockquote>\n<p>${inline(body.join('\n'), env)}</p>\n</blockquote>\n`);
      continue;
    }
    let bullet = null;
    let ordered = null;
    if (first === 45 || first === 42) {
      bullet = BULLET.exec(line);
    } else if (first >= 48 && first <= 57) {
      ordered = ORDERED.exec(line);
    } else {
      bullet = BULLET.exec(line);
      if (bullet === null) ordered = ORDERED.exec(line);
    }
    if (bullet !== null || ordered !== null) {
      const isOrdered = ordered !== null;
      const marker = isOrdered ? ORDERED : BULLET;
      const start = isOrdered ? Number(ordered[1]) : 1;
      const tag = isOrdered ? 'ol' : 'ul';
      out.push(isOrdered && start !== 1 ? `<ol start="${start}">\n` : `<${tag}>\n`);
      let parts = null;
      while (i < len) {
        const l = lines[i];
        const m = marker.exec(l);
        if (m !== null) {
          if (parts !== null) out.push(`<li>${inline(parts.join('\n'), env)}</li>\n`);
          parts = [trimLine(isOrdered ? m[2] : m[1])];
          i++;
        } else if (parts !== null && l.charCodeAt(0) === SPACE && l.charCodeAt(1) === SPACE && CONTINUED.test(l)) {
          parts.push(trimLine(l));
          i++;
        } else break;
      }
      if (parts !== null) out.push(`<li>${inline(parts.join('\n'), env)}</li>\n`);
      out.push(`</${tag}>\n`);
      continue;
    }
    const body = [trimLine(line)];
    i++;
    while (i < len && !endsParagraph(lines[i])) body.push(trimLine(lines[i++]));
    const html = inline(body.join('\n'), env);
    if (excerpt === null) excerpt = html;
    out.push(`<p>${html}</p>\n`);
  }
  return { html: out.join(''), toc, excerpt: excerpt ?? '' };
}
