import { router, Tabs, usePathname } from 'expo-router';
import { useEffect, useRef } from 'react';

import { useLiveMatch } from '@/live/useLiveMatch';
import { useProximity } from '@/proximity/useProximity';
import { useRadar } from '@/store/radar';
import { colors, font } from '@/theme';

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
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: colors.background },
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarIconStyle: { display: 'none' },
        tabBarLabelStyle: { fontSize: font.body, fontWeight: '600' },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Nearby' }} />
      <Tabs.Screen name="matches" options={{ title: 'Match' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
      <Tabs.Screen name="debug" options={{ title: 'Debug' }} />
    </Tabs>
  );
}
