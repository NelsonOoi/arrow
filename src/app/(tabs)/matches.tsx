import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { Pill } from '@/components/Pill';
import { Screen } from '@/components/Screen';
import { text } from '@/components/typography';
import { getMatches, getUserById, sharedInterests } from '@/data/users';
import { useRadar } from '@/store/radar';
import { useSession } from '@/store/session';
import { spacing } from '@/theme';

export default function MatchesScreen() {
  const currentUser = useSession((s) => getUserById(s.currentUserId));
  const wavedUserIds = useSession((s) => s.wavedUserIds);
  const peers = useRadar((s) => s.peers);

  if (!currentUser) return null;
  const matches = getMatches(currentUser);

  return (
    <Screen>
      <Text style={text.muted}>
        People you were matched with. Get close to one and your phone will buzz.
      </Text>
      {matches.map((match) => {
        const shared = sharedInterests(currentUser, match);
        const waved = wavedUserIds.includes(match.id);
        const inRange = match.token in peers;
        return (
          <Card key={match.id} highlight={peers[match.token]?.isNear}>
            <Text style={text.heading}>{match.name}</Text>
            <Text style={text.muted}>
              {match.role} @ {match.company}
            </Text>
            {shared.length > 0 ? (
              <Text style={text.small}>Shared: {shared.join(' · ')}</Text>
            ) : null}
            {waved || inRange ? (
              <View style={styles.badges}>
                {inRange ? <Pill label="In range" tone="near" /> : null}
                {waved ? <Pill label="Waved" tone="primary" /> : null}
              </View>
            ) : null}
          </Card>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  badges: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
});
