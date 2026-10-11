import { router, useLocalSearchParams } from 'expo-router';

import { Button } from '@/components/Button';
import { FinderView } from '@/components/FinderView';
import { useScanWhileMounted } from '@/proximity/useScanWhileMounted';
import { useRadar } from '@/store/radar';
import { colors } from '@/theme';

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? '';
}

export default function DeviceSignalScreen() {
  useScanWhileMounted({ allDevices: true });
  const params = useLocalSearchParams<{ deviceId?: string | string[]; name?: string | string[] }>();
  const deviceId = first(params.deviceId);
  const device = useRadar((s) => s.devices[deviceId]);
  // The device record is evicted once it goes quiet, so fall back to the name it was opened with.
  const name = device?.name || first(params.name) || 'Unnamed device';

  const done = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/debug');
    }
  };

  return (
    <FinderView
      color={colors.primary}
      eyebrow="Signal test"
      title={name}
      instruction="Walk toward it. The bars fill as the signal gets stronger."
      signal={device ? { rssi: device.smoothedRssi, lastSeen: device.lastSeen } : undefined}
      note={`Device ${deviceId}`}>
      <Button size="lg" variant="ink" label="Done" onPress={done} />
    </FinderView>
  );
}
