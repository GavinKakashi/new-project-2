import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { ApprovalCard, ToolCallSummary } from '@/components/items';
import { Avatar, Button, Card, ErrorNote, Loading, Row, Screen, Section, StatusPill, Text } from '@/components/ui';
import type { RunEvent } from '@/lib/api';
import { compact, duration, money, timeAgo } from '@/lib/format';
import { useApi } from '@/lib/session';
import { colors, space } from '@/lib/theme';

const ACTIVE = ['queued', 'running', 'awaiting_approval'];

export default function RunDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useApi();
  const qc = useQueryClient();
  const [events, setEvents] = useState<RunEvent[]>([]);
  const lastId = useRef(0);

  const run = useQuery({
    queryKey: ['run', id],
    queryFn: () => api.run(id),
    refetchInterval: (q) => (q.state.data && ACTIVE.includes(q.state.data.run.status) ? 2_000 : false),
  });
  const isActive = !run.data || ACTIVE.includes(run.data.run.status);

  // Incrementally pull the timeline while the run is live.
  useEffect(() => {
    let stop = false;
    lastId.current = 0;
    setEvents([]);
    async function tick() {
      try {
        const res = await api.runEvents(id, lastId.current);
        if (stop) return;
        if (res.events.length) {
          lastId.current = res.events[res.events.length - 1].id;
          setEvents((prev) => [...prev, ...res.events]);
        }
        if (ACTIVE.includes(res.status)) setTimeout(tick, 1_500);
        else void qc.invalidateQueries({ queryKey: ['run', id] });
      } catch {
        if (!stop) setTimeout(tick, 4_000);
      }
    }
    void tick();
    return () => {
      stop = true;
    };
  }, [api, id, qc, isActive]);

  const cancel = useMutation({ mutationFn: () => api.cancelRun(id), onSuccess: () => qc.invalidateQueries() });
  const retry = useMutation({ mutationFn: () => api.retryRun(id), onSuccess: (r) => router.replace(`/run/${r.id}`) });

  if (run.error) return <Screen><ErrorNote error={run.error} /></Screen>;
  if (!run.data) return <Loading />;
  const { run: r, agent, approvals } = run.data;
  const pending = approvals.filter((a) => a.status === 'pending');

  return (
    <Screen>
      <Stack.Screen options={{ title: agent?.name ?? 'Run' }} />
      <Row style={{ justifyContent: 'space-between' }}>
        <Row style={{ flex: 1 }} gap={space.md}>
          {agent && <Avatar emoji={agent.avatar} color={agent.color} size={40} />}
          <View style={{ flex: 1 }}>
            <Text variant="heading">
              {agent?.name}
            </Text>
            <Text variant="small">
              {r.trigger} · {timeAgo(r.createdAt)}
            </Text>
          </View>
        </Row>
        <StatusPill status={r.status} />
      </Row>

      <Row style={{ flexWrap: 'wrap' }} gap={space.lg}>
        <Metric label="Duration" value={duration(r.startedAt, r.finishedAt)} />
        <Metric label="Turns" value={String(r.turns)} />
        <Metric label="Tokens" value={compact(r.inputTokens + r.outputTokens)} />
        <Metric label="Cost" value={money(r.costUsd)} />
      </Row>

      {r.input ? (
        <Card style={{ gap: 4 }}>
          <Text variant="label">Task</Text>
          <Text selectable>{r.input}</Text>
        </Card>
      ) : null}

      {pending.map((a) => (
        <ApprovalCard key={a.id} approval={a} compact />
      ))}

      {r.status === 'succeeded' && r.output && (
        <Card style={{ gap: 6, borderColor: colors.success + '66' }}>
          <Text variant="label" style={{ color: colors.success }}>
            Result
          </Text>
          <Text selectable>{r.output}</Text>
        </Card>
      )}
      {r.error && (
        <Card style={{ gap: 6, borderColor: colors.danger + '66' }}>
          <Text variant="label" style={{ color: colors.danger }}>
            Error
          </Text>
          <Text selectable>{r.error}</Text>
        </Card>
      )}

      <Row>
        {ACTIVE.includes(r.status) ? (
          <Button title="Stop run" variant="secondary" icon="stop" onPress={() => cancel.mutate()} loading={cancel.isPending} style={{ flex: 1 }} />
        ) : (
          <Button title="Run again" variant="secondary" icon="refresh" onPress={() => retry.mutate()} loading={retry.isPending} style={{ flex: 1 }} />
        )}
        {agent && <Button title="Agent" variant="secondary" icon="person-outline" onPress={() => router.push(`/agent/${agent.id}`)} style={{ flex: 1 }} />}
      </Row>

      <Section title="Timeline">
        {events.map((e) => (
          <TimelineItem key={e.id} event={e} />
        ))}
        {ACTIVE.includes(r.status) && r.status !== 'awaiting_approval' && (
          <Row style={{ padding: space.md }}>
            <ActivityIndicator color={colors.info} />
            <Text variant="dim">Working…</Text>
          </Row>
        )}
      </Section>
    </Screen>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text variant="small">{label}</Text>
      <Text variant="heading" style={{ fontSize: 15 }}>
        {value}
      </Text>
    </View>
  );
}

const TOOL_ICONS: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
  web_search: 'search',
  web_fetch: 'globe-outline',
  http_request: 'code-slash',
  agent_memory: 'albums-outline',
  send_push_notification: 'notifications-outline',
  get_current_time: 'time-outline',
};

function TimelineItem({ event: e }: { event: RunEvent }) {
  const [open, setOpen] = useState(false);
  switch (e.type) {
    case 'status':
      if (e.data.status === 'queued' || e.data.status === 'running') return null;
      return <Text variant="small">● {e.data.status.replace('_', ' ')}</Text>;
    case 'text':
      return (
        <Card style={{ paddingVertical: space.md }}>
          <Text selectable>{e.data.text}</Text>
        </Card>
      );
    case 'thinking':
      return (
        <Text variant="dim" style={{ fontStyle: 'italic' }} numberOfLines={open ? undefined : 3} onPress={() => setOpen(!open)}>
          💭 {e.data.text}
        </Text>
      );
    case 'tool_call':
      return (
        <Card style={{ paddingVertical: space.md, gap: 6, backgroundColor: colors.surfaceAlt }}>
          <Row>
            <Ionicons name={TOOL_ICONS[e.data.name] ?? 'construct-outline'} size={16} color={colors.info} />
            <Text variant="small" style={{ color: colors.info, fontWeight: '700' }}>
              {e.data.name}
            </Text>
          </Row>
          <ToolCallSummary name={e.data.name} input={e.data.input} />
        </Card>
      );
    case 'tool_result':
      return (
        <View style={{ paddingLeft: space.lg, gap: 4 }}>
          <Text variant="small" style={{ color: e.data.isError ? colors.danger : colors.success }} onPress={() => setOpen(!open)}>
            {e.data.isError ? '✗' : '✓'} {e.data.name} result {open ? '▾' : '▸'}
          </Text>
          {open && (
            <Text variant="mono" selectable style={{ color: colors.textDim }}>
              {e.data.content}
              {e.data.results?.map((x: { title: string; url: string }) => `\n• ${x.title}\n  ${x.url}`).join('')}
            </Text>
          )}
        </View>
      );
    case 'approval_requested':
      return <Text variant="small" style={{ color: colors.warning }}>⏸ Waiting for approval: {e.data.name}</Text>;
    case 'approval_resolved':
      return (
        <Text variant="small" style={{ color: e.data.decision === 'approve' ? colors.success : colors.danger }}>
          {e.data.decision === 'approve' ? '✓ Approved' : '✗ Denied'} {e.data.name}
          {e.data.note ? ` — “${e.data.note}”` : ''}
        </Text>
      );
    default:
      return null;
  }
}
