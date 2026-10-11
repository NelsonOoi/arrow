import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { SignalMeter } from '@/components/SignalMeter';
import { StatusBanner } from '@/components/StatusBanner';
import { text } from '@/components/typography';
import { signalStrength } from '@/proximity/signal';
import { useScanWhileMounted } from '@/proximity/useScanWhileMounted';
import { useRadar } from '@/store/radar';
import { colors, font, radius, spacing } from '@/theme';
import type { NearbyDevice } from '@/types';

const MAX_ROWS = 40;
/** Rows re-sort on this interval rather than on every advertisement, so they hold still long enough to tap. */
const RESORT_MS = 2_500;

function sortedIds(devices: Record<string, NearbyDevice>): string[] {
  return Object.values(devices)
    .sort((a, b) => b.smoothedRssi - a.smoothedRssi)
    .map((d) => d.id);
}

export default function DevicesScreen() {
  useScanWhileMounted({ allDevices: true });
  const status = useRadar((s) => s.status);
  const error = useRadar((s) => s.error);
  const devices = useRadar((s) => s.devices);
  const [order, setOrder] = useState<string[]>([]);
  const [showUnnamed, setShowUnnamed] = useState(false);

  useEffect(() => {
    const update = () => setOrder(sortedIds(useRadar.getState().devices));
    update();
    const id = setInterval(update, RESORT_MS);
    return () => clearInterval(id);
  }, []);

  const known = order.map((id) => devices[id]).filter((d): d is NearbyDevice => !!d);
  const unnamedCount = known.filter((d) => !d.name).length;
  const rows = (showUnnamed ? known : known.filter((d) => d.name)).slice(0, MAX_ROWS);

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <Text style={text.muted}>
        Every Bluetooth device around you, strongest first. Pick one, like your headphones or a
        laptop, and walk toward it to test the signal meter.
      </Text>
      {status === 'running' || status === 'starting' ? null : (
        <StatusBanner status={status} error={error} />
      )}

      <View style={styles.listHeader}>
        <Text style={text.section}>
          {known.length} {known.length === 1 ? 'device' : 'devices'}
        </Text>
        {unnamedCount > 0 ? (
          <Button
            label={showUnnamed ? 'Hide unnamed' : `Show ${unnamedCount} unnamed`}
            variant="ghost"
            onPress={() => setShowUnnamed(!showUnnamed)}
          />
        ) : null}
      </View>

      {rows.length === 0 ? (
        <Text style={text.muted}>
          {known.length === 0 ? 'Looking for devices…' : 'Only unnamed devices so far.'}
        </Text>
      ) : (
        <View style={styles.list}>
          {rows.map((device, i) => (
            <DeviceRow key={device.id} device={device} first={i === 0} />
          ))}
        </View>
      )}
    </Screen>
  );
}

function DeviceRow({ device, first }: { device: NearbyDevice; first: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${device.name ?? 'Unnamed device'}, ${Math.round(device.smoothedRssi)} dBm`}
      onPress={() =>
        router.push({
          pathname: '/signal/[deviceId]',
          params: { deviceId: device.id, name: device.name ?? '' },
        })
      }
      style={({ pressed }) => [styles.row, !first && styles.rowDivider, pressed && styles.pressed]}>
      <View style={styles.rowText}>
        <Text style={styles.name} numberOfLines={1}>
          {device.name ?? 'Unnamed device'}
        </Text>
        <Text style={styles.id} numberOfLines={1}>
          {device.id}
        </Text>
      </View>
      <SignalMeter
        strength={signalStrength(device.smoothedRssi)}
        color={colors.primary}
        trackColor={colors.surfaceRaised}
      />
      <Text style={styles.dbm}>{Math.round(device.smoothedRssi)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  list: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  pressed: {
    backgroundColor: colors.surfaceRaised,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  name: {
    color: colors.text,
    fontSize: font.body,
    fontWeight: '600',
  },
  id: {
    ...text.mono,
    color: colors.textMuted,
    fontSize: font.caption,
  },
  dbm: {
    ...text.mono,
    width: 32,
    textAlign: 'right',
    color: colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
});
