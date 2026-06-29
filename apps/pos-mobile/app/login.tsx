import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { apiLogin, ApiError } from '@/lib/api';
import { setTokens, setUser, setTenant } from '@/lib/session';
import { colors, radii, spacing } from '@/lib/theme';

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('owner@lentera.id');
  const [password, setPassword] = useState('lentera123');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const onSubmit = async () => {
    if (loading) return;
    setLoading(true);
    setError('');
    try {
      const r = await apiLogin(email.trim(), password);
      await setTokens(r.accessToken, r.refreshToken);
      await setUser(r.user);

      // Single tenant + single cabang → auto-pick supaya hemat klik.
      const single = r.memberships.length === 1 ? r.memberships[0] : undefined;
      if (single && single.cabangIds.length === 1) {
        // Belum tahu cabang nama/kode — server resolve via /cabang/{id}. Untuk speed,
        // kita pakai placeholder dan refresh nanti di /pilih-cabang.
        router.replace('/pilih-cabang');
      } else {
        router.replace('/pilih-cabang');
      }
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Tidak bisa connect ke server';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: colors.cream50 }}
    >
      <View
        style={{
          flex: 1,
          padding: spacing.xl,
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            alignItems: 'center',
            marginBottom: spacing.xxl,
          }}
        >
          <View
            style={{
              width: 72,
              height: 72,
              borderRadius: radii.xl,
              backgroundColor: colors.sogan500,
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: spacing.md,
            }}
          >
            <Text
              style={{
                color: colors.cream50,
                fontSize: 36,
                fontWeight: '900',
              }}
            >
              L
            </Text>
          </View>
          <Text
            style={{
              fontSize: 28,
              fontWeight: '700',
              color: colors.wedel900,
            }}
          >
            Lentera POS
          </Text>
          <Text
            style={{
              color: colors.tanah500,
              marginTop: spacing.xs,
              fontSize: 13,
              letterSpacing: 1.2,
            }}
          >
            KASIR · CETAK · SYNC
          </Text>
        </View>

        <View
          style={{
            backgroundColor: colors.white,
            padding: spacing.xl,
            borderRadius: radii.lg,
            borderWidth: 1,
            borderColor: colors.cream200,
          }}
        >
          <Text style={labelStyle}>Email</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            style={inputStyle}
            placeholder="kasir@toko.id"
          />
          <Text style={[labelStyle, { marginTop: spacing.md }]}>Password</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            style={inputStyle}
            placeholder="••••••••"
          />

          {error.length > 0 && (
            <View
              style={{
                marginTop: spacing.md,
                padding: spacing.md,
                backgroundColor: colors.bata100,
                borderRadius: radii.md,
                borderWidth: 1,
                borderColor: colors.bata300,
              }}
            >
              <Text style={{ color: colors.bata700, fontSize: 13 }}>{error}</Text>
            </View>
          )}

          <Pressable
            onPress={onSubmit}
            disabled={loading}
            style={({ pressed }) => ({
              marginTop: spacing.xl,
              backgroundColor: pressed ? colors.sogan600 : colors.sogan500,
              padding: spacing.md,
              borderRadius: radii.md,
              alignItems: 'center',
              opacity: loading ? 0.7 : 1,
            })}
          >
            {loading ? (
              <ActivityIndicator color={colors.cream50} />
            ) : (
              <Text
                style={{
                  color: colors.cream50,
                  fontWeight: '700',
                  fontSize: 16,
                  letterSpacing: 0.5,
                }}
              >
                MASUK
              </Text>
            )}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const labelStyle = {
  fontSize: 11,
  fontWeight: '700' as const,
  letterSpacing: 1.2,
  color: colors.tanah500,
  marginBottom: spacing.xs,
};

const inputStyle = {
  backgroundColor: colors.cream50,
  borderWidth: 1,
  borderColor: colors.cream300,
  borderRadius: radii.md,
  padding: spacing.md,
  fontSize: 16,
  color: colors.wedel900,
};
