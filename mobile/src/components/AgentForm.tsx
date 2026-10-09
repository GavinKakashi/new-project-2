import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, Switch, View } from 'react-native';
import type { AgentInput } from '@/lib/api';
import { SCHEDULE_PRESETS } from '@/lib/format';
import { useApi } from '@/lib/session';
import { AGENT_AVATARS, AGENT_COLORS, colors, space } from '@/lib/theme';
import { Button, Card, Chip, ErrorNote, Input, Row, Section, Text } from './ui';

export function AgentForm({
  initial,
  submitLabel,
  onSubmit,
}: {
  initial: AgentInput;
  submitLabel: string;
  onSubmit: (value: AgentInput) => Promise<unknown>;
}) {
  const api = useApi();
  const meta = useQuery({ queryKey: ['meta'], queryFn: api.meta, staleTime: Infinity });
  const [v, setV] = useState<AgentInput>(initial);
  const [customCron, setCustomCron] = useState(
    !!initial.schedule && !SCHEDULE_PRESETS.some((p) => p.cron === initial.schedule),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const set = <K extends keyof AgentInput>(k: K, val: AgentInput[K]) => setV((prev) => ({ ...prev, [k]: val }));

  const toggleTool = (id: string) => {
    const on = v.tools.includes(id);
    setV((prev) => ({
      ...prev,
      tools: on ? prev.tools.filter((t) => t !== id) : [...prev.tools, id],
      approvalTools: on ? prev.approvalTools.filter((t) => t !== id) : prev.approvalTools,
    }));
  };
  const toggleApproval = (id: string) =>
    set('approvalTools', v.approvalTools.includes(id) ? v.approvalTools.filter((t) => t !== id) : [...v.approvalTools, id]);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      await onSubmit({ ...v, schedule: v.schedule?.trim() || null });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: space.md }}>
      <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
        {AGENT_AVATARS.map((a) => (
          <Pressable
            key={a}
            onPress={() => set('avatar', a)}
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: v.avatar === a ? v.color + '44' : colors.surface,
              borderWidth: 1,
              borderColor: v.avatar === a ? v.color : colors.border,
            }}>
            <Text style={{ fontSize: 22 }}>{a}</Text>
          </Pressable>
        ))}
      </Row>
      <Row gap={space.sm}>
        {AGENT_COLORS.map((c) => (
          <Pressable
            key={c}
            onPress={() => set('color', c)}
            accessibilityLabel={`Color ${c}`}
            style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: c, borderWidth: 3, borderColor: v.color === c ? colors.text : 'transparent' }}
          />
        ))}
      </Row>

      <Input label="Name" value={v.name} onChangeText={(t) => set('name', t)} placeholder="Research Analyst" maxLength={60} />
      <Input label="Description" value={v.description} onChangeText={(t) => set('description', t)} placeholder="What this agent is for" maxLength={280} />
      <Input
        label="Instructions"
        value={v.systemPrompt}
        onChangeText={(t) => set('systemPrompt', t)}
        multiline
        placeholder="Describe the agent's role, goal, and how it should work."
        hint="This is the agent's system prompt. Be specific about the goal and what a good result looks like."
      />

      <Section title="Model">
        {meta.data?.models.map((m) => (
          <Card
            key={m.id}
            onPress={() => set('model', m.id)}
            style={{ paddingVertical: space.md, borderColor: v.model === m.id ? colors.primary : colors.border, backgroundColor: v.model === m.id ? colors.primaryDim : colors.surface }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Text variant="heading" style={{ fontSize: 15 }}>
                  {m.label}
                </Text>
                <Text variant="small">{m.tier}</Text>
              </View>
              <Text variant="small">
                ${m.inputPerM} / ${m.outputPerM} per M
              </Text>
            </Row>
          </Card>
        ))}
        <Text variant="label" style={{ marginTop: space.sm }}>
          Effort
        </Text>
        <Row style={{ flexWrap: 'wrap' }}>
          {(meta.data?.efforts ?? ['low', 'medium', 'high']).map((e) => (
            <Chip key={e} label={e} selected={v.effort === e} onPress={() => set('effort', e)} />
          ))}
        </Row>
        <Text variant="small">Higher effort = deeper reasoning, more tokens. Medium suits most agents.</Text>
      </Section>

      <Section title="Tools">
        {meta.data?.tools.map((t) => {
          const on = v.tools.includes(t.id);
          return (
            <Card key={t.id} style={{ paddingVertical: space.md, gap: 8 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Text variant="heading" style={{ fontSize: 15 }}>
                    {t.label}
                  </Text>
                  <Text variant="small">{t.description}</Text>
                </View>
                <Switch value={on} onValueChange={() => toggleTool(t.id)} trackColor={{ true: colors.primary, false: colors.border }} />
              </Row>
              {on && t.kind === 'local' && (
                <Row style={{ justifyContent: 'space-between' }}>
                  <Text variant="small" style={{ color: v.approvalTools.includes(t.id) ? colors.warning : colors.textDim }}>
                    Require my approval before each use
                  </Text>
                  <Switch value={v.approvalTools.includes(t.id)} onValueChange={() => toggleApproval(t.id)} trackColor={{ true: colors.warning, false: colors.border }} />
                </Row>
              )}
            </Card>
          );
        })}
      </Section>

      <Section title="Schedule">
        <Row style={{ flexWrap: 'wrap' }}>
          <Chip
            label="Manual only"
            selected={!v.schedule && !customCron}
            onPress={() => {
              setCustomCron(false);
              set('schedule', null);
            }}
          />
          {SCHEDULE_PRESETS.map((p) => (
            <Chip
              key={p.cron}
              label={p.label}
              selected={!customCron && v.schedule === p.cron}
              onPress={() => {
                setCustomCron(false);
                set('schedule', p.cron);
              }}
            />
          ))}
          <Chip label="Custom cron" selected={customCron} onPress={() => setCustomCron(true)} />
        </Row>
        {customCron && (
          <Input
            value={v.schedule ?? ''}
            onChangeText={(t) => set('schedule', t)}
            placeholder="*/30 * * * *"
            autoCapitalize="none"
            hint="minute hour day-of-month month day-of-week (server time zone)"
          />
        )}
        {(v.schedule || customCron) && (
          <Input
            label="Task for scheduled runs"
            value={v.scheduleInput}
            onChangeText={(t) => set('scheduleInput', t)}
            placeholder="e.g. Check https://example.com for changes."
            multiline
          />
        )}
      </Section>

      <ErrorNote error={error} />
      <Button title={submitLabel} onPress={submit} loading={busy} disabled={!v.name.trim() || !v.systemPrompt.trim()} style={{ marginTop: space.md }} />
    </View>
  );
}
