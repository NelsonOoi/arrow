import { StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Card } from '@/components/Card';
import { ContactList } from '@/components/ContactList';
import { Screen } from '@/components/Screen';
import { Stamp } from '@/components/Stamp';
import { text } from '@/components/typography';
import { EVENT } from '@/data/event';
import { getUserById, matchColor, swappedContacts } from '@/data/users';
import { useSession } from '@/store/session';
import { colors, font, fonts, spacing } from '@/theme';
import type { User } from '@/types';

/** Everyone I swapped contacts with: both of us chose "Interested in contact". */
export default function PeopleScreen() {
  const currentUser = useSession((s) => getUserById(s.currentUserId));
  const outcomes = useSession((s) => s.outcomes);

  if (!currentUser) return null;
  const people = swappedContacts(currentUser, outcomes);

  return (
    <Screen edges={['top', 'left', 'right']}>
      <Text style={[text.title, styles.pageTitle]}>People you met</Text>
      {people.length === 0 ? (
        <Card style={styles.empty}>
          <Text style={text.heading}>No contacts yet.</Text>
          <Text style={text.muted}>
            When you meet someone and you both choose to swap contacts, their card lands here.
          </Text>
        </Card>
      ) : (
        <>
          <Text style={text.muted}>
            {people.length} {people.length === 1 ? 'person' : 'people'} from {EVENT.name}
          </Text>
          {people.map((person) => (
            <PersonCard key={person.id} me={currentUser} person={person} />
          ))}
        </>
      )}
    </Screen>
  );
}

function PersonCard({ me, person }: { me: User; person: User }) {
  return (
    <Card style={styles.card}>
      <View style={styles.identity}>
        <Avatar user={person} color={matchColor(me, person)} size={44} />
        <View style={styles.identityText}>
          {/* Their name as a stamp, like the name tag you found them by. */}
          <Stamp size="sm" style={styles.nameStamp} cardStyle={styles.nameCard}>
            <Text style={styles.name} numberOfLines={1}>
              {person.name}
            </Text>
          </Stamp>
          <Text style={text.small} numberOfLines={1}>
            {person.role} · {person.company}
          </Text>
        </View>
      </View>

      <Text style={styles.workingOn}>Working on {person.workingOn}.</Text>

      {/* Each line opens the right app: phone, mail, LinkedIn or X. */}
      <View style={styles.contact}>
        <ContactList contact={person.contact} linked />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  pageTitle: {
    marginTop: spacing.sm,
  },
  empty: {
    marginTop: spacing.sm,
  },
  card: {
    gap: spacing.md,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  identityText: {
    flex: 1,
    gap: spacing.xs,
  },
  nameStamp: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  nameCard: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  name: {
    color: colors.ink,
    fontFamily: fonts.monoBold,
    fontSize: font.headline,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  workingOn: {
    color: colors.textSecondary,
    fontFamily: fonts.body,
    fontSize: font.body,
    lineHeight: 22,
  },
  contact: {
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
