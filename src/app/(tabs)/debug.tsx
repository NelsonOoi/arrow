import * as Clipboard from 'expo-clipboard';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Pill } from '@/components/Pill';
import { Screen } from '@/components/Screen';
import { statusMessage } from '@/components/StatusBanner';
import { text } from '@/components/typography';
import { getUserByToken } from '@/data/users';
import { vibrateProximityAlert } from '@/haptics/alert';
import { useRadar } from '@/store/radar';
import { useSession } from '@/store/session';
import { colors, spacing } from '@/theme';
import type { PeerState } from '@/types';

const MAX_SAMPLES = 2000;
const CSV_HEADER =
  'timestamp_iso,token,name,device_id,source,last_rssi,smoothed_rssi,is_near,is_match,threshold';

function csvField(value: string | number | boolean): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsvRow(peer: PeerState, threshold: number): string {
  return [
    new Date(peer.lastSeen).toISOString(),
    peer.token,
    getUserByToken(peer.token)?.name ?? '',
    peer.deviceId,
    peer.source,
    peer.lastRssi,
    peer.smoothedRssi.toFixed(1),
    peer.isNear,
    peer.isMatch,
    threshold,
  ]
    .map(csvField)
    .join(',');
}

function clockTime(ts: number): string {
  const d = new Date(ts);
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((n) => String(n).padStart(2, '0'))
    .join(':');
}

function truncate(id: string, max = 14): string {
  return id.length > max ? `${id.slice(0, max)}…` : id;
}

function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export default function DebugScreen() {
  const status = useRadar((s) => s.status);
  const error = useRadar((s) => s.error);
  const peers = useRadar((s) => s.peers);
  const alertLog = useRadar((s) => s.alertLog);
  const threshold = useSession((s) => s.threshold);
  const now = useNow();

  const samples = useRef<string[]>([]);
  const [sampleCount, setSampleCount] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  // Rows are appended outside React's render cycle so a long hold captures every sighting update.
  useEffect(() => {
    return useRadar.subscribe((state, prev) => {
      if (state.peers === prev.peers) return;
      const currentThreshold = useSession.getState().threshold;
      const log = samples.current;
      let added = 0;
      for (const peer of Object.values(state.peers)) {
        if (prev.peers[peer.token]?.lastSeen === peer.lastSeen) continue;
        log.push(toCsvRow(peer, currentThreshold));
        added++;
      }
      if (added === 0) return;
      if (log.length > MAX_SAMPLES) log.splice(0, log.length - MAX_SAMPLES);
      setSampleCount(log.length);
    });
  }, []);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), 2500);
    return () => clearTimeout(id);
  }, [notice]);

  const sortedPeers = useMemo(
    () => Object.values(peers).sort((a, b) => b.lastSeen - a.lastSeen),
    [peers],
  );

  const copyCsv = async () => {
    // Fall back to a snapshot of current peers when nothing has been sampled yet.
    const rows =
      samples.current.length > 0
        ? samples.current
        : sortedPeers.map((p) => toCsvRow(p, threshold));
    try {
      await Clipboard.setStringAsync([CSV_HEADER, ...rows].join('\n'));
      setNotice(`Copied ${rows.length} rows`);
    } catch (e) {
      setNotice(`Copy failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const clearLog = () => {
    samples.current = [];
    setSampleCount(0);
    setNotice('Log cleared');
  };

  const testVibrate = async () => {
    try {
      await vibrateProximityAlert();
    } catch (e) {
      setNotice(`Vibrate failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <Screen>
      <Card>
        <Text style={text.body}>{statusMessage(status, error)}</Text>
        <Text style={text.small}>
          Status {status} · threshold {threshold} dBm · {sortedPeers.length} peers ·{' '}
          {sampleCount} samples logged
        </Text>
      </Card>

      <View style={styles.buttons}>
        <Button label="Test vibrate" variant="secondary" style={styles.flex} onPress={testVibrate} />
        <Button label="Copy CSV" style={styles.flex} onPress={copyCsv} />
      </View>
      <Button label="Clear log" variant="secondary" onPress={clearLog} />
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}

      <Text style={[text.section, styles.sectionTitle]}>Peers</Text>
      {sortedPeers.length === 0 ? (
        <Text style={text.muted}>No Arrow devices seen.</Text>
      ) : (
        sortedPeers.map((peer) => (
          <Card key={peer.token} highlight={peer.isNear}>
            <View style={styles.peerHeader}>
              <Text style={[text.heading, styles.flex]} numberOfLines={1}>
                {peer.token} {getUserByToken(peer.token)?.name ?? 'Unknown'}
              </Text>
              <Pill label={peer.isNear ? 'NEAR' : 'far'} tone={peer.isNear ? 'near' : 'muted'} />
              <Pill
                label={peer.isMatch ? 'match' : 'no match'}
                tone={peer.isMatch ? 'primary' : 'muted'}
              />
            </View>
            <Text style={text.mono}>
              rssi {peer.lastRssi} · smoothed {peer.smoothedRssi.toFixed(1)}
            </Text>
            <Text style={text.mono}>
              {truncate(peer.deviceId)} · {peer.source} · seen{' '}
              {Math.max(0, Math.round((now - peer.lastSeen) / 1000))}s ago
            </Text>
            <Text style={text.mono}>
              last alert {peer.lastAlertAt ? clockTime(peer.lastAlertAt) : 'never'}
            </Text>
          </Card>
        ))
      )}

      <Text style={[text.section, styles.sectionTitle]}>Alert log</Text>
      {alertLog.length === 0 ? (
        <Text style={text.muted}>No alerts yet.</Text>
      ) : (
        <Card>
          {alertLog.map((alert, i) => (
            <Text key={`${alert.at}-${alert.token}-${i}`} style={text.mono}>
              {clockTime(alert.at)} {alert.token}{' '}
              {getUserByToken(alert.token)?.name ?? 'Unknown'} {alert.smoothedRssi.toFixed(1)} dBm
            </Text>
          ))}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  buttons: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  flex: {
    flex: 1,
  },
  notice: {
    color: colors.near,
    textAlign: 'center',
  },
  sectionTitle: {
    marginTop: spacing.md,
  },
  peerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
});
