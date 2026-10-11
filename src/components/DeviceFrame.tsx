import type { ReactNode } from 'react';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';

import { colors } from '@/theme';

/** iPhone 15-ish logical size: what the web preview should look like. */
const PHONE_WIDTH = 390;
const PHONE_HEIGHT = 844;
const BEZEL = 10;
/** Narrower than this, the browser already is a phone: go full-screen. */
const FRAME_MIN_WINDOW_WIDTH = 520;

/**
 * Web preview only: shows the app inside a phone-sized frame when the browser window is wider
 * than a phone, so screens are judged at real app dimensions. Native builds render children as is.
 */
export function DeviceFrame({ children }: { children: ReactNode }) {
  const { width, height } = useWindowDimensions();
  if (Platform.OS !== 'web' || width < FRAME_MIN_WINDOW_WIDTH) return <>{children}</>;

  // Shrink to fit short windows instead of scrolling the page.
  const scale = Math.min(1, (height - 32) / (PHONE_HEIGHT + BEZEL * 2));

  return (
    <View style={styles.page}>
      <View style={[styles.bezel, { transform: [{ scale }] }]}>
        <View style={styles.screen}>{children}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0C0C10',
  },
  bezel: {
    width: PHONE_WIDTH + BEZEL * 2,
    height: PHONE_HEIGHT + BEZEL * 2,
    padding: BEZEL,
    borderRadius: 56,
    backgroundColor: '#2A2A32',
  },
  screen: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: 46,
    backgroundColor: colors.background,
    // Makes position: fixed children (web modals, sheets) lay out inside the screen, not the window.
    transform: [{ translateX: 0 }],
  },
});
