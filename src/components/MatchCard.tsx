import { StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { firstName, matchColor, sharedInterests } from '@/data/users';
import { colors, font, fonts, sheetCorners, spacing } from '@/theme';
import type { PeerState, User } from '@/types';

type MatchCardProps = {
  me: User;
  match: User;
  peer?: PeerState;
  met?: boolean;
  /** Where this match sat on your precomputed list, 1 = top pick. */
  rank?: number;
  onFind: () => void;
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

export function MatchCard({ me, match, peer, met = false, rank, onFind }: MatchCardProps) {
  const first = firstName(match);
  const shared = sharedInterests(me, match);
  const proximity = proximityLabel(peer);

  let summary = match.about;
  if (shared.length > 0) summary += ` You're both into ${joinList(shared)}.`;

  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>
        {rank ? `Your #${rank} pick` : 'Matched for you'}
      </Text>

      <View style={styles.identity}>
        <Avatar user={match} color={matchColor(me, match)} />
        <View style={styles.identityText}>
          <Text style={styles.name} numberOfLines={1}>
            {match.name}
          </Text>
          {match.goals.length > 0 ? (
            <Text style={styles.role} numberOfLines={1}>
              {match.goals.join(' · ')}
            </Text>
          ) : null}
        </View>
      </View>

      <Text style={styles.summary}>{summary}</Text>

      <View style={styles.facts}>
        <Fact label="Looking for" value={match.seeking} />
        <Fact label="Into" value={match.interests.join(', ')} />
        <Fact
          label="Right now"
          value={met ? `${proximity.label} · you've met` : proximity.label}
          highlight={proximity.near}
        />
      </View>

      <Button
        size="lg"
        variant={met ? 'secondary' : 'primary'}
        label={met ? `Find ${first} again` : `Find ${first}`}
        onPress={onFind}
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
