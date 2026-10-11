import { StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Stamp, StampButton } from '@/components/Stamp';
import { firstName, isMutual, matchColor, matchKeyword, sharedInterests } from '@/data/users';
import { colors, font, fonts, sheetCorners, spacing } from '@/theme';
import type { PeerState, User } from '@/types';

type MatchCardProps = {
  me: User;
  match: User;
  peer?: PeerState;
  /** We found each other but I haven't chosen whether to swap contacts yet. */
  found?: boolean;
  /** Opens the finder, or the swap-contacts choice once `found`. */
  onAction: () => void;
};

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function proximityLabel(peer: PeerState | undefined): { label: string; near: boolean } {
  if (peer?.isNear) return { label: 'Very close', near: true };
  if (peer) return { label: 'In range', near: false };
  return { label: 'Not detected yet', near: false };
}

export function MatchCard({ me, match, peer, found = false, onAction }: MatchCardProps) {
  const first = firstName(match);
  const shared = sharedInterests(me, match);
  const proximity = proximityLabel(peer);

  let summary = `${first} is working on ${match.workingOn}.`;
  if (shared.length > 0) summary += ` You're both into ${joinList(shared)}.`;

  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>
        {isMutual(me, match) ? `★ It's mutual: ${first} wants to meet you too` : 'Suggested for you'}
      </Text>

      <View style={styles.identity}>
        <Avatar user={match} color={matchColor(me, match)} />
        <View style={styles.identityText}>
          <Text style={styles.name} numberOfLines={1}>
            {match.name}
          </Text>
          <Text style={styles.role} numberOfLines={1}>
            {match.role} · {match.company}
          </Text>
        </View>
      </View>

      <Text style={styles.summary}>{summary}</Text>

      {/* The pair's passcode as a mini stamp: their color and their word in one mark. */}
      <View
        style={styles.pair}
        accessible
        accessibilityLabel={`Your pair word is ${matchKeyword(me, match)}. ${first} sees the same color and word.`}>
        <Stamp size="sm" color={matchColor(me, match)}>
          <Text style={styles.keyword}>{matchKeyword(me, match)}</Text>
        </Stamp>
        <Text style={styles.pairHint}>Same color and word on {first}’s phone</Text>
      </View>

      <View style={styles.facts}>
        <Fact label="Looking for" value={match.lookingFor} />
        <Fact label="Into" value={match.interests.join(', ')} />
        <Fact
          label="Right now"
          value={found ? `${proximity.label} · you found each other` : proximity.label}
          highlight={proximity.near}
        />
      </View>

      <StampButton
        label={found ? `Swap contacts with ${first}` : `Find ${first}`}
        onPress={onAction}
        style={styles.action}
      />
    </View>
  );
}

function Fact({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={[styles.factValue, highlight && styles.factHighlight]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    ...sheetCorners,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    padding: spacing.xl,
    gap: spacing.lg,
  },
  eyebrow: {
    color: colors.primaryDeep,
    fontFamily: fonts.bodySemibold,
    fontSize: font.caption,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  identityText: {
    flex: 1,
    gap: 2,
  },
  name: {
    color: colors.text,
    fontFamily: fonts.display,
    fontSize: 24,
    letterSpacing: -0.5,
  },
  role: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: font.small,
  },
  summary: {
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: font.body,
    lineHeight: 22,
  },
  pair: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  keyword: {
    color: colors.ink,
    fontFamily: fonts.monoBold,
    fontSize: font.body,
    letterSpacing: 1.5,
  },
  pairHint: {
    flex: 1,
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: font.small,
  },
  facts: {
    gap: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: 1.5,
    borderTopColor: colors.border,
    borderStyle: 'dashed',
  },
  fact: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  factLabel: {
    width: 84,
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: font.small,
    lineHeight: 19,
  },
  factValue: {
    flex: 1,
    color: colors.textSecondary,
    fontFamily: fonts.body,
    fontSize: font.small,
    lineHeight: 19,
  },
  factHighlight: {
    color: colors.near,
    fontFamily: fonts.bodySemibold,
  },
  action: {
    marginTop: spacing.xs,
  },
});
