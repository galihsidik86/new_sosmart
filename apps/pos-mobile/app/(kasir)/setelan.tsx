import { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { clearSession, getUser, getTenant, type SessionUser, type SessionTenant } from '@/lib/session';
import { API_BASE_URL } from '@/lib/api';
import { colors, radii, spacing } from '@/lib/theme';

export default function SetelanScreen() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [tenant, setTenant] = useState<SessionTenant | null>(null);

  useEffect(() => {
    (async () => {
      setUser(await getUser());
      setTenant(await getTenant());
    })();
  }, []);

  const logout = async () => {
    await clearSession();
    router.replace('/login');
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

      <Section title="Server">
        <Row label="API" value={API_BASE_URL} />
      </Section>

      <Section title="Printer Bluetooth">
        <Text style={{ color: colors.tanah500, fontSize: 13 }}>
          Pairing & test print Bluetooth ESC/POS dibangun di fase berikutnya.
        </Text>
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
