import { useQuery } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { useState } from 'react';
import { Alert, Platform } from 'react-native';
import { Button, Card, Row, Screen, Section, Text } from '@/components/ui';
import { registerForPush } from '@/lib/push';
import { useApi, useSession } from '@/lib/session';
import { colors } from '@/lib/theme';

export default function Settings() {
  const { user, serverUrl, signOut } = useSession();
  const api = useApi();
  const health = useQuery({ queryKey: ['health'], queryFn: api.health });
  const meta = useQuery({ queryKey: ['meta'], queryFn: api.meta, staleTime: Infinity });
  const [pushState, setPushState] = useState<string | null>(null);

  const confirmSignOut = () => {
    if (Platform.OS === 'web') return void signOut();
    Alert.alert('Sign out?', 'You can sign back in at any time.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
    ]);
  };

  return (
    <Screen>
      <Section title="Account">
        <Card style={{ gap: 4 }}>
          <Text variant="heading">{user?.name}</Text>
          <Text variant="dim">{user?.email}</Text>
        </Card>
      </Section>

      <Section title="Server">
        <Card style={{ gap: 8 }}>
          <Text variant="mono" selectable>
            {serverUrl}
          </Text>
          <Row>
            <Text variant="small">Status:</Text>
            <Text variant="small" style={{ color: health.data?.ok ? colors.success : colors.danger }}>
              {health.isLoading ? 'checking…' : health.data?.ok ? `online · v${health.data.version}` : 'unreachable'}
            </Text>
          </Row>
          <Row>
            <Text variant="small">Model provider:</Text>
            <Text variant="small" style={{ color: meta.data?.demoMode ? colors.warning : colors.success }}>
              {meta.data ? (meta.data.demoMode ? 'Demo mode (no API key)' : 'Anthropic Claude') : '…'}
            </Text>
          </Row>
        </Card>
      </Section>

      <Section title="Notifications">
        <Card style={{ gap: 8 }}>
          <Text variant="dim">Get alerts on this device when agents finish scheduled runs, fail, or need approval.</Text>
          <Button
            title="Enable push notifications"
            variant="secondary"
            icon="notifications-outline"
            onPress={async () => setPushState(await registerForPush(api))}
          />
          {pushState && (
            <Text variant="small">
              {pushState === 'registered'
                ? '✓ This device will receive notifications.'
                : pushState === 'denied'
                  ? 'Permission denied — enable notifications in system settings.'
                  : 'Push is unavailable here (web, simulator, or no EAS project id).'}
            </Text>
          )}
        </Card>
      </Section>

      <Section title="About">
        <Card style={{ gap: 4 }}>
          <Text>Agentry {Constants.expoConfig?.version ?? ''}</Text>
          <Text variant="small">AI agent command center</Text>
        </Card>
      </Section>

      <Button title="Sign out" variant="danger" icon="log-out-outline" onPress={confirmSignOut} style={{ marginTop: 24 }} />
    </Screen>
  );
}
