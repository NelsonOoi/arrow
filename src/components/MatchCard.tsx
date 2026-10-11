import { StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { firstName, isMutual, matchColor, sharedInterests } from '@/data/users';
import { colors, font, radius, spacing } from '@/theme';
import type { PeerState, User } from '@/types';

type MatchCardProps = {
  me: User;
  match: User;
  peer?: PeerState;
  met?: boolean;
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

export function MatchCard({ me, match, peer, met = false, onFind }: MatchCardProps) {
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

      <View style={styles.facts}>
        <Fact label="Looking for" value={match.lookingFor} />
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
    backgroundColor: colors.accentSurface,
    borderColor: colors.accentBorder,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: spacing.lg + spacing.xs,
    gap: spacing.lg,
  },
  eyebrow: {
    color: colors.primary,
    fontSize: font.caption,
    fontWeight: '700',
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
    fontSize: font.heading,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  role: {
    color: colors.textMuted,
    fontSize: font.small,
  },
  summary: {
    color: colors.text,
    fontSize: font.body,
    lineHeight: 22,
  },
  facts: {
    gap: spacing.sm,
  },
  fact: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  factLabel: {
    width: 84,
    color: colors.textMuted,
    fontSize: font.small,
    lineHeight: 18,
  },
  factValue: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: font.small,
    lineHeight: 18,
  },
  factHighlight: {
    color: colors.near,
    fontWeight: '600',
  },
  action: {
    marginTop: spacing.xs,
  },
});
