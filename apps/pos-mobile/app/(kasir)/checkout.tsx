/**
 * Checkout placeholder. Fase berikutnya isi: pilih customer (atau Tunai),
 * pilih akun kas/bank, hitung kembalian, simpan ke queue offline + cetak.
 */
import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { useCart, cartTotals } from '@/lib/cart';
import { fmtRp } from '@/lib/format';
import { colors, radii, spacing } from '@/lib/theme';

export default function CheckoutScreen() {
  const router = useRouter();
  const lines = useCart((s) => s.lines);
  const totals = useMemo(() => cartTotals(lines), [lines]);

  return (
    <View style={{ flex: 1, padding: spacing.lg, backgroundColor: colors.cream50 }}>
      <Text style={{ fontSize: 20, fontWeight: '700', color: colors.wedel900 }}>
        Konfirmasi Pembayaran
      </Text>
      <Text style={{ color: colors.tanah500, marginTop: spacing.xs }}>
        {lines.length} item · {lines.reduce((n, l) => n + l.qty, 0)} qty
      </Text>

      <View
        style={{
          marginTop: spacing.lg,
          backgroundColor: colors.white,
          padding: spacing.lg,
          borderRadius: radii.lg,
          borderWidth: 1,
          borderColor: colors.cream200,
        }}
      >
        <Text style={{ fontSize: 11, color: colors.tanah500, fontWeight: '700', letterSpacing: 1 }}>
          TOTAL TAGIHAN
        </Text>
        <Text
          style={{
            fontSize: 36,
            fontWeight: '900',
            color: colors.sogan600,
            marginTop: spacing.xs,
          }}
        >
          {fmtRp(totals.netto)}
        </Text>
      </View>

      <View
        style={{
          marginTop: spacing.lg,
          padding: spacing.lg,
          backgroundColor: colors.emas100,
          borderRadius: radii.md,
          borderWidth: 1,
          borderColor: colors.emas300,
        }}
      >
        <Text style={{ color: colors.emas700, fontSize: 13 }}>
          🛠 Pilih customer + bayar + cetak struk masih dibangun di fase berikutnya.
          Tombol di bawah cuma kembali ke kasir.
        </Text>
      </View>

      <View style={{ flex: 1 }} />
      <Pressable
        onPress={() => router.back()}
        style={({ pressed }) => ({
          padding: spacing.md,
          borderRadius: radii.md,
          backgroundColor: pressed ? colors.sogan600 : colors.sogan500,
          alignItems: 'center',
        })}
      >
        <Text style={{ color: colors.cream50, fontWeight: '800', fontSize: 16 }}>
          Kembali ke Kasir
        </Text>
      </Pressable>
    </View>
  );
}
