import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { AgentCard } from '@/components/items';
import { Button, Chip, Empty, ErrorNote, Input, Row, Screen } from '@/components/ui';
import { useApi } from '@/lib/session';

export default function Agents() {
  const api = useApi();
  const agents = useQuery({ queryKey: ['agents'], queryFn: api.agents, refetchInterval: 15_000 });
  const [filter, setFilter] = useState<'all' | 'active' | 'paused' | 'scheduled'>('all');
  const [q, setQ] = useState('');

  const list = (agents.data ?? []).filter((a) => {
    if (filter === 'active' && a.status !== 'active') return false;
    if (filter === 'paused' && a.status !== 'paused') return false;
    if (filter === 'scheduled' && !a.schedule) return false;
    return !q || `${a.name} ${a.description}`.toLowerCase().includes(q.toLowerCase());
  });

  return (
    <Screen refreshing={agents.isRefetching} onRefresh={agents.refetch}>
      <Button title="New agent" icon="add" onPress={() => router.push('/agent/new')} />
      {(agents.data?.length ?? 0) > 3 && <Input value={q} onChangeText={setQ} placeholder="Search agents" />}
      <Row style={{ flexWrap: 'wrap' }}>
        {(['all', 'active', 'paused', 'scheduled'] as const).map((f) => (
          <Chip key={f} label={f[0].toUpperCase() + f.slice(1)} selected={filter === f} onPress={() => setFilter(f)} />
        ))}
      </Row>
      <ErrorNote error={agents.error} />
      {list.map((a) => (
        <AgentCard key={a.id} agent={a} />
      ))}
      {agents.isSuccess && list.length === 0 && (
        <Empty icon="people-outline" title={agents.data.length ? 'No matches' : 'No agents yet'} body="Agents are AI workers with a goal, tools, and an optional schedule." />
      )}
    </Screen>
  );
}
