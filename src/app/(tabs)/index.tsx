import { useKeepAwake } from 'expo-keep-awake';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Pill } from '@/components/Pill';
import { Screen } from '@/components/Screen';
import { SignalBar } from '@/components/SignalBar';
import { StatusBanner } from '@/components/StatusBanner';
import { text } from '@/components/typography';
import { getUserByToken } from '@/data/users';
import { useRadar } from '@/store/radar';
import { useSession } from '@/store/session';
import { colors, spacing } from '@/theme';
import type { PeerState, User } from '@/types';

function KeepAwake() {
  useKeepAwake();
  return null;
}

export default function NearbyScreen() {
  const scanning = useSession((s) => s.scanning);
  const setScanning = useSession((s) => s.setScanning);
  const threshold = useSession((s) => s.threshold);
  const status = useRadar((s) => s.status);
  const error = useRadar((s) => s.error);
  const peers = useRadar((s) => s.peers);

  const inRange = useMemo(() => {
    const rows: { peer: PeerState; user: User }[] = [];
    for (const peer of Object.values(peers)) {
      const user = peer.isMatch ? getUserByToken(peer.token) : undefined;
      if (user) rows.push({ peer, user });
    }
    return rows.sort((a, b) => b.peer.smoothedRssi - a.peer.smoothedRssi);
  }, [peers]);

  return (
    <Screen>
      {scanning ? <KeepAwake /> : null}
      <Button
        size="lg"
        variant={scanning ? 'danger' : 'primary'}
        label={scanning ? 'Stop scanning' : 'Start scanning'}
        onPress={() => setScanning(!scanning)}
      />
      <StatusBanner status={status} error={error} />
      <Text style={text.small}>Alert threshold: {threshold} dBm</Text>

      <Text style={[text.section, styles.sectionTitle]}>Matches in range</Text>
      {inRange.length === 0 ? (
        <Text style={text.muted}>No matches in range yet. Keep the app open and walk around.</Text>
      ) : (
        inRange.map(({ peer, user }) => (
          <Card key={peer.token} highlight={peer.isNear}>
            <View style={styles.row}>
              <View style={styles.info}>
                <Text style={text.heading}>{user.name}</Text>
                <Text style={text.muted}>
                  {user.role} @ {user.company}
                </Text>
              </View>
              {peer.isNear ? <Pill label="Near" tone="near" /> : null}
            </View>
            <View style={styles.signal}>
              <SignalBar rssi={peer.smoothedRssi} near={peer.isNear} />
              <Text style={[text.small, peer.isNear && styles.nearText]}>
                {Math.round(peer.smoothedRssi)} dBm
              </Text>
            </View>
          </Card>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    marginTop: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  info: {
    flex: 1,
    gap: spacing.xs,
  },
  signal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  nearText: {
    color: colors.near,
  },
});
