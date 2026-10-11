import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Platform, Text } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { FinderView } from '@/components/FinderView';
import { FoundSheet } from '@/components/FoundSheet';
import { Screen } from '@/components/Screen';
import { text } from '@/components/typography';
import { firstName, getUserById, getUserByToken, matchColor, matchKeyword } from '@/data/users';
import { vibrateProximityAlert } from '@/haptics/alert';
import { useDemoSignal } from '@/proximity/useDemoSignal';
import { useScanWhileMounted } from '@/proximity/useScanWhileMounted';
import { useSignal } from '@/proximity/useSignal';
import { useRadar } from '@/store/radar';
import { useSession } from '@/store/session';

/** Signal strength (0..1) that counts as standing together; matches the "Very close" level. */
const STRONG_STRENGTH = 0.65;
/** How long the signal has to stay strong before we ask "Found them?". */
const HOLD_MS = 3_000;
/** If nobody answers the sheet, assume they found each other after this long. */
const AUTO_FOUND_MS = 5_000;
/** After "Not yet", wait at least this long before asking again. */
const SNOOZE_MS = 10_000;

// Opened either from a match card modal or from a tab; both should land back on the tabs.
function close() {
  if (router.canDismiss()) {
    router.dismissAll();
  } else {
    router.replace('/');
  }
}

export default function FindScreen() {
  useScanWhileMounted();
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const token = (Array.isArray(params.token) ? params.token[0] : params.token) ?? '';
  const user = getUserByToken(token);
  const currentUser = useSession((s) => getUserById(s.currentUserId));
  const markFound = useSession((s) => s.markFound);
  const peer = useRadar((s) => s.peers[token]);
  const demoSignal = useDemoSignal(Platform.OS === 'web' && !!user);

  const signal = peer ? { rssi: peer.smoothedRssi, lastSeen: peer.lastSeen } : demoSignal;
  const reading = useSignal(signal);
  const strong = reading.live && reading.strength >= STRONG_STRENGTH;

  const [promptedAt, setPromptedAt] = useState<number | null>(null);
  const [snoozedUntil, setSnoozedUntil] = useState(0);

  const found = useCallback(() => {
    if (!user) return;
    markFound(user.id);
    router.replace({ pathname: '/decide/[token]', params: { token } });
  }, [markFound, token, user]);

  // Ask once the signal has held strong for HOLD_MS (and any snooze is over).
  useEffect(() => {
    if (!strong || promptedAt !== null) return;
    const wait = Math.max(HOLD_MS, snoozedUntil - Date.now());
    const id = setTimeout(() => {
      setPromptedAt(Date.now());
      vibrateProximityAlert().catch(() => {});
    }, wait);
    return () => clearTimeout(id);
  }, [strong, promptedAt, snoozedUntil]);

  if (!user || !currentUser) {
    return (
      <Screen edges={['top', 'left', 'right', 'bottom']}>
        <Card>
          <Text style={text.heading}>Unknown attendee</Text>
          <Text style={text.muted}>
            {token ? `Token ${token} is not in the attendee list.` : 'No token provided.'}
          </Text>
        </Card>
        <Button label="Close" variant="secondary" onPress={close} />
      </Screen>
    );
  }

  const first = firstName(user);

  return (
    <FinderView
      color={matchColor(currentUser, user)}
      title={user.name}
      keyword={matchKeyword(currentUser, user)}
      instruction={`Hold your phone up so ${first} can spot this color, then say your word.`}
      signal={signal}
      note={`Opener: ask about ${user.workingOn}`}
      onClose={close}
      overlay={
        promptedAt !== null ? (
          <FoundSheet
            name={first}
            durationMs={AUTO_FOUND_MS}
            onFound={found}
            onNotYet={() => {
              setPromptedAt(null);
              setSnoozedUntil(Date.now() + SNOOZE_MS);
            }}
          />
        ) : null
      }
    />
  );
}
