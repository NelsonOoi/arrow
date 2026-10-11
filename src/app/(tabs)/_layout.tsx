import { router, Tabs, usePathname } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Text, View } from 'react-native';

import { Stamp } from '@/components/Stamp';
import { useLiveMatch } from '@/live/useLiveMatch';
import { useProximity } from '@/proximity/useProximity';
import { useRadar } from '@/store/radar';
import { colors, font, fonts } from '@/theme';

const tabLabel = {
  fontFamily: fonts.monoBold,
  fontSize: font.small,
  letterSpacing: 1,
  textTransform: 'uppercase',
} as const;

function useMatchCardTrigger() {
  const head = useRadar((s) => s.alertQueue[0]);
  const pathname = usePathname();
  const blocked =
    pathname.startsWith('/match/') ||
    pathname.startsWith('/find/') ||
    pathname.startsWith('/signal/') ||
    pathname === '/devices' ||
    pathname === '/onboarding';
  // The card shifts the queue on unmount, which can land after the pathname has already
  // changed back, so remember which head was opened instead of trusting `blocked` alone.
  const openedHead = useRef<string | null>(null);

  useEffect(() => {
    if (!head) {
      openedHead.current = null;
      return;
    }
    if (blocked || openedHead.current === head) return;
    openedHead.current = head;
    router.push({ pathname: '/match/[token]', params: { token: head } });
  }, [head, blocked]);
}

export default function TabsLayout() {
  useLiveMatch();
  useProximity();
  useMatchCardTrigger();

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerTitleStyle: { fontFamily: fonts.display, fontSize: 22 },
        headerTitleAlign: 'left',
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: colors.background },
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopColor: colors.border,
          height: 64,
        },
        tabBarIconStyle: { display: 'none' },
        // Only the current tab is stamped, so "you are here" is obvious without a busy bar.
        tabBarLabel: ({ focused, children }) =>
          focused ? (
            <Stamp size="sm">
              <Text style={[tabLabel, { color: colors.ink }]}>{children}</Text>
            </Stamp>
          ) : (
            // Same padding as the stamp, so labels don't shift when the selection changes.
            <View style={{ paddingHorizontal: 10, paddingVertical: 5, marginRight: 3, marginBottom: 3 }}>
              <Text style={[tabLabel, { color: colors.textMuted }]}>{children}</Text>
            </View>
          ),
      }}>
      <Tabs.Screen name="index" options={{ title: 'Nearby' }} />
      <Tabs.Screen name="matches" options={{ title: 'Match' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
      <Tabs.Screen name="debug" options={{ title: 'Debug' }} />
    </Tabs>
  );
}
