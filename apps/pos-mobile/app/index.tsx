/**
 * Splash redirect: cek session → arahkan ke /login, /pilih-cabang, atau /(kasir).
 */
import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { getTokens, getTenant } from '@/lib/session';
import { colors } from '@/lib/theme';

export default function Splash() {
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const { accessToken } = await getTokens();
      if (!accessToken) {
        router.replace('/login');
        return;
      }
      const tenant = await getTenant();
      if (!tenant) {
        router.replace('/pilih-cabang');
        return;
      }
      router.replace('/(kasir)');
    })();
  }, [router]);

  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.cream50,
      }}
    >
      <ActivityIndicator size="large" color={colors.sogan500} />
    </View>
  );
}
