import { StyleSheet, Text, View } from 'react-native';

import { useRoster } from '@/store/roster';
import { colors, font, spacing } from '@/theme';

export function BrandBar() {
  const eventName = useRoster((s) => s.event?.name);

  return (
    <View style={styles.row}>
      <View style={styles.brand}>
        <View style={styles.mark}>
          <View style={styles.pointer} />
        </View>
        <Text style={styles.wordmark}>Arrow</Text>
      </View>
      <Text style={styles.event} numberOfLines={1}>
        {eventName}
      </Text>
    </View>
  );
}

const MARK_SIZE = 18;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    minHeight: 44,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  mark: {
    width: MARK_SIZE,
    height: MARK_SIZE,
    borderRadius: MARK_SIZE / 2,
    borderWidth: 1.5,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pointer: {
    width: 0,
    height: 0,
    marginBottom: 1,
    borderLeftWidth: 3.5,
    borderRightWidth: 3.5,
    borderBottomWidth: 7,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: colors.primary,
    transform: [{ rotate: '35deg' }],
  },
  wordmark: {
    color: colors.text,
    fontSize: font.small,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  event: {
    flexShrink: 1,
    color: colors.textMuted,
    fontSize: font.small,
  },
});
