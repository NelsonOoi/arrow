import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ArrowGlyph, ArrowRight } from '@/components/HandMarks';
import { PulseDot } from '@/components/PulseDot';
import { Screen } from '@/components/Screen';
import { Stamp } from '@/components/Stamp';
import { text } from '@/components/typography';
import { EVENT, PAST_EVENTS, eventDay, eventWhen, type EventInfo } from '@/data/event';
import { colors, font, fonts, spacing } from '@/theme';

function openEvent(event: EventInfo) {
  router.push({ pathname: '/event/[id]', params: { id: event.id } });
}

/** Landing screen: the event happening now on top, then past events. */
export default function EventsScreen() {
  return (
    <Screen edges={['top', 'left', 'right']}>
      <View style={styles.brand}>
        <ArrowGlyph size={26} />
        <Text style={styles.wordmark}>Arrow</Text>
      </View>
      <Text style={[text.title, styles.pageTitle]}>Your events</Text>

      <Text style={[text.section, styles.section]}>Happening now</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${EVENT.name}, live now. Open event.`}
        onPress={() => openEvent(EVENT)}>
        {({ pressed }) => (
          // The screen's one stamp: the event you're at tonight, like a ticket.
          <Stamp pressed={pressed} cardStyle={styles.current}>
            <View style={styles.liveRow}>
              <PulseDot color={colors.primary} active />
              <Text style={styles.liveText}>Live now</Text>
            </View>
            <Text style={styles.currentName}>{EVENT.name}</Text>
            <Text style={styles.currentWhen}>{eventWhen(EVENT)}</Text>
            <Text style={text.small}>
              {EVENT.venue} · Hosted by {EVENT.hostName}
            </Text>
            <View style={styles.openRow}>
              <Text style={styles.openText}>Open event</Text>
              <ArrowRight color={colors.ink} />
            </View>
          </Stamp>
        )}
      </Pressable>

      <Text style={[text.section, styles.section]}>Past events</Text>
      <View>
        {PAST_EVENTS.map((event, i) => (
          <Pressable
            key={event.id}
            accessibilityRole="button"
            onPress={() => openEvent(event)}
            style={({ pressed }) => [styles.pastRow, i === 0 && styles.pastFirst, pressed && styles.pressed]}>
            <Text style={styles.pastDay}>{eventDay(event)}</Text>
            <View style={styles.pastText}>
              <Text style={styles.pastName} numberOfLines={1}>
                {event.name}
              </Text>
              <Text style={text.small} numberOfLines={1}>
                {event.metCount ? `Met ${event.metCount} people` : 'Nobody met yet'} · {event.venue}
              </Text>
            </View>
            <ArrowRight color={colors.textMuted} />
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 44,
  },
  wordmark: {
    color: colors.text,
    fontFamily: fonts.display,
    fontSize: 24,
    letterSpacing: -0.7,
  },
  pageTitle: {
    marginTop: spacing.sm,
  },
  section: {
    marginTop: spacing.lg,
  },
  current: {
    alignItems: 'flex-start',
    padding: spacing.xl,
    gap: spacing.xs,
  },
  liveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  liveText: {
    color: colors.primaryDeep,
    fontFamily: fonts.bodySemibold,
    fontSize: font.small,
  },
  currentName: {
    color: colors.ink,
    fontFamily: fonts.monoBold,
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  currentWhen: {
    color: colors.text,
    fontFamily: fonts.bodySemibold,
    fontSize: font.body,
    marginTop: spacing.xs,
  },
  openRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  openText: {
    color: colors.ink,
    fontFamily: fonts.bodySemibold,
    fontSize: font.body,
    textDecorationLine: 'underline',
  },
  // Past events: rules, not boxes (DESIGN.md §1).
  pastRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 64,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pastFirst: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  pressed: {
    backgroundColor: colors.surfaceRaised,
  },
  pastDay: {
    width: 52,
    color: colors.textMuted,
    fontFamily: fonts.mono,
    fontSize: font.small,
  },
  pastText: {
    flex: 1,
    gap: 2,
  },
  pastName: {
    color: colors.text,
    fontFamily: fonts.display,
    fontSize: font.headline,
  },
});
