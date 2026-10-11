import { StyleSheet, Text, View } from 'react-native';

import {
  DEFAULT_RSSI_THRESHOLD,
  MAX_RSSI_THRESHOLD,
  MIN_RSSI_THRESHOLD,
  RSSI_THRESHOLD_STEP,
} from '@/ble/constants';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { text } from '@/components/typography';
import { useSession } from '@/store/session';
import { spacing } from '@/theme';

/** Stepper for the RSSI threshold a match has to cross before the phone buzzes. */
export function AlertDistance() {
  const threshold = useSession((s) => s.threshold);
  const setThreshold = useSession((s) => s.setThreshold);

  return (
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
  );
}

const styles = StyleSheet.create({
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
