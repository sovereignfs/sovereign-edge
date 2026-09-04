import { parseBlocks, parseInline } from './parseMarkdown';

describe('parseInline', () => {
  it('emits plain text unchanged', () => {
    expect(parseInline('hello')).toEqual([{ kind: 'text', text: 'hello' }]);
  });

  it('parses bold', () => {
    expect(parseInline('The capital is **Berlin**.')).toEqual([
      { kind: 'text', text: 'The capital is ' },
      { kind: 'bold', text: 'Berlin' },
      { kind: 'text', text: '.' },
    ]);
  });

  it('parses italic with * and _', () => {
    expect(parseInline('*soft* and _also soft_')).toEqual([
      { kind: 'italic', text: 'soft' },
      { kind: 'text', text: ' and ' },
      { kind: 'italic', text: 'also soft' },
    ]);
  });

  it('parses inline code', () => {
    expect(parseInline('run `npm test` now')).toEqual([
      { kind: 'text', text: 'run ' },
      { kind: 'code', text: 'npm test' },
      { kind: 'text', text: ' now' },
    ]);
  });

  it('prefers bold over italic when both markers are present', () => {
    expect(parseInline('**bold**')).toEqual([{ kind: 'bold', text: 'bold' }]);
  });

  // The exact case this parser exists to handle safely: a reply streamed
  // token-by-token is mid-formatting most of the time it's on screen.
  it('renders an unterminated bold marker as literal text, not a crash or a runaway match', () => {
    expect(parseInline('The capital is **Berl')).toEqual([
      { kind: 'text', text: 'The capital is **Berl' },
    ]);
  });

  it('renders an unterminated inline-code backtick as literal text', () => {
    expect(parseInline('run `npm test')).toEqual([
      { kind: 'text', text: 'run `npm test' },
    ]);
  });

  it('does not treat a lone asterisk as italic', () => {
    expect(parseInline('3 * 4 = 12')).toEqual([
      { kind: 'text', text: '3 * 4 = 12' },
    ]);
  });
});

describe('parseBlocks', () => {
  it('parses a plain paragraph', () => {
    expect(parseBlocks('Just a sentence.')).toEqual([
      { kind: 'paragraph', text: 'Just a sentence.' },
    ]);
  });

  it('splits on blank lines into separate paragraphs', () => {
    expect(parseBlocks('First.\n\nSecond.')).toEqual([
      { kind: 'paragraph', text: 'First.' },
      { kind: 'paragraph', text: 'Second.' },
    ]);
  });

  it('parses a heading', () => {
    expect(parseBlocks('## Historical Significance')).toEqual([
      { kind: 'heading', level: 2, text: 'Historical Significance' },
    ]);
  });

  it('groups consecutive bullet lines into one list', () => {
    expect(parseBlocks('* one\n* two\n* three')).toEqual([
      { kind: 'bulletList', items: ['one', 'two', 'three'] },
    ]);
  });

  it('groups consecutive ordered lines into one list', () => {
    expect(parseBlocks('1. one\n2. two')).toEqual([
      { kind: 'orderedList', items: ['one', 'two'] },
    ]);
  });

  it('parses a fenced code block verbatim, without inline parsing inside it', () => {
    expect(parseBlocks('```\nconst x = 1;\n**not bold**\n```')).toEqual([
      { kind: 'codeBlock', code: 'const x = 1;\n**not bold**' },
    ]);
  });

  // Reproduces the on-device finding this feature was built for: a header
  // written as a bold line, a bullet list with inline bold inside it.
  it('handles a realistic mixed reply', () => {
    const text =
      '**Historical Significance:**\n\n' +
      '* **World War II Legacy:** Berlin was heavily damaged.\n' +
      '* **German Division:** The city was divided.';
    expect(parseBlocks(text)).toEqual([
      { kind: 'paragraph', text: '**Historical Significance:**' },
      {
        kind: 'bulletList',
        items: [
          '**World War II Legacy:** Berlin was heavily damaged.',
          '**German Division:** The city was divided.',
        ],
      },
    ]);
  });

  it('closes an unterminated fenced code block at end of input rather than dropping it', () => {
    expect(parseBlocks('```\nstill going')).toEqual([
      { kind: 'codeBlock', code: 'still going' },
    ]);
  });

  it('returns nothing for an empty string', () => {
    expect(parseBlocks('')).toEqual([]);
  });
});
