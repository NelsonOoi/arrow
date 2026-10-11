import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ContactList } from '@/components/ContactList';
import { Screen } from '@/components/Screen';
import { StampButton } from '@/components/Stamp';
import { text } from '@/components/typography';
import { EVENT } from '@/data/event';
import { firstName, getUserById, getUserByToken, matchColor, otherWantsToSwap } from '@/data/users';
import { useSession } from '@/store/session';
import { spacing } from '@/theme';

// Reached by replacing the finder, so dismissing lands back on the tabs.
function leave(to: 'event' | 'people') {
  if (router.canDismiss()) router.dismissAll();
  if (to === 'people') {
    router.navigate('/people');
  } else {
    router.navigate({ pathname: '/event/[id]', params: { id: EVENT.id } });
  }
}

/**
 * After two people find each other, each one has to choose whether to swap contacts.
 * There is deliberately no close button and no default: the match stays "found" until they pick.
 */
export default function DecideScreen() {
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const token = (Array.isArray(params.token) ? params.token[0] : params.token) ?? '';
  const user = getUserByToken(token);
  const currentUser = useSession((s) => getUserById(s.currentUserId));
  const outcome = useSession((s) => (user ? s.outcomes[user.id] : undefined));
  const decide = useSession((s) => s.decide);

  if (!user || !currentUser) {
    return (
      <Screen edges={['top', 'left', 'right', 'bottom']}>
        <Card>
          <Text style={text.heading}>Unknown attendee</Text>
        </Card>
        <Button label="Back" variant="secondary" onPress={() => leave('event')} />
      </Screen>
    );
  }

  const first = firstName(user);
  const color = matchColor(currentUser, user);

  if (outcome === 'interested' || outcome === 'notInterested') {
    const swapped = outcome === 'interested' && otherWantsToSwap(currentUser, user);
    return (
      <Screen edges={['top', 'left', 'right', 'bottom']} scroll={false}>
        <View style={styles.center}>
          <Avatar user={user} color={color} size={72} />
          <Text style={[text.title, styles.centered]}>
            {outcome === 'notInterested'
              ? `Got it. ${first}'s off your list.`
              : swapped
                ? `You and ${first} swapped contacts.`
                : 'Done.'}
          </Text>
          <Text style={[text.muted, styles.centered]}>
            {outcome === 'notInterested'
              ? `${first} won't see your contact info.`
              : swapped
                ? `${first}'s card is in People whenever you need it.`
                : `If ${first} says yes too, their card shows up in People.`}
          </Text>
        </View>
        <View style={styles.actions}>
          {swapped ? (
            <Button size="lg" label={`See ${first}'s card`} onPress={() => leave('people')} />
          ) : null}
          <Button
            size="lg"
            variant={swapped ? 'secondary' : 'primary'}
            label="Back to the event"
            onPress={() => leave('event')}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={['top', 'left', 'right', 'bottom']} scroll={false}>
      <View style={styles.center}>
        <Avatar user={user} color={color} size={72} />
        <Text style={[text.title, styles.centered]}>You found {first}.</Text>
        <Text style={[text.muted, styles.centered]}>
          Want to swap contacts? {first} only gets your card if you both say yes.
        </Text>
        <Card style={styles.share}>
          <Text style={text.section}>You’d share</Text>
          <ContactList contact={currentUser.contact} />
        </Card>
      </View>
      <View style={styles.actions}>
        <StampButton label="Interested in contact" onPress={() => decide(user.id, true)} />
        <Button
          size="lg"
          variant="secondary"
          label="Not interested"
          onPress={() => decide(user.id, false)}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  centered: {
    textAlign: 'center',
  },
  share: {
    alignSelf: 'stretch',
    marginTop: spacing.lg,
  },
  actions: {
    gap: spacing.sm,
  },
});
