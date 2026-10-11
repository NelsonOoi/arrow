import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { text } from '@/components/typography';
import { stepAway } from '@/live/actions';
import { useRoster } from '@/store/roster';
import { useSession } from '@/store/session';
import { colors, spacing } from '@/theme';
import type { Side } from '@/types';

const SIDES: Side[] = ['A', 'B'];

export default function OnboardingScreen() {
  const currentUserId = useSession((s) => s.currentUserId);
  const setCurrentUser = useSession((s) => s.setCurrentUser);
  const event = useRoster((s) => s.event);
  const users = useRoster((s) => s.users);

  const choose = (id: string) => {
    // Take the previous identity out of the pool so the matchmaker doesn't pair someone who left.
    if (currentUserId && currentUserId !== id) stepAway(currentUserId);
    setCurrentUser(id);
    // Reached from Profile, the tabs are already underneath; otherwise onboarding is the only route.
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  };

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      {event ? <Text style={text.heading}>{event.name}</Text> : null}
      <Text style={text.muted}>Pick a different person on each demo phone.</Text>
      {SIDES.map((side) => {
        const people = users.filter((u) => u.side === side);
        if (people.length === 0) return null;
        return (
          <View key={side} style={styles.group}>
            <Text style={[text.section, styles.sectionTitle]}>{people[0].sideLabel}s</Text>
            {people.map((user) => (
              <Pressable
                key={user.id}
                accessibilityRole="button"
                onPress={() => choose(user.id)}
                style={({ pressed }) => pressed && styles.pressed}>
                <Card highlight={user.id === currentUserId}>
                  <Text style={text.heading}>{user.name}</Text>
                  <Text style={text.muted} numberOfLines={2}>
                    {user.about}
                  </Text>
                  {user.interests.length > 0 ? (
                    <View style={styles.interests}>
                      <Text style={text.small}>{user.interests.join(' · ')}</Text>
                    </View>
                  ) : null}
                </Card>
              </Pressable>
            ))}
          </View>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: spacing.md,
  },
  sectionTitle: {
    marginTop: spacing.md,
  },
  pressed: {
    opacity: 0.7,
  },
  interests: {
    paddingTop: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
