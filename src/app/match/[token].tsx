import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Pill } from '@/components/Pill';
import { Screen } from '@/components/Screen';
import { SignalBar } from '@/components/SignalBar';
import { text } from '@/components/typography';
import { getUserById, getUserByToken, sharedInterests } from '@/data/users';
import { useRadar } from '@/store/radar';
import { useSession } from '@/store/session';
import { colors, spacing } from '@/theme';

export default function MatchCardScreen() {
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const token = (Array.isArray(params.token) ? params.token[0] : params.token) ?? '';
  const user = getUserByToken(token);
  const currentUser = useSession((s) => getUserById(s.currentUserId));
  const waved = useSession((s) => (user ? s.wavedUserIds.includes(user.id) : false));
  const wave = useSession((s) => s.wave);
  const peer = useRadar((s) => s.peers[token]);

  // Runs on button dismiss and swipe dismiss alike. Only shift if this card is still the queue
  // head, so a double cleanup can never drop the next person's card.
  useEffect(() => {
    return () => {
      const { alertQueue, shiftAlertQueue } = useRadar.getState();
      if (alertQueue[0] === token) shiftAlertQueue();
    };
  }, [token]);

  const dismiss = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  };

  const shared = user && currentUser ? sharedInterests(currentUser, user) : [];

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      {user ? (
        <>
          <View style={styles.hero}>
            <Text style={styles.name}>{user.name}</Text>
            <Text style={[text.muted, styles.center]}>
              {user.role} @ {user.company}
            </Text>
            <Text style={[text.small, styles.center]}>is nearby right now</Text>
          </View>

          {shared.length > 0 ? (
            <Card>
              <Text style={text.section}>You both care about</Text>
              <View style={styles.pills}>
                {shared.map((interest) => (
                  <Pill key={interest} label={interest} tone="primary" />
                ))}
              </View>
            </Card>
          ) : null}

          <Card highlight={peer?.isNear}>
            <Text style={text.section}>Live signal</Text>
            {peer ? (
              <View style={styles.signal}>
                <SignalBar rssi={peer.smoothedRssi} near={peer.isNear} />
                <Text style={text.body}>{Math.round(peer.smoothedRssi)} dBm</Text>
                {peer.isNear ? <Pill label="Near" tone="near" /> : null}
              </View>
            ) : (
              <Text style={text.muted}>Out of range</Text>
            )}
          </Card>

          <Button
            size="lg"
            label={waved ? 'Waved' : 'Wave'}
            disabled={waved}
            onPress={() => wave(user.id)}
          />
        </>
      ) : (
        <Card>
          <Text style={text.heading}>Unknown attendee</Text>
          <Text style={text.muted}>
            {token ? `Token ${token} is not in the attendee list.` : 'No token provided.'}
          </Text>
        </Card>
      )}
      <Button label="Dismiss" variant="secondary" onPress={dismiss} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xl,
  },
  name: {
    color: colors.text,
    fontSize: 36,
    fontWeight: '800',
    textAlign: 'center',
  },
  center: {
    textAlign: 'center',
  },
  pills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  signal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
});
