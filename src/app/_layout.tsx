import {
  Fraunces_500Medium_Italic,
  Fraunces_600SemiBold,
} from '@expo-google-fonts/fraunces';
import {
  InstrumentSans_400Regular,
  InstrumentSans_500Medium,
  InstrumentSans_600SemiBold,
} from '@expo-google-fonts/instrument-sans';
import {
  JetBrainsMono_500Medium,
  JetBrainsMono_800ExtraBold,
} from '@expo-google-fonts/jetbrains-mono';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { API_URL } from '@/api/client';
import { Button } from '@/components/Button';
import { text } from '@/components/typography';
import { useRoster } from '@/store/roster';
import { useSession } from '@/store/session';
import { colors, fonts, spacing } from '@/theme';

export default function RootLayout() {
  const hasHydrated = useSession((s) => s.hasHydrated);
  const currentUserId = useSession((s) => s.currentUserId);
  const rosterStatus = useRoster((s) => s.status);
  const rosterError = useRoster((s) => s.error);
  const hasUser = useRoster((s) => (currentUserId ? s.byId.has(currentUserId) : false));
  const loadRoster = useRoster((s) => s.load);
  // Keys must match the family names in theme.ts `fonts`.
  const [fontsLoaded, fontError] = useFonts({
    Fraunces_600SemiBold,
    Fraunces_500Medium_Italic,
    InstrumentSans_400Regular,
    InstrumentSans_500Medium,
    InstrumentSans_600SemiBold,
    JetBrainsMono_500Medium,
    JetBrainsMono_800ExtraBold,
  });
  // On a font error, carry on with system fonts rather than spinning forever.
  const fontsReady = fontsLoaded || fontError !== null;

  useEffect(() => {
    loadRoster();
  }, [loadRoster]);

  if (fontsReady && rosterStatus === 'error') {
    return (
      <View style={styles.loading}>
        <StatusBar style="dark" />
        <Text style={[text.heading, styles.center]}>Can&apos;t load the event</Text>
        <Text style={[text.muted, styles.center]}>{rosterError}</Text>
        <Text style={[text.small, styles.center]}>Matchmaker: {API_URL}</Text>
        <Button label="Retry" onPress={loadRoster} />
      </View>
    );
  }

  if (!fontsReady || !hasHydrated || rosterStatus !== 'ready') {
    return (
      <View style={styles.loading}>
        <StatusBar style="dark" />
        <ActivityIndicator color={colors.textMuted} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerTitleStyle: { fontFamily: fonts.display, fontSize: 20 },
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
