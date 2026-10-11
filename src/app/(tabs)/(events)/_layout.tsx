import { Stack } from 'expo-router';

import { colors } from '@/theme';

/** Events list and event detail share the Events tab, so the tab bar stays visible on both. */
export default function EventsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    />
  );
}
