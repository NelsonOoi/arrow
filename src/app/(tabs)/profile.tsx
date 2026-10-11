import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { ContactList } from '@/components/ContactList';
import { Screen } from '@/components/Screen';
import { Stamp } from '@/components/Stamp';
import { text } from '@/components/typography';
import { getUserById } from '@/data/users';
import { useSession } from '@/store/session';
import { colors, font, fonts, spacing } from '@/theme';

export default function MeScreen() {
  const currentUser = useSession((s) => getUserById(s.currentUserId));
  const setScanning = useSession((s) => s.setScanning);
  const resetOutcomes = useSession((s) => s.resetOutcomes);

  const switchIdentity = () => {
    setScanning(false);
    router.push('/onboarding');
  };

  if (!currentUser) return null;

  return (
    <Screen edges={['top', 'left', 'right']}>
      <Text style={[text.title, styles.pageTitle]}>Me</Text>

      {/* The screen's one stamp: your card, the thing you hand over when you both say yes. */}
      <Text style={[text.section, styles.section]}>Your card</Text>
      <Stamp cardStyle={styles.card}>
        <Text style={styles.cardName}>{currentUser.name}</Text>
        <Text style={styles.cardRole}>
          {currentUser.role} · {currentUser.company}
        </Text>
        <View style={styles.cardRule} />
        <ContactList contact={currentUser.contact} />
      </Stamp>
      <Text style={text.small}>Only shared with people you both choose to swap with.</Text>

      <Text style={[text.section, styles.section]}>What Arrow matches you on</Text>
      <View>
        <Fact label="Working on" value={currentUser.workingOn} first />
        <Fact label="Looking for" value={currentUser.lookingFor} />
        <Fact label="Into" value={currentUser.interests.join(', ')} />
      </View>

      <Text style={[text.section, styles.section]}>Demo</Text>
      <View style={styles.demo}>
        <Button label="Switch demo person" variant="ghost" onPress={switchIdentity} />
        <Button
          label="Bring back all matches"
          variant="ghost"
          onPress={() => {
            resetOutcomes();
            router.navigate('/');
          }}
        />
        <Button label="Developer tools" variant="ghost" onPress={() => router.navigate('/debug')} />
      </View>
    </Screen>
  );
}

function Fact({ label, value, first = false }: { label: string; value: string; first?: boolean }) {
  return (
    <View style={[styles.fact, first && styles.factFirst]}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pageTitle: {
    marginTop: spacing.sm,
  },
  section: {
    marginTop: spacing.lg,
  },
  card: {
    alignItems: 'stretch',
    padding: spacing.xl,
    gap: spacing.xs,
  },
  cardName: {
    color: colors.ink,
    fontFamily: fonts.monoBold,
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  cardRole: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: font.body,
  },
  cardRule: {
    height: 0,
    marginVertical: spacing.md,
    borderTopWidth: 1.5,
    borderTopColor: colors.border,
    borderStyle: 'dashed',
  },
  // Rules, not boxes (DESIGN.md §1).
  fact: {
    gap: 2,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  factFirst: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  factLabel: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: font.small,
  },
  factValue: {
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: font.body,
    lineHeight: 22,
  },
  demo: {
    alignItems: 'flex-start',
  },
});
