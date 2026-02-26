import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Feather';
import { colors } from '../../styles/colors';
import {
  useReceivedRequests,
  useSentRequests,
  useRespondFriendRequest,
  useCancelFriendRequest,
} from '../../hooks/friends.hook';

type Tab = 'received' | 'sent';

const FriendRequestsScreen = () => {
  const navigation = useNavigation();
  const [tab, setTab] = useState<Tab>('received');

  const { data: received, isLoading: loadingReceived } = useReceivedRequests();
  const { data: sent,     isLoading: loadingSent     } = useSentRequests();
  const { mutate: respond,  isPending: isResponding  } = useRespondFriendRequest();
  const { mutate: cancel,   isPending: isCanceling   } = useCancelFriendRequest();

  const renderReceived = () => {
    if (loadingReceived)
      return <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>;

    if (!received?.length)
      return (
        <View style={styles.emptyState}>
          <Icon name="inbox" size={40} color={colors.primary + '40'} />
          <Text style={styles.emptyTitle}>Нет входящих запросов</Text>
          <Text style={styles.emptySubtitle}>
            Когда кто-то захочет добавить вас в друзья, запрос появится здесь
          </Text>
        </View>
      );

    return received.map((req) => (
      <View key={req.friendshipId} style={styles.requestCard}>
        <View style={styles.avatarWrapper}>
          {req.avatarUrl ? (
            <Image source={{ uri: req.avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>{req.nickName[0].toUpperCase()}</Text>
            </View>
          )}
        </View>

        <View style={styles.requestInfo}>
          <Text style={styles.requestName}>{req.nickName}</Text>
          <Text style={styles.requestUsername}>@{req.username}</Text>
        </View>

        <View style={styles.requestActions}>
          <TouchableOpacity
            style={styles.acceptBtn}
            onPress={() =>
              respond({ friendshipId: req.friendshipId, action: 'ACCEPTED', targetId: req.id })
            }
            disabled={isResponding}
            activeOpacity={0.8}
          >
            {isResponding
              ? <ActivityIndicator size="small" color={colors.text} />
              : <Icon name="check" size={16} color={colors.text} />}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.declineBtn}
            onPress={() =>
              respond({ friendshipId: req.friendshipId, action: 'DECLINED', targetId: req.id })
            }
            disabled={isResponding}
            activeOpacity={0.8}
          >
            <Icon name="x" size={16} color={colors.primary} />
          </TouchableOpacity>
        </View>
      </View>
    ));
  };

  const renderSent = () => {
    if (loadingSent)
      return <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>;

    if (!sent?.length)
      return (
        <View style={styles.emptyState}>
          <Icon name="send" size={40} color={colors.primary + '40'} />
          <Text style={styles.emptyTitle}>Нет исходящих запросов</Text>
          <Text style={styles.emptySubtitle}>
            Найдите пользователей через поиск и отправьте им запрос в друзья
          </Text>
        </View>
      );

    return sent.map((req) => (
      <View key={req.friendshipId} style={styles.requestCard}>
        <View style={styles.avatarWrapper}>
          {req.avatarUrl ? (
            <Image source={{ uri: req.avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>{req.nickName[0].toUpperCase()}</Text>
            </View>
          )}
        </View>

        <View style={styles.requestInfo}>
          <Text style={styles.requestName}>{req.nickName}</Text>
          <Text style={styles.requestUsername}>@{req.username}</Text>
          <Text style={styles.sentLabel}>Ожидает ответа</Text>
        </View>

        <TouchableOpacity
          style={styles.cancelBtn}
          onPress={() => cancel({ requestId: req.friendshipId, targetId: req.id })}
          disabled={isCanceling}
          activeOpacity={0.8}
        >
          {isCanceling
            ? <ActivityIndicator size="small" color={colors.primary} />
            : <Icon name="x" size={16} color={colors.primary} />}
        </TouchableOpacity>
      </View>
    ));
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Icon name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Запросы в друзья</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, tab === 'received' && styles.tabActive]}
          onPress={() => setTab('received')}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabText, tab === 'received' && styles.tabTextActive]}>
            Входящие
            {received && received.length > 0 && (
              <Text style={styles.tabBadge}> {received.length}</Text>
            )}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'sent' && styles.tabActive]}
          onPress={() => setTab('sent')}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabText, tab === 'sent' && styles.tabTextActive]}>
            Исходящие
            {sent && sent.length > 0 && (
              <Text style={styles.tabBadge}> {sent.length}</Text>
            )}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {tab === 'received' ? renderReceived() : renderSent()}
        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 56 : 36, paddingBottom: 16, paddingHorizontal: 20,
    borderBottomWidth: 1, borderBottomColor: colors.primary + '15',
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: colors.secondary + '40',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  tabs: { flexDirection: 'row', paddingHorizontal: 20, paddingTop: 16, gap: 8 },
  tab: {
    flex: 1, paddingVertical: 10, alignItems: 'center',
    borderRadius: 12, backgroundColor: colors.secondary + '20',
    borderWidth: 1, borderColor: colors.primary + '15',
  },
  tabActive: { backgroundColor: colors.accent + '25', borderColor: colors.accent + '50' },
  tabText: { fontSize: 14, fontWeight: '600', color: colors.primary },
  tabTextActive: { color: colors.accent },
  tabBadge: { color: colors.accent, fontWeight: '700' },
  scrollContent: { padding: 20 },
  center: { paddingTop: 60, alignItems: 'center' },
  emptyState: { alignItems: 'center', paddingTop: 40, paddingHorizontal: 20, gap: 12 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  emptySubtitle: {
    fontSize: 14, color: colors.primary + '70',
    textAlign: 'center', lineHeight: 20,
  },
  requestCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.secondary + '18', borderRadius: 16,
    borderWidth: 1, borderColor: colors.primary + '15',
    paddingHorizontal: 16, paddingVertical: 12,
    marginBottom: 10, gap: 12,
  },
  avatarWrapper: {},
  avatar: {
    width: 48, height: 48, borderRadius: 24,
    borderWidth: 2, borderColor: colors.accent + '40',
  },
  avatarPlaceholder: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: colors.secondary + '60',
    borderWidth: 2, borderColor: colors.accent + '30',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 18, fontWeight: '700', color: colors.text },
  requestInfo: { flex: 1, gap: 2 },
  requestName: { fontSize: 15, fontWeight: '700', color: colors.text },
  requestUsername: { fontSize: 13, color: colors.accent, fontWeight: '500' },
  sentLabel: { fontSize: 12, color: colors.primary + '60', marginTop: 2 },
  requestActions: { flexDirection: 'row', gap: 8 },
  acceptBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  declineBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: colors.secondary + '40',
    borderWidth: 1.5, borderColor: colors.primary + '30',
    alignItems: 'center', justifyContent: 'center',
  },
  cancelBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: colors.secondary + '40',
    borderWidth: 1.5, borderColor: colors.primary + '25',
    alignItems: 'center', justifyContent: 'center',
  },
});

export default FriendRequestsScreen;