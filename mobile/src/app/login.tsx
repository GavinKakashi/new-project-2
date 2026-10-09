import { useEffect, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, View } from 'react-native';
import { Button, ErrorNote, Input, Screen, Text } from '@/components/ui';
import { createApi, normalizeServerUrl } from '@/lib/api';
import { useSession } from '@/lib/session';
import { colors, space } from '@/lib/theme';

export default function Login() {
  const session = useSession();
  const [server, setServer] = useState(session.serverUrl);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [status, setStatus] = useState<{ hasUsers: boolean; signupOpen: boolean } | null>(null);

  // Probe the server so a fresh install opens straight into "create the owner account".
  useEffect(() => {
    const url = normalizeServerUrl(server);
    if (!url) return setStatus(null);
    const t = setTimeout(() => {
      createApi(url, () => null, () => {})
        .authStatus()
        .then((s) => {
          setStatus(s);
          if (!s.hasUsers) setMode('register');
        })
        .catch(() => setStatus(null));
    }, 400);
    return () => clearTimeout(t);
  }, [server]);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      const url = normalizeServerUrl(server);
      if (!url) throw new Error('Enter your Agentry server URL');
      const api = createApi(url, () => null, () => {});
      const res = mode === 'login' ? await api.login(email.trim(), password) : await api.register(name.trim(), email.trim(), password);
      await session.setServerUrl(url);
      await session.signIn(res.token, res.user);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen contentStyle={{ paddingTop: 72 }}>
        <View style={{ gap: space.sm, marginBottom: space.lg }}>
          <Image source={require('@/assets/images/splash-icon.png')} style={{ width: 64, height: 64 }} />
          <Text variant="title">Agentry</Text>
          <Text variant="dim">Run, schedule and supervise your AI agents from anywhere.</Text>
        </View>

        <Input
          label="Server URL"
          value={server}
          onChangeText={setServer}
          placeholder="https://your-agentry.replit.app"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          hint={
            status
              ? status.hasUsers
                ? '✓ Connected'
                : '✓ Connected — new server, create the owner account'
              : 'The address of your Agentry server (e.g. your Replit deployment).'
          }
        />
        {mode === 'register' && <Input label="Name" value={name} onChangeText={setName} placeholder="Ada Lovelace" />}
        <Input
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />
        <Input
          label="Password"
          value={password}
          onChangeText={setPassword}
          placeholder="At least 8 characters"
          secureTextEntry
          onSubmitEditing={submit}
        />
        <ErrorNote error={error} />
        <Button title={mode === 'login' ? 'Sign in' : 'Create account'} onPress={submit} loading={busy} style={{ marginTop: space.sm }} />
        {(mode === 'register' || !status || status.signupOpen) && (
          <Button
            variant="ghost"
            title={mode === 'login' ? 'New here? Create an account' : 'Have an account? Sign in'}
            onPress={() => setMode(mode === 'login' ? 'register' : 'login')}
          />
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}
