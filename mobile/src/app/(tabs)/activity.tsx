import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, router } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { RunRow } from '@/components/items';
import { Card, Chip, Empty, ErrorNote, Row, Screen, Text } from '@/components/ui';
import { timeAgo } from '@/lib/format';
import { useApi } from '@/lib/session';
import { colors } from '@/lib/theme';

export default function Activity() {
  const api = useApi();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'notifications' | 'runs'>('notifications');
  const [status, setStatus] = useState<string | undefined>();
  const notifications = useQuery({ queryKey: ['notifications'], queryFn: api.notifications, refetchInterval: 15_000 });
  const runs = useQuery({ queryKey: ['runs', 'all', status], queryFn: () => api.runs({ status, limit: 50 }), refetchInterval: 8_000, enabled: tab === 'runs' });
  const readAll = useMutation({ mutationFn: api.readAllNotifications, onSuccess: () => qc.invalidateQueries({ queryKey: ['stats'] }) });

  // Opening the tab marks notifications as read.
  useFocusEffect(
    useCallback(() => {
      const t = setTimeout(() => readAll.mutate(), 1500);
      return () => clearTimeout(t);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  return (
    <Screen refreshing={notifications.isRefetching || runs.isRefetching} onRefresh={() => (tab === 'runs' ? runs.refetch() : notifications.refetch())}>
      <Row>
        <Chip label="Notifications" selected={tab === 'notifications'} onPress={() => setTab('notifications')} icon="notifications-outline" />
        <Chip label="All runs" selected={tab === 'runs'} onPress={() => setTab('runs')} icon="list-outline" />
      </Row>

      {tab === 'notifications' ? (
        <>
          <ErrorNote error={notifications.error} />
          {notifications.data?.map((n) => (
            <Card key={n.id} onPress={n.runId ? () => router.push(`/run/${n.runId}`) : undefined} style={{ gap: 4 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Row style={{ flex: 1 }}>
                  {!n.read && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary }} />}
                  <Text variant="heading" style={{ fontSize: 15, flex: 1 }} numberOfLines={1}>
                    {n.title}
                  </Text>
                </Row>
                <Text variant="small">{timeAgo(n.createdAt)}</Text>
              </Row>
              <Text variant="dim" numberOfLines={4}>
                {n.body}
              </Text>
            </Card>
          ))}
          {notifications.isSuccess && notifications.data.length === 0 && (
            <Empty icon="notifications-off-outline" title="No notifications" body="Scheduled runs, failures and approval requests show up here and on your lock screen." />
          )}
        </>
      ) : (
        <>
          <Row style={{ flexWrap: 'wrap' }}>
            {[
              [undefined, 'All'],
              ['active', 'Active'],
              ['succeeded', 'Succeeded'],
              ['failed', 'Failed'],
            ].map(([value, label]) => (
              <Chip key={label} label={label!} selected={status === value} onPress={() => setStatus(value)} />
            ))}
          </Row>
          <ErrorNote error={runs.error} />
          {runs.data?.map((r) => (
            <RunRow key={r.id} run={r} />
          ))}
          {runs.isSuccess && runs.data.length === 0 && <Empty icon="list-outline" title="No runs" />}
        </>
      )}
    </Screen>
  );
}
