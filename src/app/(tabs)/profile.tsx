import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { text } from '@/components/typography';
import {
  DEFAULT_RSSI_THRESHOLD,
  MAX_RSSI_THRESHOLD,
  MIN_RSSI_THRESHOLD,
  RSSI_THRESHOLD_STEP,
} from '@/ble/constants';
import { getUserById } from '@/data/users';
import { useSession } from '@/store/session';
import { spacing } from '@/theme';

export default function ProfileScreen() {
  const currentUser = useSession((s) => getUserById(s.currentUserId));
  const threshold = useSession((s) => s.threshold);
  const setThreshold = useSession((s) => s.setThreshold);
  const setScanning = useSession((s) => s.setScanning);

  const switchIdentity = () => {
    setScanning(false);
    router.push('/onboarding');
  };

  return (
    <Screen>
      {currentUser ? (
        <Card>
          <Text style={text.title}>{currentUser.name}</Text>
          <Text style={text.muted}>
            {currentUser.role} @ {currentUser.company}
          </Text>
          <Text style={text.small}>{currentUser.interests.join(' · ')}</Text>
          <Text style={text.mono}>Token {currentUser.token}</Text>
        </Card>
      ) : null}
      <Button label="Switch identity" variant="secondary" onPress={switchIdentity} />

      <Text style={[text.section, styles.sectionTitle]}>Alert distance</Text>
      <Card>
        <View style={styles.stepper}>
          <Button
            label="-"
            variant="secondary"
            style={styles.stepButton}
            disabled={threshold <= MIN_RSSI_THRESHOLD}
            onPress={() => setThreshold(threshold - RSSI_THRESHOLD_STEP)}
          />
          <Text style={[text.title, styles.value]}>{threshold} dBm</Text>
          <Button
            label="+"
            variant="secondary"
            style={styles.stepButton}
            disabled={threshold >= MAX_RSSI_THRESHOLD}
            onPress={() => setThreshold(threshold + RSSI_THRESHOLD_STEP)}
          />
        </View>
        <Text style={text.small}>Higher (closer to 0) = must be nearer to alert</Text>
        <Button
          label="Reset to default"
          variant="secondary"
          disabled={threshold === DEFAULT_RSSI_THRESHOLD}
          onPress={() => setThreshold(DEFAULT_RSSI_THRESHOLD)}
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    marginTop: spacing.md,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  stepButton: {
    width: 64,
  },
  value: {
    flex: 1,
    textAlign: 'center',
  },
});
