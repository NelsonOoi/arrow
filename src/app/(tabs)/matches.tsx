import { router } from 'expo-router';
import { StyleSheet, Text } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { MatchCard } from '@/components/MatchCard';
import { Screen } from '@/components/Screen';
import { text } from '@/components/typography';
import { getUserById } from '@/data/users';
import { checkIn, endConversation, stepAway } from '@/live/actions';
import { useLive } from '@/store/live';
import { useRadar } from '@/store/radar';
import { useSession } from '@/store/session';
import { colors, fonts } from '@/theme';

function clockTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function waitLabel(seconds: number): string {
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export default function MatchScreen() {
  const currentUser = useSession((s) => getUserById(s.currentUserId));
  const metUserIds = useSession((s) => s.metUserIds);
  const status = useLive((s) => s.status);
  const conversation = useLive((s) => s.conversation);
  const waitingSeconds = useLive((s) => s.waitingSeconds);
  const exhausted = useLive((s) => s.exhausted);
  const error = useLive((s) => s.error);
  const busy = useLive((s) => s.busy);
  const peers = useRadar((s) => s.peers);

  if (!currentUser) return null;
  const partner = getUserById(conversation?.partnerId);

  return (
    <Screen>
      {status === null ? (
        <Text style={text.muted}>Connecting to the matchmaker…</Text>
      ) : status === 'registered' || status === 'away' ? (
        <>
          <Text style={text.muted}>
            {status === 'away'
              ? "You've stepped away. Check back in when you're ready for your next conversation."
              : "Check in and we'll pair you with someone. Your phone buzzes when it happens."}
          </Text>
          <Button size="lg" label="Check in" disabled={busy} onPress={() => checkIn(currentUser.id)} />
        </>
      ) : status === 'available' ? (
        <>
          <Card>
            <Text style={text.heading}>Finding your next match…</Text>
            {waitingSeconds !== null ? (
              <Text style={text.muted}>Waiting {waitLabel(waitingSeconds)}</Text>
            ) : null}
            {exhausted ? (
              <Text style={text.small}>
                Nobody left on your list is free right now. You&apos;ll be paired as people finish their
                conversations.
              </Text>
            ) : null}
          </Card>
          <Button label="Step away" variant="secondary" disabled={busy} onPress={() => stepAway(currentUser.id)} />
        </>
      ) : conversation && partner ? (
        <>
          <Text style={text.section}>
            Your conversation · since {clockTime(conversation.startedAt)}
          </Text>
          <MatchCard
            me={currentUser}
            match={partner}
            peer={peers[partner.token]}
            met={metUserIds.includes(partner.id)}
            rank={conversation.rank}
            onFind={() => router.push({ pathname: '/find/[token]', params: { token: partner.token } })}
          />
          <Text style={text.small}>
            Start scanning on Nearby and your phone will buzz when you&apos;re close to {partner.name}.
          </Text>
          <Button
            label="End conversation"
            variant="danger"
            disabled={busy}
            onPress={() => endConversation(currentUser.id, conversation.id)}
          />
          <Button label="Step away" variant="secondary" disabled={busy} onPress={() => stepAway(currentUser.id)} />
        </>
      ) : (
        <Text style={text.muted}>Loading your conversation…</Text>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  error: {
    color: colors.danger,
    fontFamily: fonts.body,
  },
});
