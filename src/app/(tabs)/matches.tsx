import { router } from 'expo-router';
import { Text } from 'react-native';

import { MatchCard } from '@/components/MatchCard';
import { Screen } from '@/components/Screen';
import { text } from '@/components/typography';
import { getMatches, getUserById } from '@/data/users';
import { useRadar } from '@/store/radar';
import { useSession } from '@/store/session';

export default function MatchesScreen() {
  const currentUser = useSession((s) => getUserById(s.currentUserId));
  const metUserIds = useSession((s) => s.metUserIds);
  const peers = useRadar((s) => s.peers);

  if (!currentUser) return null;
  const matches = getMatches(currentUser);

  return (
    <Screen>
      <Text style={text.muted}>
        People you were matched with. Get close to one and your phone will buzz.
      </Text>
      {matches.map((match) => (
        <MatchCard
          key={match.id}
          me={currentUser}
          match={match}
          peer={peers[match.token]}
          met={metUserIds.includes(match.id)}
          onFind={() => router.push({ pathname: '/find/[token]', params: { token: match.token } })}
        />
      ))}
    </Screen>
  );
}
