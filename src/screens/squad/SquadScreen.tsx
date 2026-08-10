import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  fetchSquad,
  removeFriend,
  respondToFriendRequest,
  sendFriendRequest,
} from '../../lib/squadApi';
import {
  formatChain,
  formatClockTime,
  formatDuration,
  formatElapsedLabel,
  formatFriendCode,
  formatRelativeTime,
  minutesSince,
  totalChainMinutes,
} from '../../lib/squadFormat';
import { showErrorToast, showSuccessToast } from '../../lib/toast';
import { useSquadCode } from '../../providers/SquadProvider';
import {
  ACTIVITY_META,
  EMPTY_SQUAD,
  type Squad,
  type SquadFriend,
  type SquadRequest,
} from '../../types/squad';

/**
 * How often the tab refreshes while it is open. There is no socket server, so
 * this is the only way a friend's state changes appear. It only runs while this
 * screen is focused — see the useFocusEffect below.
 *
 * Elapsed timers do NOT depend on this: they are computed from `started_at` and
 * ticked locally, so lengthening this interval never makes a timer look stuck.
 */
const POLL_INTERVAL_MS = 20_000;

/** Local re-render cadence for the "for 25m" labels. */
const CLOCK_TICK_MS = 15_000;

function Counter({ value, label, accent }: { value: number; label: string; accent?: boolean }) {
  return (
    <View style={styles.counter}>
      <Text style={[styles.counterValue, accent && value > 0 ? styles.counterValueAccent : null]}>
        {value}
      </Text>
      <Text style={styles.counterLabel}>{label}</Text>
    </View>
  );
}

function StatusDot({ color }: { color: string }) {
  return <View style={[styles.dot, { backgroundColor: color }]} />;
}

function RequestRow({
  request,
  nowMs,
  busy,
  onAccept,
  onDecline,
}: {
  request: SquadRequest;
  nowMs: number;
  busy: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowMain}>
        <Text style={styles.rowName}>{request.username ?? 'Someone'}</Text>
        <Text style={styles.rowSub}>Wants to join your squad · {formatRelativeTime(request.created_at, nowMs)}</Text>
      </View>
      <View style={styles.rowActions}>
        <Pressable
          style={[styles.acceptButton, busy && styles.buttonDisabled]}
          onPress={onAccept}
          disabled={busy}
          accessibilityLabel={`Accept ${request.username ?? 'request'}`}
        >
          <Text style={styles.acceptText}>Accept</Text>
        </Pressable>
        <Pressable
          style={styles.declineButton}
          onPress={onDecline}
          disabled={busy}
          accessibilityLabel={`Decline ${request.username ?? 'request'}`}
        >
          <Text style={styles.declineText}>Decline</Text>
        </Pressable>
      </View>
    </View>
  );
}

function FriendRow({
  friend,
  nowMs,
  onDetail,
}: {
  friend: SquadFriend;
  nowMs: number;
  onDetail: () => void;
}) {
  const meta = ACTIVITY_META[friend.state];
  const elapsed = friend.state === 'offline' ? null : formatElapsedLabel(friend.started_at, nowMs);

  return (
    <View style={styles.row}>
      <StatusDot color={meta.color} />
      <View style={styles.rowMain}>
        <Text style={styles.rowName}>{friend.username ?? 'Unnamed'}</Text>
        <Text style={styles.rowSub}>
          {meta.label}
          {elapsed ? ` · ${elapsed}` : ''}
        </Text>
      </View>
      <Pressable
        style={styles.detailButton}
        onPress={onDetail}
        accessibilityLabel={`Details for ${friend.username ?? 'friend'}`}
      >
        <Text style={styles.detailText}>Detail</Text>
      </Pressable>
    </View>
  );
}

function AddFriendModal({
  visible,
  myCode,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  myCode: string | null;
  onClose: () => void;
  onSubmit: (code: string) => Promise<void>;
}) {
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!visible) {
      setCode('');
      setSending(false);
    }
  }, [visible]);

  const submit = async () => {
    setSending(true);
    try {
      await onSubmit(code);
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Add to squad</Text>
          <Text style={styles.modalSub}>
            Ask for their 6-character code. They'll get a request to accept.
          </Text>

          <TextInput
            style={styles.codeInput}
            value={code}
            onChangeText={(text) => setCode(text.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 6))}
            placeholder="A7X9BQ"
            placeholderTextColor="#3A3A42"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={6}
            accessibilityLabel="Friend code"
          />

          <Text style={styles.modalHint}>Your code is {formatFriendCode(myCode)}</Text>

          <Pressable
            style={[styles.primaryButton, (sending || code.length < 6) && styles.buttonDisabled]}
            onPress={() => void submit()}
            disabled={sending || code.length < 6}
          >
            {sending ? (
              <ActivityIndicator color="#0A0A0C" />
            ) : (
              <Text style={styles.primaryButtonText}>Send request</Text>
            )}
          </Pressable>

          <Pressable style={styles.modalClose} onPress={onClose}>
            <Text style={styles.modalCloseText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function FriendDetailModal({
  friend,
  nowMs,
  onClose,
  onRemove,
}: {
  friend: SquadFriend | null;
  nowMs: number;
  onClose: () => void;
  onRemove: (friend: SquadFriend) => void;
}) {
  if (!friend) return null;

  const meta = ACTIVITY_META[friend.state];
  const blockMins = minutesSince(friend.started_at, nowMs);
  const shiftMins = minutesSince(friend.shift_started_at, nowMs);
  const chainMins = totalChainMinutes(friend.blocks);
  const offline = friend.state === 'offline';

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <View style={styles.detailHead}>
            <StatusDot color={meta.color} />
            <Text style={styles.modalTitle}>{friend.username ?? 'Unnamed'}</Text>
          </View>
          <Text style={[styles.modalSub, { color: meta.color }]}>{meta.description}</Text>

          {offline ? (
            <Text style={styles.detailEmpty}>Not in a shift right now.</Text>
          ) : (
            <View style={styles.detailBody}>
              <View style={styles.detailLine}>
                <Text style={styles.detailKey}>Current block</Text>
                <Text style={styles.detailValue}>
                  {meta.label}
                  {blockMins != null ? ` · ${formatDuration(blockMins)}` : ''}
                </Text>
              </View>
              <View style={styles.detailLine}>
                <Text style={styles.detailKey}>Started</Text>
                <Text style={styles.detailValue}>{formatClockTime(friend.started_at)}</Text>
              </View>
              <View style={styles.detailLine}>
                <Text style={styles.detailKey}>Shift began</Text>
                <Text style={styles.detailValue}>
                  {formatClockTime(friend.shift_started_at)}
                  {shiftMins != null ? ` · ${formatDuration(shiftMins)} ago` : ''}
                </Text>
              </View>

              <Text style={styles.chainLabel}>Chain so far</Text>
              <Text style={styles.chainValue}>{formatChain(friend.blocks)}</Text>
              {friend.blocks.length > 0 ? (
                <Text style={styles.chainTotal}>
                  {friend.blocks.length} block{friend.blocks.length === 1 ? '' : 's'} ·{' '}
                  {formatDuration(chainMins)} banked, now on block {friend.blocks.length + 1}
                </Text>
              ) : null}
            </View>
          )}

          <Pressable style={styles.modalClose} onPress={onClose}>
            <Text style={styles.modalCloseText}>Close</Text>
          </Pressable>
          <Pressable style={styles.removeButton} onPress={() => onRemove(friend)}>
            <Text style={styles.removeText}>Remove from squad</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

export function SquadScreen() {
  const insets = useSafeAreaInsets();
  const { myCode, refreshCode } = useSquadCode();

  const [squad, setSquad] = useState<Squad>(EMPTY_SQUAD);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [adding, setAdding] = useState(false);
  const [detailFriend, setDetailFriend] = useState<SquadFriend | null>(null);
  const [busyLinkId, setBusyLinkId] = useState<string | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    const { squad: next, error: fetchError } = await fetchSquad();
    if (!mountedRef.current) return;

    if (fetchError) {
      // Keep whatever is on screen; a dropped poll should not blank the list.
      setError(fetchError);
    } else {
      setError(null);
      setSquad(next);
    }
    setLoading(false);
  }, []);

  // Poll only while this screen is focused, and stop the moment it isn't.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      const tick = () => {
        if (!cancelled) void load();
      };

      tick();
      const poll = setInterval(tick, POLL_INTERVAL_MS);
      const clock = setInterval(() => {
        if (!cancelled) setNowMs(Date.now());
      }, CLOCK_TICK_MS);

      return () => {
        cancelled = true;
        clearInterval(poll);
        clearInterval(clock);
      };
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setNowMs(Date.now());
    await Promise.all([load(), refreshCode()]);
    if (mountedRef.current) setRefreshing(false);
  }, [load, refreshCode]);

  const onSendRequest = useCallback(
    async (code: string) => {
      const result = await sendFriendRequest(code);
      if (!result.ok) {
        showErrorToast('Could not send', result.message);
        return;
      }
      setAdding(false);
      showSuccessToast('Request sent', 'They will see it in their Squad tab.');
      await load();
    },
    [load],
  );

  const onRespond = useCallback(
    async (request: SquadRequest, accept: boolean) => {
      setBusyLinkId(request.link_id);
      try {
        const result = await respondToFriendRequest(request.link_id, accept);
        if (!result.ok) {
          showErrorToast(accept ? 'Could not accept' : 'Could not decline', result.message);
          return;
        }
        if (accept) {
          showSuccessToast('Squad joined', `You and ${request.username ?? 'they'} are connected.`);
        }
        await load();
      } finally {
        if (mountedRef.current) setBusyLinkId(null);
      }
    },
    [load],
  );

  const onRemove = useCallback(
    (friend: SquadFriend) => {
      Alert.alert(
        `Remove ${friend.username ?? 'this friend'}?`,
        'You will stop seeing each other’s status. You can add them again later.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: () => {
              void (async () => {
                const result = await removeFriend(friend.user_id);
                if (!result.ok) {
                  showErrorToast('Could not remove', result.message);
                  return;
                }
                setDetailFriend(null);
                await load();
              })();
            },
          },
        ],
      );
    },
    [load],
  );

  const onCancelOutgoing = useCallback(
    (request: SquadRequest) => {
      Alert.alert('Cancel request?', `Withdraw your request to ${request.username ?? 'them'}.`, [
        { text: 'Keep waiting', style: 'cancel' },
        {
          text: 'Cancel request',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              const result = await removeFriend(request.user_id);
              if (!result.ok) {
                showErrorToast('Could not cancel', result.message);
                return;
              }
              await load();
            })();
          },
        },
      ]);
    },
    [load],
  );

  const shareCode = useCallback(() => {
    if (!myCode) return;
    void Share.share({
      message: `Add me on RISE — my squad code is ${myCode}`,
    }).catch(() => {
      // User dismissed the share sheet, or no share targets exist.
    });
  }, [myCode]);

  const activeCount = useMemo(
    () => squad.friends.filter((f) => f.state !== 'offline').length,
    [squad.friends],
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top + 12 }]}>
      {/* Sticky header: never scrolls away, so the counters and the add button
          stay reachable no matter how long the list gets. */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.title}>Squad</Text>
          <Pressable style={styles.addButton} onPress={() => setAdding(true)}>
            <Text style={styles.addButtonText}>+ Add</Text>
          </Pressable>
        </View>

        <View style={styles.counters}>
          <Counter value={squad.friends.length} label="Squad" />
          <View style={styles.counterDivider} />
          <Counter value={squad.incoming.length} label="Requests" accent />
          <View style={styles.counterDivider} />
          <Counter value={squad.outgoing.length} label="Pending" />
          <View style={styles.counterDivider} />
          <Counter value={activeCount} label="Working" />
        </View>

        <Pressable style={styles.codeCard} onPress={shareCode} accessibilityLabel="Share your friend code">
          <View>
            <Text style={styles.codeLabel}>YOUR CODE</Text>
            <Text style={styles.codeValue}>{formatFriendCode(myCode)}</Text>
          </View>
          <Text style={styles.codeCopy}>Tap to share</Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.list}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 24 }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#9A9AA2" />
        }
      >
        {loading ? <ActivityIndicator color="#9A9AA2" style={styles.loader} /> : null}

        {error && !loading ? (
          <Text style={styles.errorText}>Could not refresh. Showing the last known state.</Text>
        ) : null}

        {squad.incoming.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>New requests</Text>
            {squad.incoming.map((request) => (
              <RequestRow
                key={request.link_id}
                request={request}
                nowMs={nowMs}
                busy={busyLinkId === request.link_id}
                onAccept={() => void onRespond(request, true)}
                onDecline={() => void onRespond(request, false)}
              />
            ))}
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your squad</Text>
          {squad.friends.length === 0 && !loading ? (
            <Text style={styles.emptyText}>
              No one here yet. Share your code above, or add a friend with theirs.
            </Text>
          ) : (
            squad.friends.map((friend) => (
              <FriendRow
                key={friend.user_id}
                friend={friend}
                nowMs={nowMs}
                onDetail={() => setDetailFriend(friend)}
              />
            ))
          )}
        </View>

        {squad.outgoing.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Waiting on them</Text>
            {squad.outgoing.map((request) => (
              <Pressable
                key={request.link_id}
                style={styles.row}
                onPress={() => onCancelOutgoing(request)}
              >
                <View style={styles.rowMain}>
                  <Text style={styles.rowNameMuted}>{request.username ?? 'Someone'}</Text>
                  <Text style={styles.rowSub}>
                    Sent {formatRelativeTime(request.created_at, nowMs)} · tap to cancel
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        ) : null}
      </ScrollView>

      <AddFriendModal
        visible={adding}
        myCode={myCode}
        onClose={() => setAdding(false)}
        onSubmit={onSendRequest}
      />

      <FriendDetailModal
        friend={detailFriend}
        nowMs={nowMs}
        onClose={() => setDetailFriend(null)}
        onRemove={onRemove}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: '#0A0A0C',
    flex: 1,
  },
  header: {
    backgroundColor: '#0A0A0C',
    borderBottomColor: '#222228',
    borderBottomWidth: 1,
    paddingBottom: 16,
    paddingHorizontal: 28,
  },
  headerTop: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  title: {
    color: '#F5F5F7',
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.7,
  },
  addButton: {
    backgroundColor: '#F5F5F7',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  addButtonText: {
    color: '#0A0A0C',
    fontSize: 13,
    fontWeight: '600',
  },
  counters: {
    alignItems: 'center',
    backgroundColor: '#131316',
    borderColor: '#222228',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    marginTop: 16,
    paddingVertical: 12,
  },
  counter: {
    alignItems: 'center',
    flex: 1,
  },
  counterValue: {
    color: '#F5F5F7',
    fontSize: 18,
    fontWeight: '700',
  },
  counterValueAccent: {
    color: '#E8C56A',
  },
  counterLabel: {
    color: '#5C5C66',
    fontSize: 9.5,
    fontWeight: '600',
    letterSpacing: 1,
    marginTop: 3,
    textTransform: 'uppercase',
  },
  counterDivider: {
    backgroundColor: '#222228',
    height: 26,
    width: 1,
  },
  codeCard: {
    alignItems: 'center',
    borderColor: '#2E2E36',
    borderRadius: 14,
    borderStyle: 'dashed',
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  codeLabel: {
    color: '#5C5C66',
    fontSize: 9.5,
    fontWeight: '600',
    letterSpacing: 1.2,
  },
  codeValue: {
    color: '#F5F5F7',
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 3,
    marginTop: 3,
  },
  codeCopy: {
    color: '#9A9AA2',
    fontSize: 11.5,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 28,
    paddingTop: 18,
  },
  loader: {
    marginTop: 20,
  },
  errorText: {
    color: '#9A9AA2',
    fontSize: 12,
    marginBottom: 12,
    textAlign: 'center',
  },
  section: {
    marginBottom: 26,
  },
  sectionTitle: {
    color: '#5C5C66',
    fontSize: 10.5,
    fontWeight: '600',
    letterSpacing: 1.4,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  row: {
    alignItems: 'center',
    backgroundColor: '#131316',
    borderColor: '#222228',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  dot: {
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  rowMain: {
    flex: 1,
  },
  rowName: {
    color: '#F5F5F7',
    fontSize: 14.5,
    fontWeight: '600',
  },
  rowNameMuted: {
    color: '#9A9AA2',
    fontSize: 14.5,
    fontWeight: '500',
  },
  rowSub: {
    color: '#5C5C66',
    fontSize: 11.5,
    fontWeight: '300',
    marginTop: 3,
  },
  rowActions: {
    alignItems: 'flex-end',
    gap: 6,
  },
  acceptButton: {
    backgroundColor: '#F5F5F7',
    borderRadius: 9,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  acceptText: {
    color: '#0A0A0C',
    fontSize: 12.5,
    fontWeight: '600',
  },
  declineButton: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  declineText: {
    color: '#5C5C66',
    fontSize: 11.5,
  },
  detailButton: {
    borderColor: '#2E2E36',
    borderRadius: 9,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  detailText: {
    color: '#9A9AA2',
    fontSize: 12,
    fontWeight: '500',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  emptyText: {
    color: '#5C5C66',
    fontSize: 12.5,
    fontWeight: '300',
    lineHeight: 20,
  },
  modalBackdrop: {
    backgroundColor: 'rgba(0,0,0,0.72)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#131316',
    borderColor: '#222228',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    paddingBottom: 34,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  modalTitle: {
    color: '#F5F5F7',
    fontSize: 19,
    fontWeight: '700',
  },
  modalSub: {
    color: '#9A9AA2',
    fontSize: 12.5,
    fontWeight: '300',
    lineHeight: 19,
    marginTop: 6,
  },
  codeInput: {
    borderColor: '#2E2E36',
    borderRadius: 12,
    borderWidth: 1,
    color: '#F5F5F7',
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: 8,
    marginTop: 18,
    paddingVertical: 14,
    textAlign: 'center',
  },
  modalHint: {
    color: '#5C5C66',
    fontSize: 11.5,
    marginTop: 10,
    textAlign: 'center',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#F5F5F7',
    borderRadius: 13,
    height: 48,
    justifyContent: 'center',
    marginTop: 18,
  },
  primaryButtonText: {
    color: '#0A0A0C',
    fontSize: 14,
    fontWeight: '600',
  },
  modalClose: {
    alignItems: 'center',
    height: 42,
    justifyContent: 'center',
    marginTop: 6,
  },
  modalCloseText: {
    color: '#9A9AA2',
    fontSize: 13,
    fontWeight: '500',
  },
  detailHead: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  detailBody: {
    marginTop: 18,
  },
  detailEmpty: {
    color: '#5C5C66',
    fontSize: 13,
    fontWeight: '300',
    marginTop: 18,
  },
  detailLine: {
    borderBottomColor: '#222228',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 11,
  },
  detailKey: {
    color: '#5C5C66',
    fontSize: 12,
  },
  detailValue: {
    color: '#F5F5F7',
    fontSize: 12.5,
    fontWeight: '500',
  },
  chainLabel: {
    color: '#5C5C66',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1.2,
    marginTop: 18,
    textTransform: 'uppercase',
  },
  chainValue: {
    color: '#F5F5F7',
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 20,
    marginTop: 7,
  },
  chainTotal: {
    color: '#5C5C66',
    fontSize: 11.5,
    fontWeight: '300',
    marginTop: 6,
  },
  removeButton: {
    alignItems: 'center',
    height: 38,
    justifyContent: 'center',
  },
  removeText: {
    color: '#EF4444',
    fontSize: 12.5,
    fontWeight: '500',
  },
});
