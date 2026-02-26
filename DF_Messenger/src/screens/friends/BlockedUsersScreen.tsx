import React from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Feather';
import { colors } from '../../styles/colors';
import { useBlockedList, useUnblockUser } from '../../hooks/friends.hook';
import { SearchUser } from '../../api/friends.types'

const BlockedUsersScreen = () => {
  const navigation = useNavigation();
  const { data: blocked, isLoading } = useBlockedList();
  const { mutate: unblock, isPending: isUnblocking } = useUnblockUser();

  const handleUnblock = (id: number, name: string) => {
    Alert.alert(
      'Разблокировать',
      `Разблокировать пользователя ${name}?`,
      [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Разблокировать', onPress: () => unblock(id) },
      ],
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Icon name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Заблокированные</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : !blocked?.length ? (
          <View style={styles.emptyState}>
            <Icon name="shield" size={40} color={colors.primary + '40'} />
            <Text style={styles.emptyTitle}>Список пуст</Text>
            <Text style={styles.emptySubtitle}>
              Заблокированные пользователи появятся здесь
            </Text>
          </View>
        ) : (
          blocked.map((user) => (
            <View key={user.id} style={styles.card}>
              <View style={styles.avatarWrapper}>
                {user.avatarUrl ? (
                  <Image source={{ uri: user.avatarUrl }} style={styles.avatar} />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <Text style={styles.avatarText}>
                      {user.nickName[0].toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={styles.blockedBadge}>
                  <Icon name="slash" size={8} color="#ff6b6b" />
                </View>
              </View>
              <View style={styles.info}>
                <Text style={styles.nickName}>{user.nickName}</Text>
                <Text style={styles.username}>@{user.username}</Text>
              </View>
              <TouchableOpacity
                style={styles.unblockBtn}
                onPress={() => handleUnblock(user.id, user.nickName)}
                disabled={isUnblocking}
                activeOpacity={0.8}
              >
                <Text style={styles.unblockText}>Разблок.</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 56 : 36,
    paddingBottom: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.primary + '15',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.secondary + '40',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  scrollContent: { padding: 20 },
  center: { paddingTop: 60, alignItems: 'center' },
  emptyState: {
    alignItems: 'center',
    paddingTop: 40,
    paddingHorizontal: 20,
    gap: 12,
  },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  emptySubtitle: {
    fontSize: 14,
    color: colors.primary + '70',
    textAlign: 'center',
    lineHeight: 20,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.secondary + '18',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#ff6b6b20',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 10,
    gap: 12,
  },
  avatarWrapper: { position: 'relative' },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#ff6b6b30',
    opacity: 0.6,
  },
  avatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.secondary + '40',
    borderWidth: 2,
    borderColor: '#ff6b6b30',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.6,
  },
  avatarText: { fontSize: 18, fontWeight: '700', color: colors.text },
  blockedBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#ff6b6b',
    borderWidth: 1.5,
    borderColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { flex: 1, gap: 2 },
  nickName: { fontSize: 15, fontWeight: '700', color: colors.text + 'CC' },
  username: { fontSize: 13, color: colors.primary + '60', fontWeight: '500' },
  unblockBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#ff6b6b15',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ff6b6b30',
  },
  unblockText: { fontSize: 13, fontWeight: '600', color: '#ff6b6b' },
});

export default BlockedUsersScreen;