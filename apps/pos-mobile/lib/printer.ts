/**
 * Facade printer thermal Bluetooth (Classic SPP).
 * Pakai react-native-bluetooth-classic — auto-link via expo prebuild,
 * jadi WAJIB pakai dev-client APK (bukan Expo Go).
 *
 * State:
 *   selectedAddress  → persisten di SecureStore, dipakai auto-reconnect
 *   connection       → in-memory cache device handle saat ini
 */
import * as SecureStore from 'expo-secure-store';
import RNBluetoothClassic, {
  type BluetoothDevice,
} from 'react-native-bluetooth-classic';
import type { PaperWidth } from './escpos';

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  // React Native menyediakan btoa via Hermes runtime sejak RN 0.66+.
  return globalThis.btoa(bin);
}

const KEY_PRINTER = 'lentera_pos_printer';

interface SavedPrinter {
  address: string;
  name: string;
  paper: PaperWidth;
}

let currentDevice: BluetoothDevice | null = null;

export async function getSavedPrinter(): Promise<SavedPrinter | null> {
  const raw = await SecureStore.getItemAsync(KEY_PRINTER);
  return raw ? (JSON.parse(raw) as SavedPrinter) : null;
}

export async function saveSelectedPrinter(p: SavedPrinter): Promise<void> {
  await SecureStore.setItemAsync(KEY_PRINTER, JSON.stringify(p));
}

export async function forgetPrinter(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY_PRINTER);
  await disconnect();
}

export async function ensureBluetoothEnabled(): Promise<boolean> {
  try {
    const enabled = await RNBluetoothClassic.isBluetoothEnabled();
    if (enabled) return true;
    return await RNBluetoothClassic.requestBluetoothEnabled();
  } catch {
    return false;
  }
}

export async function listBondedDevices(): Promise<BluetoothDevice[]> {
  await ensureBluetoothEnabled();
  return RNBluetoothClassic.getBondedDevices();
}

export async function connect(address: string): Promise<BluetoothDevice> {
  if (currentDevice && currentDevice.address === address) {
    const connected = await currentDevice.isConnected();
    if (connected) return currentDevice;
  }
  // Default Classic SPP RFCOMM — cukup untuk mayoritas printer ESC/POS.
  const dev = await RNBluetoothClassic.connectToDevice(address);
  currentDevice = dev;
  return dev;
}

export async function disconnect(): Promise<void> {
  if (currentDevice) {
    try {
      await currentDevice.disconnect();
    } catch {
      /* abaikan — sudah disconnect dari sisi lain */
    }
    currentDevice = null;
  }
}

/**
 * Kirim raw ESC/POS bytes. Lib bluetooth-classic write() accept string,
 * Buffer atau base64 — kita pakai base64 untuk binary-safe.
 */
export async function writeBytes(bytes: Uint8Array): Promise<void> {
  const saved = await getSavedPrinter();
  if (!saved) throw new Error('Printer belum dipasang. Buka Setelan → pilih printer.');
  const dev = currentDevice ?? (await connect(saved.address));
  if (!(await dev.isConnected())) {
    await connect(saved.address);
  }
  await dev.write(bytesToBase64(bytes), 'base64');
}
