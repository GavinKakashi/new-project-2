import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { AgentForm } from '@/components/AgentForm';
import { ErrorNote, Loading, Screen } from '@/components/ui';
import { useApi } from '@/lib/session';

export default function EditAgent() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useApi();
  const qc = useQueryClient();
  const agent = useQuery({ queryKey: ['agent', id], queryFn: () => api.agent(id) });
  if (agent.error) return <Screen><ErrorNote error={agent.error} /></Screen>;
  if (!agent.data) return <Loading />;
  return (
    <Screen>
      <AgentForm
        initial={agent.data}
        submitLabel="Save changes"
        onSubmit={async (value) => {
          await api.updateAgent(id, value);
          await qc.invalidateQueries();
          router.back();
        }}
      />
    </Screen>
  );
}
