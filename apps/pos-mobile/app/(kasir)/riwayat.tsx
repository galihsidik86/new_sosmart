/**
 * Riwayat transaksi lokal:
 *   - Daftar sale yang sudah masuk queue + status sync
 *   - Tombol "Sync Sekarang" trigger manual
 *   - Pull-to-refresh untuk reload list
 */
import { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { listAllSales, syncOnce, pendingCount, type PendingRow } from '@/lib/queue';
import { fmtRp } from '@/lib/format';
import { colors, radii, spacing } from '@/lib/theme';

export default function RiwayatScreen() {
  const [rows, setRows] = useState<PendingRow[]>([]);
  const [pending, setPending] = useState(0);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, p] = await Promise.all([listAllSales(), pendingCount()]);
      setRows(r);
      setPending(p);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const triggerSync = async () => {
    setSyncing(true);
    try {
      const r = await syncOnce();
      await load();
      Alert.alert(
        'Sync selesai',
        `Coba ${r.attempted} · sukses ${r.succeeded} · gagal ${r.failed}`,
      );
    } finally {
      setSyncing(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.cream50 }}>
      <View
        style={{
          padding: spacing.md,
          backgroundColor: pending > 0 ? colors.emas100 : colors.padi100,
          borderBottomWidth: 1,
          borderBottomColor: pending > 0 ? colors.emas300 : colors.padi300,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Text
          style={{
            color: pending > 0 ? colors.emas700 : colors.padi700,
            fontWeight: '700',
          }}
        >
          {pending > 0 ? `${pending} transaksi belum tersync` : 'Semua tersync ✓'}
        </Text>
        <Pressable
          onPress={triggerSync}
          disabled={syncing}
          style={({ pressed }) => ({
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
            borderRadius: radii.md,
            backgroundColor: pressed ? colors.sogan600 : colors.sogan500,
            opacity: syncing ? 0.7 : 1,
          })}
        >
          {syncing ? (
            <ActivityIndicator color={colors.cream50} size="small" />
          ) : (
            <Text style={{ color: colors.cream50, fontWeight: '700', fontSize: 12 }}>
              SYNC SEKARANG
            </Text>
          )}
        </Pressable>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.sogan500} />
        }
        ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: colors.cream200 }} />}
        contentContainerStyle={{ flexGrow: 1 }}
        ListEmptyComponent={() => (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl }}>
            <Text style={{ color: colors.tanah500, textAlign: 'center' }}>
              Belum ada transaksi.
            </Text>
          </View>
        )}
        renderItem={({ item }) => <SaleRow row={item} />}
      />
    </View>
  );
}

function SaleRow({ row }: { row: PendingRow }) {
  const total = row.payload.body.lines.reduce(
    (n, l) => n + Number(l.qty) * Number(l.hargaSatuan),
    0,
  );
  const created = new Date(row.createdAt);
  const time = created.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  const colorMap: Record<PendingRow['status'], { bg: string; fg: string; label: string }> = {
    pending: { bg: colors.emas100, fg: colors.emas700, label: 'PENDING' },
    created: { bg: colors.sogan50, fg: colors.sogan600, label: 'DRAFT TERKIRIM' },
    synced: { bg: colors.padi100, fg: colors.padi700, label: 'TERSYNC' },
    failed: { bg: colors.bata100, fg: colors.bata700, label: 'GAGAL' },
  };
  const c = colorMap[row.status];
  return (
    <View
      style={{
        padding: spacing.md,
        backgroundColor: colors.white,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ fontWeight: '700', color: colors.wedel900 }}>
          {row.serverNomor ?? row.id.slice(0, 8)}
        </Text>
        <Text style={{ fontSize: 12, color: colors.tanah500 }}>{time}</Text>
      </View>
      <Text style={{ color: colors.tanah500, fontSize: 12, marginTop: 2 }}>
        {row.payload.receiptSnapshot.customerNama} · {row.payload.body.lines.length} item
      </Text>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: spacing.sm,
        }}
      >
        <View
          style={{
            backgroundColor: c.bg,
            paddingHorizontal: 8,
            paddingVertical: 3,
            borderRadius: 6,
          }}
        >
          <Text style={{ color: c.fg, fontSize: 10, fontWeight: '800', letterSpacing: 0.6 }}>
            {c.label}
          </Text>
        </View>
        <Text style={{ fontWeight: '800', color: colors.sogan600 }}>{fmtRp(total)}</Text>
      </View>
      {row.error && (
        <Text style={{ color: colors.bata700, fontSize: 11, marginTop: 4 }} numberOfLines={2}>
          {row.error}
        </Text>
      )}
    </View>
  );
}
