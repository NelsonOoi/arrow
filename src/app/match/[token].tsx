import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, Text } from 'react-native';

import { BrandBar } from '@/components/BrandBar';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { MatchCard } from '@/components/MatchCard';
import { Screen } from '@/components/Screen';
import { text } from '@/components/typography';
import { firstName, getUserById, getUserByToken } from '@/data/users';
import { openMatch } from '@/navigation';
import { useRadar } from '@/store/radar';
import { useSession } from '@/store/session';
import { colors, fonts, spacing } from '@/theme';

export default function MatchCardScreen() {
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const token = (Array.isArray(params.token) ? params.token[0] : params.token) ?? '';
  const user = getUserByToken(token);
  const currentUser = useSession((s) => getUserById(s.currentUserId));
  const found = useSession((s) => (user ? s.outcomes[user.id] === 'found' : false));
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
      router.replace('/');
    }
  };

  return (
    <Screen edges={['top', 'left', 'right', 'bottom']}>
      <BrandBar />
      {user && currentUser ? (
        <>
          <Text style={[text.title, styles.title]}>
            {firstName(currentUser)}, meet <Text style={styles.emphasis}>{firstName(user)}</Text>.
          </Text>
          <MatchCard
            me={currentUser}
            match={user}
            peer={peer}
            found={found}
            onAction={() => openMatch(token, found)}
          />
        </>
      ) : (
        <Card style={styles.unknown}>
          <Text style={text.heading}>Unknown attendee</Text>
          <Text style={text.muted}>
            {token ? `Token ${token} is not in the attendee list.` : 'No token provided.'}
          </Text>
        </Card>
      )}
      <Button label="Not now" variant="ghost" onPress={dismiss} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  emphasis: {
    fontFamily: fonts.displayItalic,
    color: colors.primary,
  },
  unknown: {
    marginTop: spacing.lg,
  },
});
