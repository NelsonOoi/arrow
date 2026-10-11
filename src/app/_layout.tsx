import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { getUserById } from '@/data/users';
import { useSession } from '@/store/session';
import { colors } from '@/theme';

export default function RootLayout() {
  const hasHydrated = useSession((s) => s.hasHydrated);
  const hasUser = useSession((s) => getUserById(s.currentUserId) !== undefined);

  if (!hasHydrated) {
    return (
      <View style={styles.loading}>
        <StatusBar style="light" />
        <ActivityIndicator color={colors.textMuted} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.background },
        }}>
        {/* Without a valid user these routes are removed, so the stack falls back to onboarding. */}
        <Stack.Protected guard={hasUser}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="match/[token]"
            options={{ presentation: 'modal', title: 'Match nearby' }}
          />
        </Stack.Protected>
        <Stack.Screen name="onboarding" options={{ title: 'Who are you?' }} />
      </Stack>
    </>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
