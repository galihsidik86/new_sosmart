import { View, Text } from 'react-native';
import { colors, spacing } from '@/lib/theme';

export default function RiwayatScreen() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg }}>
      <Text style={{ fontSize: 18, fontWeight: '700', color: colors.wedel900 }}>
        Riwayat Struk
      </Text>
      <Text style={{ color: colors.tanah500, marginTop: spacing.sm, textAlign: 'center' }}>
        Daftar transaksi hari ini + status sync ke server.
        {'\n'}Fase berikutnya.
      </Text>
    </View>
  );
}
