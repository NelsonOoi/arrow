// Web stand-in for munim-bluetooth: the real package needs native Nitro modules,
// which can't bundle for web. Aliased in metro.config.js for platform === 'web' only,
// so the browser preview renders the UI with Bluetooth reported as unavailable.
const noop = () => {};

export const setServices = noop;
export const startAdvertising = noop;
export const stopAdvertising = noop;
export const startScan = noop;
export const stopScan = noop;
export const disconnect = noop;

export const isBluetoothEnabled = async () => false;
export const requestBluetoothPermission = async () => false;

const unsupported = async (): Promise<never> => {
  throw new Error('Bluetooth is not available on web');
};
export const connect = unsupported;
export const discoverServices = unsupported;
export const readCharacteristic = unsupported;

export const addDeviceFoundListener = () => noop;
export const addEventListener = () => noop;
