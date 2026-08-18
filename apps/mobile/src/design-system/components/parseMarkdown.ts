/**
 * A small, purpose-built markdown parser for chat replies (not a general
 * CommonMark implementation) — see `Markdown.tsx`'s own doc comment for why
 * this exists as hand-rolled code rather than a library.
 *
 * Covers what on-device models actually emit in practice: bold, italic,
 * inline code, fenced code blocks, headings, and bullet/numbered lists. No
 * links, images, tables, blockquotes, or nested emphasis (`***bold
 * italic***`) — none observed yet, and each is easy to add here later if
 * one shows up.
 */

export type InlineSpan =
  | { kind: 'text'; text: string }
  | { kind: 'bold'; text: string }
  | { kind: 'italic'; text: string }
  | { kind: 'code'; text: string };

export type Block =
  | { kind: 'paragraph'; text: string }
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'bulletList'; items: string[] }
  | { kind: 'orderedList'; items: string[] }
  | { kind: 'codeBlock'; code: string };

const FENCE = /^```/;
const HEADING = /^(#{1,3})\s+(.*)$/;
const BULLET = /^[-*+]\s+(.*)$/;
const ORDERED = /^\d+\.\s+(.*)$/;

/**
 * Line-based block parser. Deliberately tolerant of an unterminated fence —
 * a streamed reply can be mid code-block when a token arrives — by treating
 * "ran out of lines" the same as "found the closing fence": whatever is
 * there so far renders as a code block, rather than being held back or
 * thrown away.
 */
export function parseBlocks(text: string): Block[] {
  const lines = text.split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    if (line.trim() === '') {
      i++;
      continue;
    }

    if (FENCE.test(line.trim())) {
      i++;
      const codeLines: string[] = [];
      while (i < lines.length && !FENCE.test(lines[i]!.trim())) {
        codeLines.push(lines[i]!);
        i++;
      }
      i++; // skip the closing fence, if there was one to skip
      blocks.push({ kind: 'codeBlock', code: codeLines.join('\n') });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({
        kind: 'heading',
        level: heading[1]!.length,
        text: heading[2]!,
      });
      i++;
      continue;
    }

    if (BULLET.test(line)) {
      const items: string[] = [];
      while (i < lines.length && BULLET.test(lines[i]!)) {
        items.push(BULLET.exec(lines[i]!)![1]!);
        i++;
      }
      blocks.push({ kind: 'bulletList', items });
      continue;
    }

    if (ORDERED.test(line)) {
      const items: string[] = [];
      while (i < lines.length && ORDERED.test(lines[i]!)) {
        items.push(ORDERED.exec(lines[i]!)![1]!);
        i++;
      }
      blocks.push({ kind: 'orderedList', items });
      continue;
    }

    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i]!.trim() !== '' &&
      !FENCE.test(lines[i]!.trim()) &&
      !HEADING.test(lines[i]!) &&
      !BULLET.test(lines[i]!) &&
      !ORDERED.test(lines[i]!)
    ) {
      paraLines.push(lines[i]!);
      i++;
    }
    blocks.push({ kind: 'paragraph', text: paraLines.join('\n') });
  }

  return blocks;
}

/**
 * Inline-span parser: bold (`**x**`), italic (`*x*`/`_x_`), and inline code
 * (`` `x` ``). A single left-to-right scan, no backtracking — an opening
 * marker with no matching close (the norm mid-stream, e.g. `**Berl` before
 * the closing `**` has arrived yet) falls through and is emitted as plain
 * text character-by-character, rather than either swallowing the rest of
 * the string as formatted or throwing. Re-parsing the whole string on every
 * token is what makes this safe: the moment the closing marker streams in,
 * the very next parse renders it correctly, at the cost of a one-token
 * flicker where the raw marker briefly shows literally. Accepted rather
 * than solved — a chat bubble redrawing on every token already repaints
 * regardless.
 */
export function parseInline(text: string): InlineSpan[] {
  const spans: InlineSpan[] = [];
  let buffer = '';
  let i = 0;

  const flush = () => {
    if (buffer) {
      spans.push({ kind: 'text', text: buffer });
      buffer = '';
    }
  };

  while (i < text.length) {
    if (text[i] === '`') {
      const close = text.indexOf('`', i + 1);
      if (close !== -1) {
        flush();
        spans.push({ kind: 'code', text: text.slice(i + 1, close) });
        i = close + 1;
        continue;
      }
    }

    if (text.startsWith('**', i)) {
      const close = text.indexOf('**', i + 2);
      if (close !== -1) {
        flush();
        spans.push({ kind: 'bold', text: text.slice(i + 2, close) });
        i = close + 2;
        continue;
      }
    }

    if (text[i] === '*' || text[i] === '_') {
      const marker = text[i]!;
      const close = text.indexOf(marker, i + 1);
      if (close !== -1 && close > i + 1) {
        flush();
        spans.push({ kind: 'italic', text: text.slice(i + 1, close) });
        i = close + 1;
        continue;
      }
    }

    buffer += text[i];
    i++;
  }

  flush();
  return spans;
}
