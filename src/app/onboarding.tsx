import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { text } from '@/components/typography';
import { USERS } from '@/data/users';
import { useSession } from '@/store/session';
import { colors, spacing } from '@/theme';

export default function OnboardingScreen() {
  const currentUserId = useSession((s) => s.currentUserId);
  const setCurrentUser = useSession((s) => s.setCurrentUser);

  const choose = (id: string) => {
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
      <Text style={text.muted}>Pick a different person on each demo phone.</Text>
      {USERS.map((user) => (
        <Pressable
          key={user.id}
          accessibilityRole="button"
          onPress={() => choose(user.id)}
          style={({ pressed }) => pressed && styles.pressed}>
          <Card highlight={user.id === currentUserId}>
            <Text style={text.heading}>{user.name}</Text>
            <Text style={text.muted}>
              {user.role} @ {user.company}
            </Text>
            <View style={styles.interests}>
              <Text style={text.small}>{user.interests.join(' · ')}</Text>
            </View>
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.7,
  },
  interests: {
    paddingTop: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
