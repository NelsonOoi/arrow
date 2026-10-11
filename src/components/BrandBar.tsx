import { StyleSheet, Text, View } from 'react-native';

import { ArrowGlyph } from '@/components/HandMarks';
import { useRoster } from '@/store/roster';
import { colors, font, fonts, spacing } from '@/theme';

export function BrandBar() {
  const eventName = useRoster((s) => s.event?.name);

  return (
    <View style={styles.row}>
      <View style={styles.brand}>
        <ArrowGlyph size={26} />
        <Text style={styles.wordmark}>Arrow</Text>
      </View>
      <Text style={styles.event} numberOfLines={1}>
        {eventName}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    minHeight: 48,
    paddingBottom: spacing.md,
    borderBottomWidth: 1.5,
    borderBottomColor: colors.border,
    borderStyle: 'dashed',
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  wordmark: {
    color: colors.text,
    fontFamily: fonts.display,
    fontSize: 24,
    letterSpacing: -0.7,
  },
  event: {
    flexShrink: 1,
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: font.small,
  },
});
