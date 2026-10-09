import { useQuery } from '@tanstack/react-query';
import { ApprovalCard } from '@/components/items';
import { Empty, ErrorNote, Screen, Text } from '@/components/ui';
import { useApi } from '@/lib/session';

export default function Approvals() {
  const api = useApi();
  const approvals = useQuery({ queryKey: ['approvals'], queryFn: api.approvals, refetchInterval: 5_000 });
  return (
    <Screen refreshing={approvals.isRefetching} onRefresh={approvals.refetch}>
      <Text variant="dim">Sensitive tool calls wait here until you approve or deny them. The agent resumes as soon as you decide.</Text>
      <ErrorNote error={approvals.error} />
      {approvals.data?.map((a) => (
        <ApprovalCard key={a.id} approval={a} />
      ))}
      {approvals.isSuccess && approvals.data.length === 0 && <Empty icon="shield-checkmark-outline" title="All clear" body="Nothing needs your approval right now." />}
    </Screen>
  );
}
