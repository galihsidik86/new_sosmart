import { useEffect, useState } from 'react';
import { Tabs, useRouter } from 'expo-router';
import { View, Text, ActivityIndicator } from 'react-native';
import { getTokens, getTenant } from '@/lib/session';
import { colors } from '@/lib/theme';

export default function KasirLayout() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    (async () => {
      const { accessToken } = await getTokens();
      const tenant = await getTenant();
      if (!accessToken) {
        router.replace('/login');
        return;
      }
      if (!tenant) {
        router.replace('/pilih-cabang');
        return;
      }
      setChecked(true);
    })();
  }, [router]);

  if (!checked) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.sogan500} />
      </View>
    );
  }

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.cream50 },
        headerTintColor: colors.tanah700,
        headerTitleStyle: { fontWeight: '700' },
        tabBarStyle: {
          backgroundColor: colors.white,
          borderTopColor: colors.cream200,
        },
        tabBarActiveTintColor: colors.sogan500,
        tabBarInactiveTintColor: colors.tanah300,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Kasir',
          tabBarIcon: () => <TabIcon glyph="🛒" />,
        }}
      />
      <Tabs.Screen
        name="riwayat"
        options={{
          title: 'Riwayat',
          tabBarIcon: () => <TabIcon glyph="📜" />,
        }}
      />
      <Tabs.Screen
        name="setelan"
        options={{
          title: 'Setelan',
          tabBarIcon: () => <TabIcon glyph="⚙️" />,
        }}
      />
    </Tabs>
  );
}

function TabIcon({ glyph }: { glyph: string }) {
  return <Text style={{ fontSize: 22 }}>{glyph}</Text>;
}
