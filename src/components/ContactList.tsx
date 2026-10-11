import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, font, fonts, spacing } from '@/theme';
import type { Contact } from '@/types';

type Row = { label: string; value: string; url: string };

function rows(contact: Contact): Row[] {
  const out: Row[] = [];
  if (contact.phone) {
    out.push({ label: 'Phone', value: contact.phone, url: `tel:${contact.phone.replace(/\s/g, '')}` });
  }
  if (contact.email) {
    out.push({ label: 'Email', value: contact.email, url: `mailto:${contact.email}` });
  }
  if (contact.linkedin) {
    out.push({ label: 'LinkedIn', value: contact.linkedin, url: `https://${contact.linkedin}` });
  }
  if (contact.twitter) {
    out.push({ label: 'X', value: `@${contact.twitter}`, url: `https://x.com/${contact.twitter}` });
  }
  return out;
}

/** Phone, email and LinkedIn as label/value rows. `linked` makes each row open its app. */
export function ContactList({ contact, linked = false }: { contact: Contact; linked?: boolean }) {
  return (
    <View style={styles.list}>
      {rows(contact).map((row) =>
        linked ? (
          <Pressable
            key={row.label}
            accessibilityRole="link"
            accessibilityLabel={`${row.label}: ${row.value}`}
            onPress={() => Linking.openURL(row.url).catch(() => {})}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
            <Text style={styles.label}>{row.label}</Text>
            <Text style={[styles.value, styles.link]} numberOfLines={1}>
              {row.value}
            </Text>
          </Pressable>
        ) : (
          <View key={row.label} style={styles.row}>
            <Text style={styles.label}>{row.label}</Text>
            <Text style={styles.value} numberOfLines={1}>
              {row.value}
            </Text>
          </View>
        ),
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.md,
    minHeight: 24,
  },
  pressed: {
    opacity: 0.6,
  },
  label: {
    width: 72,
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: font.small,
  },
  value: {
    flex: 1,
    color: colors.textSecondary,
    fontFamily: fonts.mono,
    fontSize: font.small,
  },
  link: {
    color: colors.text,
    textDecorationLine: 'underline',
  },
});
