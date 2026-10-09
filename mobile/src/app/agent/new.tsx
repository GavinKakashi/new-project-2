import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { AgentForm } from '@/components/AgentForm';
import { Avatar, Button, Card, Loading, Row, Screen, Text } from '@/components/ui';
import type { AgentInput } from '@/lib/api';
import { useApi } from '@/lib/session';
import { space } from '@/lib/theme';

export default function NewAgent() {
  const api = useApi();
  const qc = useQueryClient();
  const meta = useQuery({ queryKey: ['meta'], queryFn: api.meta, staleTime: Infinity });
  const [draft, setDraft] = useState<AgentInput | null>(null);

  if (!meta.data) return <Loading />;

  if (!draft) {
    return (
      <Screen>
        <Text variant="dim">Start from a template — you can change everything on the next step.</Text>
        {meta.data.templates.map(({ id, ...t }) => (
          <Card key={id} onPress={() => setDraft({ ...t, status: 'active' })}>
            <Row gap={space.md}>
              <Avatar emoji={t.avatar} color={t.color} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="heading">{t.name}</Text>
                <Text variant="dim">{t.description}</Text>
              </View>
            </Row>
          </Card>
        ))}
      </Screen>
    );
  }

  return (
    <Screen>
      <Button title="← Templates" variant="ghost" small onPress={() => setDraft(null)} style={{ alignSelf: 'flex-start' }} />
      <AgentForm
        initial={draft}
        submitLabel="Create agent"
        onSubmit={async (value) => {
          const agent = await api.createAgent(value);
          await qc.invalidateQueries();
          router.replace(`/agent/${agent.id}`);
        }}
      />
    </Screen>
  );
}
