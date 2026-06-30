/**
 * Layar kasir utama. Layout: dua kolom di tablet; satu kolom + tab di hp.
 * Kolom kiri = katalog (search + grid). Kolom kanan = keranjang + total + bayar.
 * MVP: orientasi portrait satu kolom dengan toggle tab.
 */
import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  FlatList,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ApiError } from '@/lib/api';
import { cachedItems } from '@/lib/cache';
import { useCart, cartTotals, type Item } from '@/lib/cart';
import { fmtRp } from '@/lib/format';
import { colors, radii, spacing } from '@/lib/theme';

export default function KasirScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<'katalog' | 'keranjang'>('katalog');
  const [search, setSearch] = useState('');

  const items = useQuery({
    queryKey: ['items-cache'],
    queryFn: () => cachedItems(),
    staleTime: 0,
  });

  // Refetch katalog tiap tab Kasir di-focus (mis. abis sync di Setelan).
  useFocusEffect(
    useCallback(() => {
      void items.refetch();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const lines = useCart((s) => s.lines);
  const cartCount = lines.reduce((n, l) => n + l.qty, 0);

  const filteredItems = useMemo(() => {
    const data = items.data ?? [];
    const active = data.filter((i) => i.isAktif);
    if (!search.trim()) return active;
    const q = search.toLowerCase();
    return active.filter(
      (i) => i.nama.toLowerCase().includes(q) || i.kode.toLowerCase().includes(q),
    );
  }, [items.data, search]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.cream50 }}>
      <View style={{ flexDirection: 'row', padding: spacing.md, gap: spacing.sm }}>
        <TabBtn
          label="Katalog"
          active={tab === 'katalog'}
          onPress={() => setTab('katalog')}
        />
        <TabBtn
          label={`Keranjang${cartCount > 0 ? ` · ${cartCount}` : ''}`}
          active={tab === 'keranjang'}
          onPress={() => setTab('keranjang')}
          badge={cartCount > 0}
        />
      </View>

      {tab === 'katalog' ? (
        <>
          <View style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.sm }}>
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Cari nama / kode barang…"
              style={{
                backgroundColor: colors.white,
                borderWidth: 1,
                borderColor: colors.cream200,
                borderRadius: radii.md,
                padding: spacing.md,
                fontSize: 15,
              }}
            />
          </View>
          {items.isLoading ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color={colors.sogan500} />
            </View>
          ) : items.isError ? (
            <Text style={{ color: colors.bata700, padding: spacing.lg }}>
              {(items.error as ApiError)?.message ?? 'Gagal load katalog'}
            </Text>
          ) : (
            <FlatList
              data={filteredItems}
              keyExtractor={(i) => i.id}
              numColumns={2}
              columnWrapperStyle={{ gap: spacing.sm, paddingHorizontal: spacing.md }}
              ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
              contentContainerStyle={{ paddingBottom: spacing.xl }}
              renderItem={({ item }) => <ItemCard item={item} />}
              ListEmptyComponent={() => (
                <Text style={{ textAlign: 'center', color: colors.tanah500, marginTop: spacing.xl }}>
                  Tidak ada barang.
                </Text>
              )}
            />
          )}
        </>
      ) : (
        <CartPanel onCheckout={() => router.push('/(kasir)/checkout')} />
      )}
    </View>
  );
}

function TabBtn({
  label,
  active,
  onPress,
  badge,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  badge?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        padding: spacing.md,
        borderRadius: radii.md,
        backgroundColor: active
          ? colors.sogan500
          : pressed
            ? colors.cream200
            : colors.white,
        borderWidth: 1,
        borderColor: active ? colors.sogan500 : colors.cream200,
        alignItems: 'center',
      })}
    >
      <Text
        style={{
          color: active ? colors.cream50 : badge ? colors.sogan600 : colors.tanah700,
          fontWeight: '700',
          letterSpacing: 0.3,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function ItemCard({ item }: { item: Item }) {
  const add = useCart((s) => s.add);
  return (
    <Pressable
      onPress={() => add(item)}
      style={({ pressed }) => ({
        flex: 1,
        backgroundColor: pressed ? colors.cream100 : colors.white,
        borderWidth: 1,
        borderColor: colors.cream200,
        borderRadius: radii.lg,
        padding: spacing.md,
        minHeight: 90,
      })}
    >
      <Text style={{ fontSize: 11, color: colors.sogan500, fontWeight: '700' }}>
        {item.kode}
      </Text>
      <Text
        numberOfLines={2}
        style={{
          fontSize: 14,
          fontWeight: '600',
          color: colors.wedel900,
          marginTop: 2,
        }}
      >
        {item.nama}
      </Text>
      <Text style={{ fontSize: 15, fontWeight: '700', color: colors.sogan600, marginTop: 6 }}>
        {fmtRp(item.hargaJualDefault)}
      </Text>
      <Text style={{ fontSize: 11, color: colors.tanah500 }}>per {item.satuan}</Text>
    </Pressable>
  );
}

function CartPanel({ onCheckout }: { onCheckout: () => void }) {
  const lines = useCart((s) => s.lines);
  const setQty = useCart((s) => s.setQty);
  const remove = useCart((s) => s.remove);
  const clear = useCart((s) => s.clear);
  const totals = useMemo(() => cartTotals(lines), [lines]);

  if (lines.length === 0) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: colors.tanah500, fontSize: 16 }}>Keranjang kosong</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={lines}
        keyExtractor={(l) => l.itemId}
        ItemSeparatorComponent={() => (
          <View style={{ height: 1, backgroundColor: colors.cream200 }} />
        )}
        contentContainerStyle={{ paddingHorizontal: spacing.md }}
        renderItem={({ item }) => (
          <View style={{ paddingVertical: spacing.md }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <View style={{ flex: 1, marginRight: spacing.sm }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.wedel900 }}>
                  {item.nama}
                </Text>
                <Text style={{ fontSize: 11, color: colors.tanah500 }}>
                  {item.kode} · {fmtRp(item.hargaSatuan)}/{item.satuan}
                </Text>
              </View>
              <Pressable onPress={() => remove(item.itemId)} hitSlop={10}>
                <Text style={{ color: colors.bata500, fontSize: 18 }}>×</Text>
              </Pressable>
            </View>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                marginTop: spacing.sm,
                justifyContent: 'space-between',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <QtyBtn onPress={() => setQty(item.itemId, item.qty - 1)} glyph="−" />
                <Text
                  style={{
                    minWidth: 32,
                    textAlign: 'center',
                    fontSize: 16,
                    fontWeight: '700',
                  }}
                >
                  {item.qty}
                </Text>
                <QtyBtn onPress={() => setQty(item.itemId, item.qty + 1)} glyph="+" />
              </View>
              <Text style={{ fontSize: 15, fontWeight: '700', color: colors.sogan600 }}>
                {fmtRp(item.hargaSatuan * item.qty)}
              </Text>
            </View>
          </View>
        )}
      />

      <View
        style={{
          backgroundColor: colors.white,
          padding: spacing.lg,
          borderTopWidth: 1,
          borderTopColor: colors.cream200,
        }}
      >
        <Row label="Sub Total" value={fmtRp(totals.bruto - totals.diskon)} />
        <Row label="PPN" value={fmtRp(totals.ppn)} />
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            marginTop: spacing.sm,
            paddingTop: spacing.sm,
            borderTopWidth: 1,
            borderTopColor: colors.cream200,
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: '700', color: colors.tanah700 }}>
            TOTAL
          </Text>
          <Text style={{ fontSize: 22, fontWeight: '900', color: colors.sogan600 }}>
            {fmtRp(totals.netto)}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
          <Pressable
            onPress={clear}
            style={{
              flex: 1,
              padding: spacing.md,
              borderRadius: radii.md,
              borderWidth: 1,
              borderColor: colors.cream300,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: colors.tanah700, fontWeight: '700' }}>Kosongkan</Text>
          </Pressable>
          <Pressable
            onPress={onCheckout}
            style={({ pressed }) => ({
              flex: 2,
              padding: spacing.md,
              borderRadius: radii.md,
              backgroundColor: pressed ? colors.sogan600 : colors.sogan500,
              alignItems: 'center',
            })}
          >
            <Text style={{ color: colors.cream50, fontWeight: '800', fontSize: 16 }}>
              BAYAR
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function QtyBtn({ onPress, glyph }: { onPress: () => void; glyph: string }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: pressed ? colors.sogan600 : colors.cream100,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: colors.cream300,
      })}
    >
      <Text style={{ fontSize: 18, fontWeight: '700', color: colors.tanah700 }}>{glyph}</Text>
    </Pressable>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 }}>
      <Text style={{ color: colors.tanah500 }}>{label}</Text>
      <Text style={{ color: colors.tanah700, fontWeight: '600' }}>{value}</Text>
    </View>
  );
}
