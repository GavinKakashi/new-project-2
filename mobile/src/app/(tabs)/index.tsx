import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { View } from 'react-native';
import { RunRow } from '@/components/items';
import { Button, Card, Empty, ErrorNote, Row, Screen, Section, Stat, Text } from '@/components/ui';
import { compact, money } from '@/lib/format';
import { useApi, useSession } from '@/lib/session';
import { colors, space } from '@/lib/theme';

export default function Home() {
  const api = useApi();
  const { user } = useSession();
  const stats = useQuery({ queryKey: ['stats'], queryFn: api.stats, refetchInterval: 10_000 });
  const meta = useQuery({ queryKey: ['meta'], queryFn: api.meta, staleTime: Infinity });
  const active = useQuery({ queryKey: ['runs', 'active'], queryFn: () => api.runs({ status: 'active', limit: 10 }), refetchInterval: 4_000 });
  const recent = useQuery({ queryKey: ['runs', 'recent'], queryFn: () => api.runs({ limit: 8 }), refetchInterval: 10_000 });

  const s = stats.data;
  const refresh = () => Promise.all([stats.refetch(), active.refetch(), recent.refetch()]);
  const days = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(Date.now() - (6 - i) * 86_400_000).toISOString().slice(0, 10);
    return { day, runs: s?.daily.find((d) => d.day === day)?.runs ?? 0 };
  });
  const maxRuns = Math.max(1, ...days.map((d) => d.runs));

  return (
    <Screen refreshing={stats.isRefetching} onRefresh={refresh}>
      <Text variant="dim">Welcome back{user ? `, ${user.name.split(' ')[0]}` : ''}.</Text>
      {meta.data?.demoMode && (
        <Card style={{ borderColor: colors.warning + '88', gap: 4 }}>
          <Text variant="heading" style={{ color: colors.warning }}>
            Demo mode
          </Text>
          <Text variant="dim">The server has no ANTHROPIC_API_KEY, so agents return simulated answers. Add the key to your server secrets to go live.</Text>
        </Card>
      )}
      <ErrorNote error={stats.error} />

      {s && s.pendingApprovals > 0 && (
        <Card onPress={() => router.push('/approvals')} style={{ backgroundColor: colors.warning + '1F', borderColor: colors.warning }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text variant="heading">
              {s.pendingApprovals} action{s.pendingApprovals === 1 ? '' : 's'} waiting for approval
            </Text>
            <Text style={{ color: colors.warning, fontWeight: '700' }}>Review →</Text>
          </Row>
        </Card>
      )}

      <Row style={{ flexWrap: 'wrap' }} gap={space.md}>
        <Stat label="Active agents" value={s ? `${s.agents.active}/${s.agents.total}` : '–'} />
        <Stat label="Running now" value={s ? String(s.last30Days.running) : '–'} color={colors.info} />
      </Row>
      <Row style={{ flexWrap: 'wrap' }} gap={space.md}>
        <Stat label="Runs · 30 days" value={s ? compact(s.last30Days.runs) : '–'} />
        <Stat label="Spend · 30 days" value={s ? money(s.last30Days.costUsd) : '–'} color={colors.success} />
      </Row>

      {s && s.last30Days.runs > 0 && (
        <Card style={{ gap: space.sm }}>
          <Text variant="label">Runs · last 7 days</Text>
          <Row style={{ alignItems: 'flex-end', height: 80 }} gap={6}>
            {days.map((d) => (
              <View key={d.day} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
                <View style={{ width: '100%', height: Math.max(3, (d.runs / maxRuns) * 60), backgroundColor: d.runs ? colors.primary : colors.border, borderRadius: 4 }} />
                <Text variant="small" style={{ fontSize: 10 }}>
                  {d.day.slice(5)}
                </Text>
              </View>
            ))}
          </Row>
        </Card>
      )}

      {active.data && active.data.length > 0 && (
        <Section title="In progress">
          {active.data.map((r) => (
            <RunRow key={r.id} run={r} />
          ))}
        </Section>
      )}

      <Section title="Recent runs">
        {recent.data?.length ? (
          recent.data.map((r) => <RunRow key={r.id} run={r} />)
        ) : (
          <Empty
            icon="rocket-outline"
            title="No runs yet"
            body="Create your first agent from a template and run it."
            action={<Button title="Create an agent" icon="add" onPress={() => router.push('/agent/new')} />}
          />
        )}
      </Section>
    </Screen>
  );
}
