import { StyleSheet, View } from 'react-native';

import { colors, spacing } from '@/theme';

const MIN_RSSI = -100;
const MAX_RSSI = -40;
const BAR_COUNT = 5;

export function rssiToFraction(rssi: number): number {
  return Math.min(1, Math.max(0, (rssi - MIN_RSSI) / (MAX_RSSI - MIN_RSSI)));
}

export function SignalBar({ rssi, near = false }: { rssi: number; near?: boolean }) {
  const filled = Math.round(rssiToFraction(rssi) * BAR_COUNT);
  const activeColor = near ? colors.near : colors.primary;
  return (
    <View style={styles.row} accessibilityLabel={`Signal ${Math.round(rssi)} dBm`}>
      {Array.from({ length: BAR_COUNT }, (_, i) => (
        <View
          key={i}
          style={[
            styles.bar,
            { height: 6 + i * 4, backgroundColor: i < filled ? activeColor : colors.border },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.xs / 2,
    height: 22,
  },
  bar: {
    width: 6,
    borderRadius: 2,
  },
});
