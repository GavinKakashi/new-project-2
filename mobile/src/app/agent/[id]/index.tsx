import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, Switch, View } from 'react-native';
import { RunRow } from '@/components/items';
import { Avatar, Button, Card, ErrorNote, Input, Loading, Row, Screen, Section, Text } from '@/components/ui';
import { describeSchedule, money, timeUntil } from '@/lib/format';
import { useApi, useSession } from '@/lib/session';
import { colors, space } from '@/lib/theme';

export default function AgentDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useApi();
  const { serverUrl } = useSession();
  const qc = useQueryClient();
  const [input, setInput] = useState('');
  const [showWebhook, setShowWebhook] = useState(false);

  const agent = useQuery({ queryKey: ['agent', id], queryFn: () => api.agent(id), refetchInterval: 10_000 });
  const runs = useQuery({ queryKey: ['runs', 'agent', id], queryFn: () => api.runs({ agentId: id, limit: 20 }), refetchInterval: 5_000 });
  const memory = useQuery({ queryKey: ['memory', id], queryFn: () => api.memory(id) });
  const meta = useQuery({ queryKey: ['meta'], queryFn: api.meta, staleTime: Infinity });

  const start = useMutation({
    mutationFn: () => api.startRun(id, input),
    onSuccess: (run) => {
      setInput('');
      void qc.invalidateQueries({ queryKey: ['runs'] });
      router.push(`/run/${run.id}`);
    },
  });
  const toggle = useMutation({
    mutationFn: (active: boolean) => api.updateAgent(id, { status: active ? 'active' : 'paused' }),
    onSuccess: () => qc.invalidateQueries(),
  });
  const remove = useMutation({
    mutationFn: () => api.deleteAgent(id),
    onSuccess: async () => {
      await qc.invalidateQueries();
      router.back();
    },
  });
  const forget = useMutation({ mutationFn: (key: string) => api.deleteMemory(id, key), onSuccess: () => memory.refetch() });

  if (agent.error) return <Screen><ErrorNote error={agent.error} /></Screen>;
  const a = agent.data;
  if (!a) return <Loading />;

  const modelLabel = meta.data?.models.find((m) => m.id === a.model)?.label ?? a.model;
  const toolLabels = a.tools.map((t) => meta.data?.tools.find((x) => x.id === t)?.label ?? t);
  const webhookUrl = `${serverUrl}/api/hooks/${a.id}`;

  const confirmDelete = () => {
    const go = () => remove.mutate();
    if (Platform.OS === 'web') return globalThis.confirm?.(`Delete ${a.name}? This removes its runs and memory.`) && go();
    Alert.alert(`Delete ${a.name}?`, 'This removes its runs and memory.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: go },
    ]);
  };

  return (
    <Screen refreshing={agent.isRefetching} onRefresh={() => Promise.all([agent.refetch(), runs.refetch(), memory.refetch()])}>
      <Stack.Screen options={{ title: a.name, headerRight: () => <Button title="Edit" variant="ghost" small onPress={() => router.push(`/agent/${id}/edit`)} /> }} />

      <Row gap={space.md}>
        <Avatar emoji={a.avatar} color={a.color} size={60} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="title" style={{ fontSize: 24 }}>
            {a.name}
          </Text>
          <Text variant="dim">{a.description}</Text>
        </View>
      </Row>

      <Card style={{ gap: space.md }}>
        <Input value={input} onChangeText={setInput} placeholder={a.scheduleInput || 'Give this agent a task…'} multiline style={{ minHeight: 80 }} />
        <ErrorNote error={start.error} />
        <Button title="Run now" icon="play" onPress={() => start.mutate()} loading={start.isPending} />
      </Card>

      <Row style={{ flexWrap: 'wrap' }} gap={space.md}>
        <Card style={{ flex: 1, minWidth: 140, gap: 4 }}>
          <Text variant="small">Runs</Text>
          <Text variant="heading">
            {a.stats.succeeded}✓ {a.stats.failed > 0 ? `${a.stats.failed}✗` : ''}
          </Text>
        </Card>
        <Card style={{ flex: 1, minWidth: 140, gap: 4 }}>
          <Text variant="small">Spend</Text>
          <Text variant="heading">{money(a.stats.costUsd)}</Text>
        </Card>
      </Row>

      <Card style={{ gap: space.md }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <View>
            <Text variant="heading" style={{ fontSize: 15 }}>
              {a.status === 'active' ? 'Active' : 'Paused'}
            </Text>
            <Text variant="small">
              {describeSchedule(a.schedule)}
              {a.nextRunAt ? ` · next ${timeUntil(a.nextRunAt)}` : ''}
            </Text>
          </View>
          <Switch value={a.status === 'active'} onValueChange={(v) => toggle.mutate(v)} trackColor={{ true: colors.success, false: colors.border }} />
        </Row>
        <Detail label="Model" value={`${modelLabel} · ${a.effort} effort`} />
        <Detail label="Tools" value={toolLabels.join(', ') || 'None'} />
        {a.approvalTools.length > 0 && <Detail label="Needs approval" value={a.approvalTools.join(', ')} color={colors.warning} />}
      </Card>

      <Section title="Recent runs">
        {runs.data?.map((r) => <RunRow key={r.id} run={r} showAgent={false} />)}
        {runs.isSuccess && runs.data.length === 0 && <Text variant="dim">No runs yet. Give it a task above.</Text>}
      </Section>

      <Section title="Memory">
        {memory.data?.length ? (
          memory.data.map((m) => (
            <Card key={m.key} style={{ gap: 4, paddingVertical: space.md }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text variant="mono" style={{ fontWeight: '700' }}>
                  {m.key}
                </Text>
                <Button title="Forget" variant="ghost" small onPress={() => forget.mutate(m.key)} />
              </Row>
              <Text variant="dim" numberOfLines={4}>
                {m.value}
              </Text>
            </Card>
          ))
        ) : (
          <Text variant="dim">{a.tools.includes('memory') ? 'Nothing remembered yet.' : 'Enable the Long-term memory tool to let this agent remember things between runs.'}</Text>
        )}
      </Section>

      <Section title="Webhook trigger">
        <Card style={{ gap: space.sm }}>
          <Text variant="dim">Start this agent from Zapier, GitHub, cron jobs or any app with an HTTP POST.</Text>
          {showWebhook ? (
            <>
              <Text variant="mono" selectable>
                POST {webhookUrl}
                {'\n'}X-Agentry-Secret: {a.webhookSecret}
                {'\n'}
                {'{"input": "your task"}'}
              </Text>
              <Button
                title="Copy curl command"
                variant="secondary"
                small
                icon="copy-outline"
                onPress={() =>
                  Clipboard.setStringAsync(
                    `curl -X POST ${webhookUrl} -H 'Content-Type: application/json' -H 'X-Agentry-Secret: ${a.webhookSecret}' -d '{"input":"your task"}'`,
                  )
                }
              />
            </>
          ) : (
            <Button title="Show webhook details" variant="secondary" small onPress={() => setShowWebhook(true)} />
          )}
        </Card>
      </Section>

      <Section title="Instructions">
        <Card>
          <Text variant="dim" selectable>
            {a.systemPrompt}
          </Text>
        </Card>
      </Section>

      <Button title="Delete agent" variant="danger" icon="trash-outline" onPress={confirmDelete} loading={remove.isPending} style={{ marginTop: space.xl }} />
    </Screen>
  );
}

function Detail({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <Text variant="small">{label}</Text>
      <Text variant="small" style={{ color: color ?? colors.text, flex: 1, textAlign: 'right', marginLeft: space.lg }}>
        {value}
      </Text>
    </Row>
  );
}
