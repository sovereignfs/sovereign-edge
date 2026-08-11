import { Text, View } from 'react-native';

import { useTheme } from '../ThemeProvider';

export type SectionLabelProps = { children: string };

export function SectionLabel({ children }: SectionLabelProps) {
  const theme = useTheme();
  return (
    <View
      style={{
        paddingHorizontal: theme.space[4],
        paddingTop: theme.space[5],
        paddingBottom: theme.space[2],
      }}
    >
      <Text
        style={{
          color: theme.colors.textMuted,
          fontSize: theme.fontSize.label,
          fontFamily: theme.fontFamily.body,
          letterSpacing: 1,
        }}
      >
        {children.toUpperCase()}
      </Text>
    </View>
  );
}
