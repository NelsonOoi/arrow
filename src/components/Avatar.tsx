import { StyleSheet, Text, View } from 'react-native';

import { initials } from '@/data/users';
import { colors } from '@/theme';
import type { User } from '@/types';

export function Avatar({ user, color, size = 52 }: { user: User; color: string; size?: number }) {
  return (
    <View
      accessible={false}
      style={[
        styles.circle,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: color },
      ]}>
      <Text style={[styles.initials, { fontSize: Math.round(size * 0.36) }]}>
        {initials(user)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    color: colors.ink,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
