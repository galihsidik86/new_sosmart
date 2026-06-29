/**
 * Checkout: pilih pelanggan + akun kas/bank + bayar.
 * Submit: queue payload ke SQLite + best-effort sync online + cetak struk.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  TextInput,
  FlatList,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { cachedCustomers, cachedAccounts, type Customer, type Account } from '@/lib/cache';
import { useCart, cartTotals } from '@/lib/cart';
import { fmtRp } from '@/lib/format';
import { getTenant, getUser, type SessionTenant, type SessionUser } from '@/lib/session';
import { getSavedPrinter, writeBytes } from '@/lib/printer';
import { buildReceipt } from '@/lib/receipt';
import { enqueueSale, syncOnce, type SaleSubmitPayload } from '@/lib/queue';
import { colors, radii, spacing } from '@/lib/theme';

export default function CheckoutScreen() {
  const router = useRouter();
  const lines = useCart((s) => s.lines);
  const clearCart = useCart((s) => s.clear);
  const totals = useMemo(() => cartTotals(lines), [lines]);

  const [tenant, setTenant] = useState<SessionTenant | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [bayar, setBayar] = useState<string>('');
  const [search, setSearch] = useState('');
  const [picking, setPicking] = useState<'customer' | 'akun' | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      setTenant(await getTenant());
      setUser(await getUser());
    })();
  }, []);

  const customers = useQuery({
    queryKey: ['customers-cache'],
    queryFn: () => cachedCustomers(),
    staleTime: 60_000,
  });
  const accounts = useQuery({
    queryKey: ['accounts-cache'],
    queryFn: () => cachedAccounts(),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!account && accounts.data && accounts.data.length > 0) {
      const kas = accounts.data.find((a) => a.kode.startsWith('1-101')) ?? accounts.data[0];
      if (kas) setAccount(kas);
    }
  }, [accounts.data, account]);

  useEffect(() => {
    setBayar(String(Math.round(totals.netto)));
  }, [totals.netto]);

  const bayarNum = Number(bayar.replace(/[^\d]/g, '')) || 0;
  const kembalian = Math.max(0, bayarNum - totals.netto);
  const cukup = bayarNum >= totals.netto - 0.5;

  const submit = async () => {
    if (!tenant || !user) return;
    if (!customer) {
      Alert.alert('Pelanggan kosong', 'Pilih pelanggan dulu.');
      setPicking('customer');
      return;
    }
    if (!account) {
      Alert.alert('Akun kas/bank kosong', 'Pilih akun penerimaan.');
      setPicking('akun');
      return;
    }
    if (!cukup) {
      Alert.alert('Pembayaran kurang', 'Nominal bayar < total.');
      return;
    }
    setSubmitting(true);
    const today = new Date();
    const tanggal = today.toISOString().slice(0, 10);

    const payload: SaleSubmitPayload = {
      body: {
        tanggal,
        jatuhTempo: tanggal,
        termin: 'TUNAI',
        cabangId: tenant.cabangId,
        customerId: customer.id,
        akunArId: account.id,
        tarifPpnPersen: 11,
        lines: lines.map((l) => ({
          itemId: l.itemId,
          deskripsi: l.nama,
          qty: String(l.qty),
          satuan: l.satuan,
          hargaSatuan: String(l.hargaSatuan),
          diskonPersen: String(l.diskonPersen),
          klasifikasiPpn: l.klasifikasiPpn,
          akunPendapatanId: l.akunPendapatanId ?? account.id,
        })),
      },
      receiptSnapshot: {
        customerNama: customer.nama,
        kasirNama: user.nama,
        cabangKode: tenant.cabangKode,
        cabangNama: tenant.cabangNama,
        tenantNama: tenant.tenantNama,
        bayar: bayarNum,
        kembalian,
        paper: '58mm',
      },
    };

    try {
      await enqueueSale(payload);

      const savedPrinter = await getSavedPrinter();
      if (savedPrinter) {
        try {
          const bytes = buildReceipt({
            paper: savedPrinter.paper,
            header: {
              tenantNama: tenant.tenantNama,
              cabangKode: tenant.cabangKode,
              cabangNama: tenant.cabangNama,
            },
            nomor: null,
            tanggal: today,
            kasirNama: user.nama,
            customerNama: customer.nama,
            lines,
            subtotal: totals.bruto - totals.diskon,
            diskon: totals.diskon,
            ppn: totals.ppn,
            total: totals.netto,
            bayar: bayarNum,
            kembalian,
          });
          await writeBytes(bytes);
        } catch (e) {
          console.warn('Print gagal:', e);
        }
      }

      syncOnce().catch((e) => console.warn('Sync awal gagal:', e));

      clearCart();
      Alert.alert(
        'Transaksi tersimpan',
        savedPrinter
          ? `Struk dikirim ke printer.\nKembalian: ${fmtRp(kembalian)}`
          : 'Tersimpan ke queue. (Printer belum dipasang)',
        [{ text: 'OK', onPress: () => router.replace('/(kasir)') }],
      );
    } catch (e) {
      Alert.alert('Gagal simpan', String(e instanceof Error ? e.message : e));
    } finally {
      setSubmitting(false);
    }
  };

  if (picking === 'customer') {
    const list = (customers.data ?? []).filter((c) => c.isAktif);
    const q = search.toLowerCase();
    const visible = q
      ? list.filter((c) => c.nama.toLowerCase().includes(q) || c.kode.toLowerCase().includes(q))
      : list;
    return (
      <PickerSheet
        title="Pilih Pelanggan"
        emptyHint="Belum ada pelanggan tersimpan. Sync data master dari Setelan."
        search={search}
        setSearch={setSearch}
        onClose={() => setPicking(null)}
        data={visible}
        keyExtractor={(c) => c.id}
        renderRow={(c) => (
          <Pressable
            onPress={() => {
              setCustomer(c);
              setSearch('');
              setPicking(null);
            }}
            style={({ pressed }) => ({
              padding: spacing.md,
              borderRadius: radii.md,
              borderWidth: 1,
              borderColor: colors.cream200,
              backgroundColor: pressed ? colors.cream100 : colors.white,
            })}
          >
            <Text style={{ fontWeight: '600', color: colors.wedel900 }}>{c.nama}</Text>
            <Text style={{ fontSize: 12, color: colors.tanah500 }}>
              {c.kode}{c.isPkp ? ' · PKP' : ''}
            </Text>
          </Pressable>
        )}
      />
    );
  }

  if (picking === 'akun') {
    return (
      <PickerSheet
        title="Pilih Akun Kas/Bank"
        emptyHint="Akun belum di-sync. Buka Setelan → Sync Data Master."
        search={search}
        setSearch={setSearch}
        onClose={() => setPicking(null)}
        data={accounts.data ?? []}
        keyExtractor={(a) => a.id}
        renderRow={(a) => (
          <Pressable
            onPress={() => {
              setAccount(a);
              setSearch('');
              setPicking(null);
            }}
            style={({ pressed }) => ({
              padding: spacing.md,
              borderRadius: radii.md,
              borderWidth: 1,
              borderColor: colors.cream200,
              backgroundColor: pressed ? colors.cream100 : colors.white,
            })}
          >
            <Text style={{ fontFamily: 'monospace', color: colors.sogan500, fontWeight: '700' }}>
              {a.kode}
            </Text>
            <Text style={{ color: colors.wedel900 }}>{a.nama}</Text>
          </Pressable>
        )}
      />
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: colors.cream50 }}
    >
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.lg }}>
        <View
          style={{
            backgroundColor: colors.white,
            padding: spacing.lg,
            borderRadius: radii.lg,
            borderWidth: 1,
            borderColor: colors.cream200,
          }}
        >
          <Label>TOTAL TAGIHAN</Label>
          <Text
            style={{ fontSize: 36, fontWeight: '900', color: colors.sogan600, marginTop: 4 }}
          >
            {fmtRp(totals.netto)}
          </Text>
          <Text style={{ color: colors.tanah500, fontSize: 12, marginTop: 2 }}>
            {lines.length} item · sub {fmtRp(totals.bruto - totals.diskon)} · PPN {fmtRp(totals.ppn)}
          </Text>
        </View>

        <Field label="Pelanggan">
          <Pressable onPress={() => setPicking('customer')} style={selectorStyle}>
            <Text style={selectorTextStyle(!!customer)}>
              {customer?.nama ?? 'Pilih pelanggan…'}
            </Text>
            {customer && (
              <Text style={{ fontSize: 11, color: colors.tanah500 }}>{customer.kode}</Text>
            )}
          </Pressable>
        </Field>

        <Field label="Akun Penerimaan (Kas/Bank)">
          <Pressable onPress={() => setPicking('akun')} style={selectorStyle}>
            <Text style={selectorTextStyle(!!account)}>
              {account ? `${account.kode} · ${account.nama}` : 'Pilih akun…'}
            </Text>
          </Pressable>
        </Field>

        <Field label="Bayar Diterima">
          <TextInput
            value={bayar}
            onChangeText={(v) => setBayar(v.replace(/[^\d]/g, ''))}
            keyboardType="numeric"
            style={{
              ...selectorStyle,
              fontSize: 22,
              fontWeight: '700',
              color: colors.wedel900,
              textAlign: 'right',
            }}
          />
        </Field>

        <View
          style={{
            backgroundColor: cukup ? colors.padi100 : colors.bata100,
            padding: spacing.md,
            borderRadius: radii.md,
            borderWidth: 1,
            borderColor: cukup ? colors.padi300 : colors.bata300,
            marginTop: spacing.md,
          }}
        >
          <Text style={{ color: cukup ? colors.padi700 : colors.bata700 }}>
            {cukup ? 'KEMBALIAN' : 'KURANG BAYAR'}
          </Text>
          <Text
            style={{
              fontSize: 28,
              fontWeight: '900',
              color: cukup ? colors.padi700 : colors.bata700,
              textAlign: 'right',
              marginTop: 2,
            }}
          >
            {fmtRp(cukup ? kembalian : totals.netto - bayarNum)}
          </Text>
        </View>
      </ScrollView>

      <View
        style={{
          padding: spacing.lg,
          borderTopWidth: 1,
          borderTopColor: colors.cream200,
          backgroundColor: colors.white,
          flexDirection: 'row',
          gap: spacing.sm,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          style={{
            padding: spacing.md,
            borderRadius: radii.md,
            borderWidth: 1,
            borderColor: colors.cream300,
            alignItems: 'center',
            flex: 1,
          }}
        >
          <Text style={{ color: colors.tanah700, fontWeight: '700' }}>BATAL</Text>
        </Pressable>
        <Pressable
          onPress={submit}
          disabled={submitting}
          style={({ pressed }) => ({
            padding: spacing.md,
            borderRadius: radii.md,
            backgroundColor: pressed ? colors.sogan600 : colors.sogan500,
            alignItems: 'center',
            flex: 2,
            opacity: submitting ? 0.7 : 1,
          })}
        >
          {submitting ? (
            <ActivityIndicator color={colors.cream50} />
          ) : (
            <Text style={{ color: colors.cream50, fontWeight: '800', fontSize: 16 }}>
              BAYAR & CETAK
            </Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const selectorStyle = {
  padding: spacing.md,
  borderRadius: radii.md,
  borderWidth: 1,
  borderColor: colors.cream300,
  backgroundColor: colors.cream50,
};

function selectorTextStyle(hasValue: boolean) {
  return {
    color: hasValue ? colors.wedel900 : colors.tanah300,
    fontSize: 15,
    fontWeight: hasValue ? ('600' as const) : ('400' as const),
  };
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <Text
      style={{
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 1.2,
        color: colors.tanah500,
      }}
    >
      {children}
    </Text>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: spacing.lg }}>
      <Label>{label}</Label>
      <View style={{ marginTop: spacing.xs }}>{children}</View>
    </View>
  );
}

interface PickerSheetProps<T> {
  title: string;
  emptyHint: string;
  search: string;
  setSearch: (s: string) => void;
  onClose: () => void;
  data: T[];
  keyExtractor: (item: T) => string;
  renderRow: (item: T) => React.ReactElement;
}

function PickerSheet<T>({
  title,
  emptyHint,
  search,
  setSearch,
  onClose,
  data,
  keyExtractor,
  renderRow,
}: PickerSheetProps<T>) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.cream50, padding: spacing.lg }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: spacing.md,
        }}
      >
        <Text style={{ fontSize: 18, fontWeight: '700', color: colors.wedel900 }}>{title}</Text>
        <Pressable onPress={onClose} hitSlop={10}>
          <Text style={{ color: colors.sogan500, fontWeight: '700' }}>Batal</Text>
        </Pressable>
      </View>
      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder="Cari…"
        style={{
          padding: spacing.md,
          backgroundColor: colors.white,
          borderRadius: radii.md,
          borderWidth: 1,
          borderColor: colors.cream300,
          fontSize: 15,
          marginBottom: spacing.md,
        }}
      />
      <FlatList
        data={data}
        keyExtractor={keyExtractor}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        renderItem={({ item }) => renderRow(item)}
        ListEmptyComponent={() => (
          <Text style={{ color: colors.tanah500, textAlign: 'center', padding: spacing.lg }}>
            {emptyHint}
          </Text>
        )}
      />
    </View>
  );
}
