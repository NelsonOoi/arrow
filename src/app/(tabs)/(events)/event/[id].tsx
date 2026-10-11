import { useKeepAwake } from 'expo-keep-awake';
import { router, useLocalSearchParams } from 'expo-router';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { PulseDot } from '@/components/PulseDot';
import { Screen } from '@/components/Screen';
import { StampButton } from '@/components/Stamp';
import { StatusBanner } from '@/components/StatusBanner';
import { text } from '@/components/typography';
import { eventWhen, getEvent, isCurrentEvent } from '@/data/event';
import { activeMatches, firstName, getUserById, swappedContacts } from '@/data/users';
import { openMatch } from '@/navigation';
import { useRadar } from '@/store/radar';
import { useSession } from '@/store/session';
import { colors, font, fonts, sheetCornersAlt, spacing } from '@/theme';

function KeepAwake() {
  // The browser can refuse the wake lock; without this, releasing it throws on unmount.
  useKeepAwake(undefined, { suppressDeactivateWarnings: true });
  return null;
}

function back() {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace('/');
  }
}

/**
 * One event. For the event happening now, this is where you ask Arrow for someone to meet:
 * one button, no list to pick from. Past events are read-only.
 */
export default function EventDetailScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = (Array.isArray(params.id) ? params.id[0] : params.id) ?? '';
  const event = getEvent(id);

  return (
    <Screen edges={['top', 'left', 'right']}>
      <Pressable
        accessibilityRole="link"
        onPress={back}
        style={({ pressed }) => [styles.backLink, pressed && styles.pressed]}>
        <Text style={styles.backText}>← Events</Text>
      </Pressable>

      {event ? (
        <>
          <View style={styles.header}>
            <Text style={text.title}>{event.name}</Text>
            <Text style={styles.when}>{eventWhen(event)}</Text>
            <Text style={text.small}>
              {event.venue} · Hosted by {event.hostName}
            </Text>
          </View>
          {isCurrentEvent(event) ? (
            <LiveEvent />
          ) : (
            <Card style={styles.section}>
              <Text style={text.heading}>This event has ended.</Text>
              <Text style={text.muted}>
                {event.metCount
                  ? `You swapped contacts with ${event.metCount} people there.`
                  : 'You didn’t swap contacts with anyone there.'}
              </Text>
            </Card>
          )}
        </>
      ) : (
        <Card style={styles.section}>
          <Text style={text.heading}>We couldn’t find that event.</Text>
        </Card>
      )}
    </Screen>
  );
}

function LiveEvent() {
  const currentUser = useSession((s) => getUserById(s.currentUserId));
  const outcomes = useSession((s) => s.outcomes);
  const scanning = useSession((s) => s.scanning);
  const setScanning = useSession((s) => s.setScanning);
  const status = useRadar((s) => s.status);
  const error = useRadar((s) => s.error);

  if (!currentUser) return null;
  const active = activeMatches(currentUser, outcomes);
  // Someone you've found but haven't decided on comes before anyone new.
  const waiting = active.find((m) => outcomes[m.id] === 'found');
  const next = active.find((m) => outcomes[m.id] === undefined);
  const swapped = swappedContacts(currentUser, outcomes).length;
  const running = scanning && status === 'running';
  // Browsers have no Bluetooth here; the web preview runs on a simulated signal instead.
  const problem =
    Platform.OS !== 'web' && (status === 'denied' || status === 'poweredOff' || status === 'error');

  return (
    <>
      {scanning ? <KeepAwake /> : null}

      <View style={styles.arrow}>
        <PulseDot color={running ? colors.near : colors.far} active={running} />
        <View style={styles.arrowText}>
          <Text style={styles.arrowTitle}>{scanning ? 'Arrow is on' : 'Arrow is off'}</Text>
          <Text style={text.small}>
            {scanning
              ? 'Your phone buzzes when your match is close.'
              : 'Turn it on so your phone buzzes when your match is close.'}
          </Text>
        </View>
        <Button
          label={scanning ? 'Stop' : 'Turn on'}
          // Outline, so the stamped button below stays the one main action.
          variant="secondary"
          onPress={() => setScanning(!scanning)}
        />
      </View>
      {problem ? <StatusBanner status={status} error={error} /> : null}

      {waiting ? (
        <Card style={styles.section}>
          <Text style={text.heading}>You found {firstName(waiting)}.</Text>
          <Text style={text.muted}>Decide whether to swap contacts before meeting someone new.</Text>
          <StampButton
            label={`Swap contacts with ${firstName(waiting)}`}
            onPress={() => openMatch(waiting.token, true)}
            style={styles.cta}
          />
        </Card>
      ) : next ? (
        <Card style={styles.section}>
          <Text style={text.heading}>Ready to meet someone?</Text>
          <Text style={text.muted}>
            Arrow picks someone worth talking to and points you straight to them.
          </Text>
          <StampButton
            label="Find me someone interesting"
            onPress={() => openMatch(next.token, false)}
            style={styles.cta}
          />
        </Card>
      ) : (
        <Card style={styles.section}>
          <Text style={text.heading}>That’s everyone for tonight.</Text>
          <Text style={text.muted}>Arrow has introduced you to everyone it matched you with.</Text>
        </Card>
      )}

      {swapped > 0 ? (
        <Pressable
          accessibilityRole="link"
          onPress={() => router.navigate('/people')}
          style={({ pressed }) => [styles.peopleLink, pressed && styles.pressed]}>
          <Text style={styles.peopleText}>
            You’ve swapped contacts with {swapped} {swapped === 1 ? 'person' : 'people'} tonight →
          </Text>
        </Pressable>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  backLink: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
    paddingRight: spacing.md,
  },
  pressed: {
    opacity: 0.6,
  },
  backText: {
    color: colors.textMuted,
    fontFamily: fonts.bodyMedium,
    fontSize: font.body,
  },
  header: {
    gap: spacing.xs,
  },
  when: {
    color: colors.text,
    fontFamily: fonts.bodySemibold,
    fontSize: font.body,
  },
  section: {
    marginTop: spacing.md,
  },
  arrow: {
    ...sheetCornersAlt,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  arrowText: {
    flex: 1,
    gap: 2,
  },
  arrowTitle: {
    color: colors.text,
    fontFamily: fonts.bodySemibold,
    fontSize: font.body,
  },
  cta: {
    marginTop: spacing.md,
  },
  peopleLink: {
    alignSelf: 'center',
    paddingVertical: spacing.sm,
  },
  peopleText: {
    color: colors.textSecondary,
    fontFamily: fonts.bodySemibold,
    fontSize: font.body,
  },
});
