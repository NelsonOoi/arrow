import { useKeepAwake } from 'expo-keep-awake';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { PulseDot } from '@/components/PulseDot';
import { Screen } from '@/components/Screen';
import { SignalMeter } from '@/components/SignalMeter';
import { StatusBanner } from '@/components/StatusBanner';
import { text } from '@/components/typography';
import { getUserById, matchColor } from '@/data/users';
import { useSignal } from '@/proximity/useSignal';
import { useLive } from '@/store/live';
import { useRadar } from '@/store/radar';
import { useSession } from '@/store/session';
import { colors, font, radius, spacing } from '@/theme';
import type { PeerState, RadarStatus, User } from '@/types';

function KeepAwake() {
  useKeepAwake();
  return null;
}

function headline(scanning: boolean, status: RadarStatus): { title: string; detail: string } {
  if (!scanning) {
    return { title: 'Scanning is off', detail: 'Turn it on to see if your match is around.' };
  }
  if (status === 'starting') return { title: 'Starting Bluetooth…', detail: 'One moment.' };
  return {
    title: 'Scanning for your match',
    detail: 'Your phone buzzes when they get close. Tap your match to find them.',
  };
}

export default function NearbyScreen() {
  const currentUser = useSession((s) => getUserById(s.currentUserId));
  const scanning = useSession((s) => s.scanning);
  const setScanning = useSession((s) => s.setScanning);
  const status = useRadar((s) => s.status);
  const error = useRadar((s) => s.error);
  const peers = useRadar((s) => s.peers);
  const partner = useLive((s) => getUserById(s.conversation?.partnerId));

  if (!currentUser) return null;
  const inRange = partner ? partner.token in peers : false;
  const { title, detail } = headline(scanning, status);
  const problem = status === 'denied' || status === 'poweredOff' || status === 'error';

  return (
    <Screen>
      {scanning ? <KeepAwake /> : null}

      <View style={styles.hero}>
        <View style={styles.heroRow}>
          <PulseDot
            color={scanning && status === 'running' ? colors.near : colors.far}
            active={scanning && status === 'running'}
          />
          <View style={styles.heroText}>
            <Text style={text.heading}>{title}</Text>
            <Text style={text.small}>{detail}</Text>
          </View>
        </View>
        <Button
          size="lg"
          variant={scanning ? 'secondary' : 'primary'}
          label={scanning ? 'Stop scanning' : 'Start scanning'}
          onPress={() => setScanning(!scanning)}
        />
      </View>

      {problem ? <StatusBanner status={status} error={error} /> : null}

      <Text style={[text.section, styles.sectionTitle]}>
        Your match{scanning && partner ? ` · ${inRange ? 'in range' : 'not in range'}` : ''}
      </Text>
      {partner ? (
        <View style={styles.list}>
          <MatchRow
            me={currentUser}
            match={partner}
            peer={peers[partner.token]}
            scanning={scanning}
            divider={false}
          />
        </View>
      ) : (
        <Text style={text.muted}>No match yet. Check in on the Match tab to get paired.</Text>
      )}
    </Screen>
  );
}

type MatchRowProps = {
  me: User;
  match: User;
  peer: PeerState | undefined;
  scanning: boolean;
  divider: boolean;
};

function MatchRow({ me, match, peer, scanning, divider }: MatchRowProps) {
  const reading = useSignal(peer ? { rssi: peer.smoothedRssi, lastSeen: peer.lastSeen } : undefined);
  const near = reading.live && !!peer?.isNear;
  const label = reading.live
    ? reading.level.label
    : scanning
      ? 'Not detected yet'
      : 'Start scanning to see signal';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Find ${match.name}. ${label}`}
      onPress={() => router.push({ pathname: '/find/[token]', params: { token: match.token } })}
      style={({ pressed }) => [styles.row, divider && styles.rowDivider, pressed && styles.pressed]}>
      <Avatar user={match} color={matchColor(me, match)} size={40} />
      <View style={styles.rowText}>
        <Text style={styles.name} numberOfLines={1}>
          {match.name}
        </Text>
        <Text style={[styles.status, near && styles.statusNear]} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <SignalMeter
        strength={reading.strength}
        color={near ? colors.near : colors.primary}
        trackColor={colors.surfaceRaised}
        bars={8}
        height={24}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  heroText: {
    flex: 1,
    gap: spacing.xs,
  },
  sectionTitle: {
    marginTop: spacing.md,
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
    minHeight: 64,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
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
    fontSize: font.headline,
    fontWeight: '600',
  },
  status: {
    color: colors.textMuted,
    fontSize: font.small,
  },
  statusNear: {
    color: colors.near,
    fontWeight: '600',
  },
});
