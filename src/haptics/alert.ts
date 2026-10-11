import * as Haptics from 'expo-haptics';
import { Platform, Vibration } from 'react-native';

const IOS_SECOND_PULSE_DELAY_MS = 150;
const ANDROID_PATTERN = [0, 300, 150, 300];

/** Distinct double pulse for "a match is near". Never throws. */
export async function vibrateProximityAlert(): Promise<void> {
  try {
    if (Platform.OS === 'ios') {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, IOS_SECOND_PULSE_DELAY_MS));
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } else if (Platform.OS === 'android') {
      Vibration.vibrate(ANDROID_PATTERN);
    }
  } catch {
    // Haptics are best-effort; a failure must never break the radar loop.
  }
}

/** Confirms a direction sweep produced a bearing. Never throws. */
export function notifyDirectionFound(): void {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

/** Light tick for "the signal just got stronger" while searching. Never throws. */
export function tickSignalStronger(): void {
  Haptics.selectionAsync().catch(() => {});
}
