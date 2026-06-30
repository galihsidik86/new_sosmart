import { useEffect, useState } from 'react';
import { View, Text, Pressable, FlatList, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { apiFetch, ApiError } from '@/lib/api';
import { getUser, setTenant, clearSession } from '@/lib/session';
import { colors, radii, spacing } from '@/lib/theme';

interface Membership {
  tenantId: string;
  tenantNama: string;
  role: string;
  cabangIds: string[];
}

interface Cabang {
  id: string;
  kode: string;
  nama: string;
}

export default function PilihCabangScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [cabang, setCabang] = useState<Cabang[]>([]);
  const [selectedTenant, setSelectedTenant] = useState<Membership | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const user = await getUser();
        if (!user) {
          router.replace('/login');
          return;
        }
        // /tenants/me balikin array membership untuk user yg login.
        // Bentuk: [{ tenantId, tenant:{nama}, role, cabang:[…]|null }]
        type Raw = {
          tenantId: string;
          tenant: { nama: string };
          role: string;
          cabang: Array<{ cabangId: string }> | null;
        };
        const data = await apiFetch<Raw[]>('/tenants/me', { tenantId: '' });
        const ms: Membership[] = data.map((r) => ({
          tenantId: r.tenantId,
          tenantNama: r.tenant.nama,
          role: r.role,
          cabangIds: (r.cabang ?? []).map((c) => c.cabangId),
        }));
        setMemberships(ms);
        if (ms.length === 1 && ms[0]) {
          await pickTenant(ms[0]);
        }
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'Gagal load tenant');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickTenant = async (m: Membership) => {
    setSelectedTenant(m);
    setLoading(true);
    try {
      const list = await apiFetch<Cabang[]>('/cabang', { tenantId: m.tenantId });
      setCabang(list);
      if (list.length === 1) {
        await pickCabang(m, list[0]);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Gagal load cabang');
    } finally {
      setLoading(false);
    }
  };

  const pickCabang = async (m: Membership, c: Cabang) => {
    await setTenant({
      tenantId: m.tenantId,
      tenantNama: m.tenantNama,
      role: m.role,
      cabangId: c.id,
      cabangKode: c.kode,
      cabangNama: c.nama,
    });
    router.replace('/(kasir)');
  };

  const logout = async () => {
    await clearSession();
    router.replace('/login');
  };

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.sogan500} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, padding: spacing.lg }}>
      {error.length > 0 && (
        <Text style={{ color: colors.bata700, marginBottom: spacing.md }}>{error}</Text>
      )}
      {!selectedTenant ? (
        <>
          <Text
            style={{
              fontSize: 12,
              fontWeight: '700',
              letterSpacing: 1.2,
              color: colors.tanah500,
              marginBottom: spacing.sm,
            }}
          >
            PILIH TENANT
          </Text>
          <FlatList
            data={memberships}
            keyExtractor={(m) => m.tenantId}
            ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => pickTenant(item)}
                style={({ pressed }) => ({
                  padding: spacing.lg,
                  borderRadius: radii.md,
                  borderWidth: 1,
                  borderColor: colors.cream200,
                  backgroundColor: pressed ? colors.cream100 : colors.white,
                })}
              >
                <Text style={{ fontSize: 16, fontWeight: '600', color: colors.wedel900 }}>
                  {item.tenantNama}
                </Text>
                <Text style={{ fontSize: 12, color: colors.tanah500, marginTop: 2 }}>
                  {item.role}
                </Text>
              </Pressable>
            )}
          />
        </>
      ) : (
        <>
          <Text
            style={{
              fontSize: 12,
              fontWeight: '700',
              letterSpacing: 1.2,
              color: colors.tanah500,
              marginBottom: spacing.sm,
            }}
          >
            PILIH CABANG · {selectedTenant.tenantNama}
          </Text>
          <FlatList
            data={cabang}
            keyExtractor={(c) => c.id}
            ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => pickCabang(selectedTenant, item)}
                style={({ pressed }) => ({
                  padding: spacing.lg,
                  borderRadius: radii.md,
                  borderWidth: 1,
                  borderColor: colors.cream200,
                  backgroundColor: pressed ? colors.cream100 : colors.white,
                })}
              >
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.sogan500 }}>
                  {item.kode}
                </Text>
                <Text style={{ fontSize: 16, color: colors.wedel900, marginTop: 2 }}>
                  {item.nama}
                </Text>
              </Pressable>
            )}
          />
        </>
      )}

      <Pressable
        onPress={logout}
        style={{ alignSelf: 'center', marginTop: spacing.xl, padding: spacing.md }}
      >
        <Text style={{ color: colors.bata500, fontWeight: '600' }}>Keluar</Text>
      </Pressable>
    </View>
  );
}
