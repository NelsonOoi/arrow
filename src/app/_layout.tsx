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
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { DeviceFrame } from '@/components/DeviceFrame';
import { getUserById } from '@/data/users';
import { useSession } from '@/store/session';
import { colors, fonts } from '@/theme';

export default function RootLayout() {
  const hasHydrated = useSession((s) => s.hasHydrated);
  const hasUser = useSession((s) => getUserById(s.currentUserId) !== undefined);
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
  if (!hasHydrated || (!fontsLoaded && !fontError)) {
    return (
      <DeviceFrame>
        <View style={styles.loading}>
          <StatusBar style="dark" />
          <ActivityIndicator color={colors.textMuted} />
        </View>
      </DeviceFrame>
    );
  }

  return (
    <DeviceFrame>
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
          <Stack.Screen
            name="decide/[token]"
            options={{ presentation: 'fullScreenModal', gestureEnabled: false, headerShown: false }}
          />
          <Stack.Screen name="devices" options={{ title: 'Signal test' }} />
          <Stack.Screen
            name="signal/[deviceId]"
            options={{ presentation: 'fullScreenModal', animation: 'fade', headerShown: false }}
          />
        </Stack.Protected>
        <Stack.Screen name="onboarding" options={{ title: 'Who are you?' }} />
      </Stack>
    </DeviceFrame>
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
