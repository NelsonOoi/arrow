import { router, useLocalSearchParams } from 'expo-router';
import { Text } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { FinderView } from '@/components/FinderView';
import { Screen } from '@/components/Screen';
import { text } from '@/components/typography';
import { firstName, getUserById, getUserByToken, matchColor, sharedInterests } from '@/data/users';
import { useScanWhileMounted } from '@/proximity/useScanWhileMounted';
import { useRadar } from '@/store/radar';
import { useSession } from '@/store/session';

// Opened either from a match card modal or from a tab; both should land back on the tabs.
function close() {
  if (router.canDismiss()) {
    router.dismissAll();
  } else {
    router.replace('/(tabs)');
  }
}

export default function FindScreen() {
  useScanWhileMounted();
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const token = (Array.isArray(params.token) ? params.token[0] : params.token) ?? '';
  const user = getUserByToken(token);
  const currentUser = useSession((s) => getUserById(s.currentUserId));
  const markMet = useSession((s) => s.markMet);
  const peer = useRadar((s) => s.peers[token]);

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
  const topic = sharedInterests(currentUser, user)[0] ?? user.interests[0];

  return (
    <FinderView
      color={matchColor(currentUser, user)}
      eyebrow={`Looking for ${first}`}
      title={user.name}
      instruction={`Hold your phone up so ${first} can spot this color.`}
      signal={peer ? { rssi: peer.smoothedRssi, lastSeen: peer.lastSeen } : undefined}
      note={topic ? `Opener: ask about ${topic}` : undefined}>
      <Button
        size="lg"
        variant="ink"
        label="We found each other ✓"
        onPress={() => {
          markMet(user.id);
          close();
        }}
      />
      <Button size="lg" variant="inkSoft" label="Not now" onPress={close} />
    </FinderView>
  );
}
