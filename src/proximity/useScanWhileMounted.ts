import { useEffect } from 'react';

import { useSession } from '@/store/session';

/**
 * Turns scanning on while the calling screen is mounted, and restores whatever the user had on
 * unmount. Screens stack, so each one only undoes what it changed itself.
 */
export function useScanWhileMounted({ allDevices = false }: { allDevices?: boolean } = {}): void {
  useEffect(() => {
    const before = useSession.getState();
    const startedScanning = !before.scanning;
    const startedAllDevices = allDevices && !before.scanAllDevices;
    if (startedScanning) before.setScanning(true);
    if (startedAllDevices) before.setScanAllDevices(true);
    return () => {
      const after = useSession.getState();
      if (startedScanning) after.setScanning(false);
      if (startedAllDevices) after.setScanAllDevices(false);
    };
  }, [allDevices]);
}
