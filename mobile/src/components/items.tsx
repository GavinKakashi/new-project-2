import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, View } from 'react-native';
import type { Agent, Approval, RunSummary } from '@/lib/api';
import { describeSchedule, duration, money, timeAgo, timeUntil } from '@/lib/format';
import { useApi } from '@/lib/session';
import { colors, space } from '@/lib/theme';
import { Avatar, Button, Card, Input, Row, StatusPill, Text } from './ui';

export function AgentCard({ agent }: { agent: Agent }) {
  return (
    <Card onPress={() => router.push(`/agent/${agent.id}`)} style={{ gap: space.md }}>
      <Row gap={space.md}>
        <Avatar emoji={agent.avatar} color={agent.color} />
        <View style={{ flex: 1, gap: 2 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text variant="heading" numberOfLines={1} style={{ flex: 1 }}>
              {agent.name}
            </Text>
            <StatusPill status={agent.stats.active ? 'running' : agent.status} />
          </Row>
          <Text variant="dim" numberOfLines={1}>
            {agent.description || agent.systemPrompt}
          </Text>
        </View>
      </Row>
      <Row gap={space.lg}>
        <Meta icon="time-outline" text={agent.schedule && agent.status === 'active' ? `Next ${timeUntil(agent.nextRunAt)}` : describeSchedule(agent.schedule)} />
        <Meta icon="play-outline" text={`${agent.stats.runs} runs`} />
        <Meta icon="cash-outline" text={money(agent.stats.costUsd)} />
      </Row>
    </Card>
  );
}

function Meta({ icon, text }: { icon: React.ComponentProps<typeof Ionicons>['name']; text: string }) {
  return (
    <Row gap={4}>
      <Ionicons name={icon} size={14} color={colors.textFaint} />
      <Text variant="small">{text}</Text>
    </Row>
  );
}

export function RunRow({ run, showAgent = true }: { run: RunSummary; showAgent?: boolean }) {
  return (
    <Card onPress={() => router.push(`/run/${run.id}`)} style={{ gap: 6, paddingVertical: space.md }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row style={{ flex: 1 }}>
          {showAgent && run.agent && <Text>{run.agent.avatar}</Text>}
          <Text variant="heading" numberOfLines={1} style={{ flex: 1, fontSize: 15 }}>
            {showAgent && run.agent ? run.agent.name : run.input || 'Run'}
          </Text>
        </Row>
        <StatusPill status={run.status} />
      </Row>
      {(run.output || run.error || (showAgent && run.input)) && (
        <Text variant="dim" numberOfLines={2}>
          {run.error ?? run.output ?? run.input}
        </Text>
      )}
      <Row gap={space.md}>
        <Text variant="small">{timeAgo(run.createdAt)}</Text>
        <Text variant="small">· {run.trigger}</Text>
        {run.startedAt && <Text variant="small">· {duration(run.startedAt, run.finishedAt)}</Text>}
        {run.costUsd > 0 && <Text variant="small">· {money(run.costUsd)}</Text>}
      </Row>
    </Card>
  );
}

export function ToolCallSummary({ name, input }: { name: string; input: any }) {
  if (name === 'http_request' && input) {
    return (
      <View style={{ gap: 6 }}>
        <Text variant="mono" style={{ fontWeight: '700' }}>
          {input.method} {input.url}
        </Text>
        {input.body ? <Text variant="mono" numberOfLines={8}>{input.body}</Text> : null}
      </View>
    );
  }
  return (
    <Text variant="mono" numberOfLines={10}>
      {name}
      {input && Object.keys(input).length ? `\n${JSON.stringify(input, null, 2)}` : ''}
    </Text>
  );
}

export function ApprovalCard({ approval, compact }: { approval: Approval; compact?: boolean }) {
  const api = useApi();
  const qc = useQueryClient();
  const [note, setNote] = useState('');
  const decide = useMutation({
    mutationFn: (decision: 'approve' | 'deny') => api.decide(approval.id, decision, note || undefined),
    onSuccess: () => {
      if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      void qc.invalidateQueries();
    },
  });

  return (
    <Card style={{ gap: space.md, borderColor: colors.warning + '66' }}>
      {!compact && approval.agent && (
        <Row>
          <Avatar emoji={approval.agent.avatar} color={approval.agent.color} size={32} />
          <View style={{ flex: 1 }}>
            <Text variant="heading" style={{ fontSize: 15 }}>
              {approval.agent.name}
            </Text>
            <Text variant="small">wants to run a tool · {timeAgo(approval.createdAt)}</Text>
          </View>
        </Row>
      )}
      <View style={{ backgroundColor: colors.bg, borderRadius: 10, padding: space.md }}>
        <ToolCallSummary name={approval.toolName} input={approval.input} />
      </View>
      {approval.status === 'pending' ? (
        <>
          <Input value={note} onChangeText={setNote} placeholder="Optional note to the agent" />
          <Row>
            <Button title="Deny" variant="secondary" icon="close" style={{ flex: 1 }} onPress={() => decide.mutate('deny')} loading={decide.isPending && decide.variables === 'deny'} />
            <Button title="Approve" variant="success" icon="checkmark" style={{ flex: 1 }} onPress={() => decide.mutate('approve')} loading={decide.isPending && decide.variables === 'approve'} />
          </Row>
          {!compact && <Button title="Open run" variant="ghost" small onPress={() => router.push(`/run/${approval.runId}`)} />}
        </>
      ) : (
        <StatusPill status={approval.status === 'approved' ? 'succeeded' : 'failed'} />
      )}
    </Card>
  );
}
