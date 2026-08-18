import { Fragment } from 'react';
import { Text, View, type TextStyle } from 'react-native';

import { useTheme } from '../ThemeProvider';
import { parseBlocks, parseInline } from './parseMarkdown';

export type MarkdownProps = {
  text: string;
  /** Matches the surrounding bubble's text color — user vs. assistant, or
   * an error state — rather than a fixed color of its own. */
  color: string;
  fontSize: number;
  fontFamily: string;
};

/**
 * Renders a chat reply's markdown (bold, italic, inline code, fenced code
 * blocks, headings, bullet/numbered lists) into themed React Native views,
 * matching the bubble's own color and type rather than a library's default
 * look.
 *
 * Hand-rolled rather than a markdown library: the syntax on-device models
 * actually produce is narrow (mostly `**bold**` and `* bullets`), and a
 * general CommonMark engine brings a full spec (tables, footnotes, raw
 * HTML, …) and its own default styling to override for a chat bubble that
 * will only ever need a handful of constructs. `parseMarkdown.ts` carries
 * the actual parsing and the streaming-safety reasoning.
 */
export function Markdown({ text, color, fontSize, fontFamily }: MarkdownProps) {
  const theme = useTheme();
  const blocks = parseBlocks(text);
  const base: TextStyle = { color, fontSize, fontFamily };

  return (
    <View style={{ gap: theme.space[2] }}>
      {blocks.map((block, index) => {
        switch (block.kind) {
          case 'heading':
            return (
              <InlineText
                key={index}
                text={block.text}
                base={{
                  ...base,
                  fontSize: fontSize + (4 - block.level) * 2,
                  fontWeight: theme.fontWeight.semibold,
                }}
                codeBackground={theme.colors.surfaceSunken}
                codeFontFamily={theme.fontFamily.mono}
              />
            );

          case 'bulletList':
          case 'orderedList':
            return (
              <View key={index} style={{ gap: theme.space[1] }}>
                {block.items.map((item, itemIndex) => (
                  <View
                    key={itemIndex}
                    style={{ flexDirection: 'row', gap: theme.space[1] }}
                  >
                    <Text style={base}>
                      {block.kind === 'bulletList' ? '•' : `${itemIndex + 1}.`}
                    </Text>
                    <View style={{ flex: 1 }}>
                      <InlineText
                        text={item}
                        base={base}
                        codeBackground={theme.colors.surfaceSunken}
                        codeFontFamily={theme.fontFamily.mono}
                      />
                    </View>
                  </View>
                ))}
              </View>
            );

          case 'codeBlock':
            return (
              <View
                key={index}
                style={{
                  backgroundColor: theme.colors.surfaceSunken,
                  borderRadius: theme.radius.sm,
                  padding: theme.space[2],
                }}
              >
                <Text
                  style={{
                    color,
                    fontSize,
                    fontFamily: theme.fontFamily.mono,
                  }}
                >
                  {block.code}
                </Text>
              </View>
            );

          case 'paragraph':
          default:
            return (
              <InlineText
                key={index}
                text={block.text}
                base={base}
                codeBackground={theme.colors.surfaceSunken}
                codeFontFamily={theme.fontFamily.mono}
              />
            );
        }
      })}
    </View>
  );
}

/**
 * One outer `<Text>` with styled `<Text>` children for bold/italic/code
 * spans — React Native only reflows inline formatting correctly when the
 * spans are nested `Text`, not separate sibling `View`s, which is why this
 * is a single component rather than each span rendering itself.
 */
function InlineText({
  text,
  base,
  codeBackground,
  codeFontFamily,
}: {
  text: string;
  base: TextStyle;
  codeBackground: string;
  codeFontFamily: string;
}) {
  const spans = parseInline(text);
  return (
    <Text style={base}>
      {spans.map((span, index) => {
        switch (span.kind) {
          case 'bold':
            return (
              <Text key={index} style={{ fontWeight: '700' }}>
                {span.text}
              </Text>
            );
          case 'italic':
            return (
              <Text key={index} style={{ fontStyle: 'italic' }}>
                {span.text}
              </Text>
            );
          case 'code':
            return (
              <Text
                key={index}
                style={{
                  fontFamily: codeFontFamily,
                  backgroundColor: codeBackground,
                }}
              >
                {' '}
                {span.text}{' '}
              </Text>
            );
          case 'text':
          default:
            return <Fragment key={index}>{span.text}</Fragment>;
        }
      })}
    </Text>
  );
}
