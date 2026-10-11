import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { API_URL } from '@/api/client';
import { Button } from '@/components/Button';
import { text } from '@/components/typography';
import { useRoster } from '@/store/roster';
import { useSession } from '@/store/session';
import { colors, spacing } from '@/theme';

export default function RootLayout() {
  const hasHydrated = useSession((s) => s.hasHydrated);
  const currentUserId = useSession((s) => s.currentUserId);
  const rosterStatus = useRoster((s) => s.status);
  const rosterError = useRoster((s) => s.error);
  const hasUser = useRoster((s) => (currentUserId ? s.byId.has(currentUserId) : false));
  const loadRoster = useRoster((s) => s.load);

  useEffect(() => {
    loadRoster();
  }, [loadRoster]);

  if (rosterStatus === 'error') {
    return (
      <View style={styles.loading}>
        <StatusBar style="light" />
        <Text style={[text.heading, styles.center]}>Can&apos;t load the event</Text>
        <Text style={[text.muted, styles.center]}>{rosterError}</Text>
        <Text style={[text.small, styles.center]}>Matchmaker: {API_URL}</Text>
        <Button label="Retry" onPress={loadRoster} />
      </View>
    );
  }

  if (!hasHydrated || rosterStatus !== 'ready') {
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
            options={{ presentation: 'modal', headerShown: false }}
          />
          <Stack.Screen
            name="find/[token]"
            options={{ presentation: 'fullScreenModal', animation: 'fade', headerShown: false }}
          />
          <Stack.Screen name="devices" options={{ title: 'Signal test' }} />
          <Stack.Screen
            name="signal/[deviceId]"
            options={{ presentation: 'fullScreenModal', animation: 'fade', headerShown: false }}
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
    gap: spacing.md,
    padding: spacing.xl,
  },
  center: {
    textAlign: 'center',
  },
});
