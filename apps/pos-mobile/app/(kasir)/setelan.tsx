import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  FlatList,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  clearSession,
  getUser,
  getTenant,
  type SessionUser,
  type SessionTenant,
} from '@/lib/session';
import {
  getApiUrl,
  setApiUrl,
  resetApiUrl,
  getApiUrlDefault,
} from '@/lib/api';
import {
  ensureBluetoothEnabled,
  listBondedDevices,
  saveSelectedPrinter,
  getSavedPrinter,
  forgetPrinter,
  writeBytes,
  connect,
} from '@/lib/printer';
import type { PaperWidth } from '@/lib/escpos';
import { testReceipt } from '@/lib/receipt';
import { refreshAllMaster } from '@/lib/cache';
import { colors, radii, spacing } from '@/lib/theme';

interface BondedDevice {
  address: string;
  name: string;
}

export default function SetelanScreen() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [tenant, setTenant] = useState<SessionTenant | null>(null);
  const [savedPrinter, setSavedPrinter] = useState<{
    address: string;
    name: string;
    paper: PaperWidth;
  } | null>(null);
  const [devices, setDevices] = useState<BondedDevice[]>([]);
  const [scanning, setScanning] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [paper, setPaper] = useState<PaperWidth>('58mm');
  const [syncing, setSyncing] = useState(false);
  const [apiUrl, setApiUrlState] = useState('');
  const [savingUrl, setSavingUrl] = useState(false);

  const refreshSaved = useCallback(async () => {
    const sp = await getSavedPrinter();
    setSavedPrinter(sp);
    if (sp) setPaper(sp.paper);
  }, []);

  useEffect(() => {
    (async () => {
      setUser(await getUser());
      setTenant(await getTenant());
      setApiUrlState(await getApiUrl());
      await refreshSaved();
    })();
  }, [refreshSaved]);

  const saveApiUrl = async () => {
    const trimmed = apiUrl.trim();
    if (!trimmed.match(/^https?:\/\/[^\s]+/)) {
      Alert.alert('URL tidak valid', 'Harus diawali http:// atau https://');
      return;
    }
    setSavingUrl(true);
    try {
      await setApiUrl(trimmed);
      setApiUrlState(await getApiUrl());
      Alert.alert('Tersimpan', 'Server URL diubah. Coba sync data master untuk verifikasi.');
    } finally {
      setSavingUrl(false);
    }
  };

  const restoreDefaultUrl = async () => {
    await resetApiUrl();
    setApiUrlState(await getApiUrl());
  };

  const logout = async () => {
    await clearSession();
    router.replace('/login');
  };

  const scan = async () => {
    if (Platform.OS !== 'android') {
      Alert.alert('Hanya Android', 'Pairing printer Bluetooth saat ini hanya didukung di Android.');
      return;
    }
    setScanning(true);
    try {
      const ok = await ensureBluetoothEnabled();
      if (!ok) {
        Alert.alert('Bluetooth mati', 'Nyalakan Bluetooth lalu coba lagi.');
        return;
      }
      const bonded = await listBondedDevices();
      setDevices(bonded.map((d) => ({ address: d.address, name: d.name })));
    } catch (e) {
      Alert.alert('Gagal', String(e instanceof Error ? e.message : e));
    } finally {
      setScanning(false);
    }
  };

  const selectPrinter = async (d: BondedDevice) => {
    try {
      await saveSelectedPrinter({ address: d.address, name: d.name, paper });
      await connect(d.address);
      await refreshSaved();
      Alert.alert('Tersambung', `Printer ${d.name} sudah dipasang.`);
    } catch (e) {
      Alert.alert('Gagal connect', String(e instanceof Error ? e.message : e));
    }
  };

  const setPaperWidth = async (p: PaperWidth) => {
    setPaper(p);
    if (savedPrinter) {
      await saveSelectedPrinter({ ...savedPrinter, paper: p });
      await refreshSaved();
    }
  };

  const testPrint = async () => {
    if (!savedPrinter) {
      Alert.alert('Belum dipasang', 'Pilih printer dulu.');
      return;
    }
    setPrinting(true);
    try {
      await writeBytes(testReceipt(savedPrinter.paper));
      Alert.alert('Berhasil', 'Test print dikirim ke printer.');
    } catch (e) {
      Alert.alert('Gagal cetak', String(e instanceof Error ? e.message : e));
    } finally {
      setPrinting(false);
    }
  };

  const removePrinter = async () => {
    await forgetPrinter();
    await refreshSaved();
  };

  const syncMaster = async () => {
    setSyncing(true);
    try {
      const r = await refreshAllMaster();
      Alert.alert(
        'Sync data master',
        `Items ${r.items} · Pelanggan ${r.customers} · Akun ${r.accounts}`,
      );
    } catch (e) {
      Alert.alert('Gagal sync', String(e instanceof Error ? e.message : e));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <ScrollView style={{ flex: 1, padding: spacing.lg }}>
      <Section title="Akun">
        <Row label="Nama" value={user?.nama ?? '—'} />
        <Row label="Email" value={user?.email ?? '—'} />
      </Section>

      <Section title="Lokasi">
        <Row label="Tenant" value={tenant?.tenantNama ?? '—'} />
        <Row label="Cabang" value={`${tenant?.cabangKode ?? ''} · ${tenant?.cabangNama ?? '—'}`} />
        <Row label="Role" value={tenant?.role ?? '—'} />
      </Section>

      <Section title="Server API">
        <Text style={{ color: colors.tanah500, fontSize: 12, marginBottom: spacing.xs }}>
          URL backend Lentera. Default emulator: <Text style={{ fontFamily: 'monospace' }}>{getApiUrlDefault()}</Text>.
          Untuk HP fisik di LAN yang sama, ubah ke IP laptop (mis. http://192.168.1.10:4000).
        </Text>
        <TextInput
          value={apiUrl}
          onChangeText={setApiUrlState}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder="http://192.168.1.10:4000"
          style={{
            padding: spacing.md,
            backgroundColor: colors.cream50,
            borderWidth: 1,
            borderColor: colors.cream300,
            borderRadius: radii.md,
            fontSize: 14,
            fontFamily: 'monospace',
            color: colors.wedel900,
            marginTop: spacing.xs,
          }}
        />
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
          <Pressable
            onPress={saveApiUrl}
            disabled={savingUrl}
            style={({ pressed }) => ({
              flex: 2,
              padding: spacing.md,
              borderRadius: radii.md,
              backgroundColor: pressed ? colors.sogan600 : colors.sogan500,
              alignItems: 'center',
              opacity: savingUrl ? 0.7 : 1,
            })}
          >
            {savingUrl ? (
              <ActivityIndicator color={colors.cream50} />
            ) : (
              <Text style={{ color: colors.cream50, fontWeight: '700' }}>SIMPAN URL</Text>
            )}
          </Pressable>
          <Pressable
            onPress={restoreDefaultUrl}
            style={{
              flex: 1,
              padding: spacing.md,
              borderRadius: radii.md,
              borderWidth: 1,
              borderColor: colors.cream300,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: colors.tanah700, fontWeight: '700' }}>RESET</Text>
          </Pressable>
        </View>
      </Section>

      <Section title="Data Master">
        <Text style={{ color: colors.tanah500, fontSize: 13, marginBottom: spacing.md }}>
          Download katalog barang, pelanggan, dan akun kas/bank ke perangkat
          supaya kasir tetap jalan saat offline.
        </Text>
        <Pressable
          onPress={syncMaster}
          disabled={syncing}
          style={({ pressed }) => ({
            padding: spacing.md,
            borderRadius: radii.md,
            backgroundColor: pressed ? colors.sogan600 : colors.sogan500,
            alignItems: 'center',
            opacity: syncing ? 0.7 : 1,
          })}
        >
          {syncing ? (
            <ActivityIndicator color={colors.cream50} />
          ) : (
            <Text style={{ color: colors.cream50, fontWeight: '700' }}>SYNC DATA MASTER</Text>
          )}
        </Pressable>
      </Section>

      <Section title="Printer Bluetooth">
        {savedPrinter ? (
          <>
            <View
              style={{
                padding: spacing.md,
                borderRadius: radii.md,
                backgroundColor: colors.padi100,
                borderWidth: 1,
                borderColor: colors.padi300,
                marginBottom: spacing.md,
              }}
            >
              <Text style={{ color: colors.padi700, fontWeight: '700' }}>
                ● Terpasang: {savedPrinter.name}
              </Text>
              <Text style={{ color: colors.tanah500, fontSize: 12, marginTop: 2 }}>
                {savedPrinter.address}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <PaperChoice
                label="58 mm"
                active={paper === '58mm'}
                onPress={() => setPaperWidth('58mm')}
              />
              <PaperChoice
                label="80 mm"
                active={paper === '80mm'}
                onPress={() => setPaperWidth('80mm')}
              />
            </View>
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
              <Pressable
                onPress={testPrint}
                disabled={printing}
                style={({ pressed }) => ({
                  flex: 2,
                  padding: spacing.md,
                  borderRadius: radii.md,
                  backgroundColor: pressed ? colors.sogan600 : colors.sogan500,
                  alignItems: 'center',
                  opacity: printing ? 0.7 : 1,
                })}
              >
                {printing ? (
                  <ActivityIndicator color={colors.cream50} />
                ) : (
                  <Text style={{ color: colors.cream50, fontWeight: '700' }}>TEST PRINT</Text>
                )}
              </Pressable>
              <Pressable
                onPress={removePrinter}
                style={{
                  flex: 1,
                  padding: spacing.md,
                  borderRadius: radii.md,
                  borderWidth: 1,
                  borderColor: colors.cream300,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: colors.tanah700, fontWeight: '700' }}>LUPAKAN</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <Text style={{ color: colors.tanah500, fontSize: 13, marginBottom: spacing.md }}>
            Belum ada printer terpasang. Pair dulu printer thermal Bluetooth
            (Xprinter, Epson TM-T82, Bixolon, dll) lewat menu Bluetooth Android,
            lalu pilih di sini.
          </Text>
        )}

        <Pressable
          onPress={scan}
          disabled={scanning}
          style={({ pressed }) => ({
            marginTop: savedPrinter ? spacing.md : 0,
            padding: spacing.md,
            borderRadius: radii.md,
            backgroundColor: pressed ? colors.cream200 : colors.cream100,
            alignItems: 'center',
            borderWidth: 1,
            borderColor: colors.cream300,
          })}
        >
          {scanning ? (
            <ActivityIndicator color={colors.sogan500} />
          ) : (
            <Text style={{ color: colors.tanah700, fontWeight: '700' }}>
              {savedPrinter ? 'GANTI PRINTER' : 'PILIH PRINTER'}
            </Text>
          )}
        </Pressable>

        {devices.length > 0 && (
          <View style={{ marginTop: spacing.md }}>
            <Text style={{ fontSize: 11, color: colors.tanah500, fontWeight: '700', marginBottom: spacing.sm }}>
              DEVICE TERPAIR ({devices.length})
            </Text>
            <FlatList
              data={devices}
              keyExtractor={(d) => d.address}
              scrollEnabled={false}
              ItemSeparatorComponent={() => <View style={{ height: spacing.xs }} />}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => selectPrinter(item)}
                  style={({ pressed }) => ({
                    padding: spacing.md,
                    borderRadius: radii.md,
                    borderWidth: 1,
                    borderColor:
                      savedPrinter?.address === item.address ? colors.sogan500 : colors.cream200,
                    backgroundColor: pressed ? colors.cream100 : colors.white,
                  })}
                >
                  <Text style={{ fontWeight: '600', color: colors.wedel900 }}>{item.name || '(no name)'}</Text>
                  <Text style={{ fontSize: 11, color: colors.tanah500 }}>{item.address}</Text>
                </Pressable>
              )}
            />
          </View>
        )}
      </Section>

      <Pressable
        onPress={logout}
        style={({ pressed }) => ({
          marginTop: spacing.xl,
          padding: spacing.md,
          borderRadius: radii.md,
          backgroundColor: pressed ? colors.bata700 : colors.bata500,
          alignItems: 'center',
        })}
      >
        <Text style={{ color: colors.cream50, fontWeight: '800' }}>KELUAR</Text>
      </Pressable>
      <View style={{ height: spacing.xxl }} />
    </ScrollView>
  );
}

function PaperChoice({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        padding: spacing.sm,
        borderRadius: radii.md,
        borderWidth: 1,
        borderColor: active ? colors.sogan500 : colors.cream300,
        backgroundColor: active
          ? colors.sogan500
          : pressed
            ? colors.cream100
            : colors.white,
        alignItems: 'center',
      })}
    >
      <Text style={{ color: active ? colors.cream50 : colors.tanah700, fontWeight: '700' }}>
        {label}
      </Text>
    </Pressable>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View
      style={{
        backgroundColor: colors.white,
        padding: spacing.lg,
        borderRadius: radii.md,
        borderWidth: 1,
        borderColor: colors.cream200,
        marginBottom: spacing.md,
      }}
    >
      <Text
        style={{
          fontSize: 11,
          fontWeight: '700',
          letterSpacing: 1.2,
          color: colors.tanah500,
          marginBottom: spacing.sm,
        }}
      >
        {title.toUpperCase()}
      </Text>
      {children}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: spacing.xs,
      }}
    >
      <Text style={{ color: colors.tanah500 }}>{label}</Text>
      <Text
        style={{ color: colors.wedel900, fontWeight: '600', flex: 1, textAlign: 'right' }}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}
