// SearchScreen.tsx — changes from previous version:
// 1. Removed UserProfileModal entirely
// 2. UserCard onPress → navigate directly to UserProfileScreen
// 3. FriendCard onPress → navigate directly to UserProfileScreen

// ── Key diff (replace existing handlers in SearchScreen) ─────────────────────

// REMOVE these state vars:
//   const [selectedUser, setSelectedUser] = useState<SearchUser | null>(null);
//   const [modalVisible, setModalVisible] = useState(false);

// REPLACE handleUserPress:
//   const handleUserPress = (user: SearchUser) => {
//     navigation.navigate('UserProfileScreen', { user });
//   };

// REPLACE handleFriendPress:
//   const handleFriendPress = (friend: Friend) => {
//     const asUser: SearchUser = {
//       id: friend.id,
//       nickName: friend.nickName,
//       username: friend.username,
//       description: friend.description,
//       avatarUrl: friend.avatarUrl,
//     };
//     navigation.navigate('UserProfileScreen', { user: asUser });
//   };

// REMOVE <UserProfileModal> render at the bottom of return()

// ── Full updated file ─────────────────────────────────────────────────────────

import React, { useState, useRef, useEffect } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Dimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQueryClient } from '@tanstack/react-query';
import Icon from 'react-native-vector-icons/Feather';
import { colors } from '../../styles/colors';
import { SearchUser, Friend } from '../../api/friends.types';
import UserCard from '../../components/UserCard';
import {
  useSearchUsers,
  useFriends,
  useRemoveFriend,
  useRequestsCount,
  friendsQueryKeys,
} from '../../hooks/friends.hook';
import { useUserOnlineStatus } from '../../hooks/presence.hook';
import { SearchStackParamList } from '../../navigation/types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
type Tab = 'friends' | 'search';
type NavProp = NativeStackNavigationProp<SearchStackParamList>;

const ONLINE_COLOR = '#7ec8a0';

// ─── Friend card ──────────────────────────────────────────────────────────────

interface FriendCardProps {
  friend: Friend;
  onRemove: (id: number, name: string) => void;
  onPress: (friend: Friend) => void;
  isRemoving: boolean;
}

const FriendCard: React.FC<FriendCardProps> = ({ friend, onRemove, onPress, isRemoving }) => {
  const { isOnline } = useUserOnlineStatus(friend.id);
  const initials = friend.nickName
    .split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <TouchableOpacity
      style={styles.friendCard}
      onPress={() => onPress(friend)}
      activeOpacity={0.75}
    >
      <View style={styles.friendAvatarWrapper}>
        {friend.avatarUrl ? (
          <Image source={{ uri: friend.avatarUrl }} style={styles.friendAvatar} />
        ) : (
          <View style={styles.friendAvatarPlaceholder}>
            <Text style={styles.friendAvatarInitials}>{initials}</Text>
          </View>
        )}
        {isOnline && <View style={styles.onlineDot} />}
      </View>

      <View style={styles.friendInfo}>
        <View style={styles.friendNameRow}>
          <Text style={styles.friendName} numberOfLines={1}>{friend.nickName}</Text>
          {isOnline && (
            <View style={styles.onlinePill}>
              <Text style={styles.onlinePillText}>онлайн</Text>
            </View>
          )}
        </View>
        <Text style={styles.friendUsername} numberOfLines={1}>@{friend.username}</Text>
        {friend.description
          ? <Text style={styles.friendDesc} numberOfLines={1}>{friend.description}</Text>
          : null}
      </View>

      <TouchableOpacity
        style={styles.removeBtn}
        onPress={(e) => { e.stopPropagation(); onRemove(friend.id, friend.nickName); }}
        disabled={isRemoving}
        activeOpacity={0.7}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Icon name="user-minus" size={16} color={colors.primary + '70'} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
};

// ─── SearchScreen ─────────────────────────────────────────────────────────────

const SearchScreen = () => {
  const navigation = useNavigation<NavProp>();
  const queryClient = useQueryClient();

  const [tab, setTab]                       = useState<Tab>('friends');
  const [query, setQuery]                   = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [refreshing, setRefreshing]         = useState(false);

  const headerFadeAnim   = useRef(new Animated.Value(0)).current;
  const searchBarFocused = useRef(new Animated.Value(0)).current;
  const slideAnim        = useRef(new Animated.Value(0)).current;
  const searchBarHeight  = useRef(new Animated.Value(0)).current;

  const { data: requestsCountData }                              = useRequestsCount();
  const { data: searchResults, isLoading: isSearching }         = useSearchUsers(debouncedQuery);
  const { data: friends, isLoading: loadingFriends }            = useFriends();
  const { mutate: removeFriend, isPending: isRemoving }         = useRemoveFriend();

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 400);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    Animated.timing(headerFadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: friendsQueryKeys.list }),
      queryClient.invalidateQueries({ queryKey: friendsQueryKeys.requestsCount }),
    ]);
    setRefreshing(false);
  };

  const switchTab = (newTab: Tab) => {
    if (newTab === tab) return;
    setTab(newTab);
    Animated.spring(slideAnim, { toValue: newTab === 'search' ? 1 : 0, friction: 20, tension: 100, useNativeDriver: true }).start();
    Animated.spring(searchBarHeight, { toValue: newTab === 'search' ? 1 : 0, friction: 15, tension: 80, useNativeDriver: true }).start();
  };

  // ── Navigate to profile (no modal) ────────────────────────────────────────
  const handleUserPress = (user: SearchUser) => {
    navigation.navigate('UserProfileScreen', { user });
  };

  const handleFriendPress = (friend: Friend) => {
    const asUser: SearchUser = {
      id: friend.id,
      nickName: friend.nickName,
      username: friend.username,
      description: friend.description,
      avatarUrl: friend.avatarUrl,
      bannerUrl: friend.bannerUrl,
    };
    navigation.navigate('UserProfileScreen', { user: asUser });
  };

  const handleRemoveFriend = (friendId: number, name: string) => {
    Alert.alert('Удалить из друзей', `Удалить ${name} из списка друзей?`, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => removeFriend(friendId) },
    ]);
  };

  const handleSearchFocus = () =>
    Animated.spring(searchBarFocused, { toValue: 1, friction: 8, tension: 60, useNativeDriver: false }).start();
  const handleSearchBlur = () =>
    Animated.spring(searchBarFocused, { toValue: 0, friction: 8, tension: 60, useNativeDriver: false }).start();

  const searchBorderColor = searchBarFocused.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.primary + '30', colors.accent + '80'],
  });

  const badgeCount      = requestsCountData?.count ?? 0;
  const friendsSlideX   = slideAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -SCREEN_WIDTH] });
  const searchSlideX    = slideAnim.interpolate({ inputRange: [0, 1], outputRange: [SCREEN_WIDTH, 0] });
  const searchBarScaleY = searchBarHeight.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const searchBarOpacity = searchBarHeight.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0, 1] });

  const renderFriendsContent = () => {
    if (loadingFriends)
      return <View style={styles.center}><ActivityIndicator color={colors.accent} size="large" /></View>;

    if (!friends?.length)
      return (
        <View style={styles.emptyHint}>
          <View style={styles.emptyIconWrapper}>
            <Icon name="users" size={32} color={colors.accent + '60'} />
          </View>
          <Text style={styles.emptyHintTitle}>Список друзей пуст</Text>
          <Text style={styles.emptyHintText}>Найдите пользователей через поиск и добавьте их в друзья</Text>
        </View>
      );

    return friends.map((friend) => (
      <FriendCard
        key={friend.id}
        friend={friend}
        onRemove={handleRemoveFriend}
        onPress={handleFriendPress}
        isRemoving={isRemoving}
      />
    ));
  };

  const renderSearchContent = () => {
    if (!debouncedQuery.trim())
      return (
        <View style={styles.emptyHint}>
          <View style={styles.emptyIconWrapper}>
            <Icon name="search" size={32} color={colors.accent + '60'} />
          </View>
          <Text style={styles.emptyHintTitle}>Найдите пользователей</Text>
          <Text style={styles.emptyHintText}>Введите имя или @никнейм для поиска</Text>
        </View>
      );

    if (isSearching)
      return <View style={styles.center}><ActivityIndicator color={colors.accent} size="large" /></View>;

    if (!searchResults?.length)
      return (
        <View style={styles.emptyHint}>
          <View style={styles.emptyIconWrapper}>
            <Icon name="user-x" size={32} color={colors.primary + '50'} />
          </View>
          <Text style={styles.emptyHintTitle}>Никого не найдено</Text>
          <Text style={styles.emptyHintText}>Попробуйте другое имя или @никнейм</Text>
        </View>
      );

    return searchResults.map((user) => (
      <UserCard key={user.id} user={user} onPress={handleUserPress} />
    ));
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <Animated.View style={[styles.header, { opacity: headerFadeAnim }]}>
        <View style={styles.headerTop}>
          <Text style={styles.headerTitle}>{tab === 'friends' ? 'Друзья' : 'Поиск'}</Text>
          <TouchableOpacity
            style={styles.requestsBtn}
            onPress={() => navigation.navigate('FriendRequestsScreen')}
            activeOpacity={0.8}
          >
            <Icon name="user-plus" size={18} color={colors.text} />
            {badgeCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{badgeCount > 99 ? '99+' : badgeCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.tabSwitcher}>
          <TouchableOpacity
            style={[styles.tabBtn, tab === 'friends' && styles.tabBtnActive]}
            onPress={() => switchTab('friends')}
            activeOpacity={0.7}
          >
            <Icon name="users" size={15} color={tab === 'friends' ? colors.text : colors.primary + '80'} />
            <Text style={[styles.tabBtnText, tab === 'friends' && styles.tabBtnTextActive]}>
              Друзья{friends && friends.length > 0 ? ` ${friends.length}` : ''}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, tab === 'search' && styles.tabBtnActive]}
            onPress={() => switchTab('search')}
            activeOpacity={0.7}
          >
            <Icon name="search" size={15} color={tab === 'search' ? colors.text : colors.primary + '80'} />
            <Text style={[styles.tabBtnText, tab === 'search' && styles.tabBtnTextActive]}>Поиск</Text>
          </TouchableOpacity>
        </View>

        <Animated.View style={{ transform: [{ scaleY: searchBarScaleY }], opacity: searchBarOpacity, overflow: 'hidden' }}>
          <Animated.View style={[styles.searchBar, { borderColor: searchBorderColor }]}>
            <Icon name="search" size={18} color={colors.primary} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              onFocus={handleSearchFocus}
              onBlur={handleSearchBlur}
              style={styles.searchInput}
              placeholder="Имя или @никнейм..."
              placeholderTextColor={colors.primary + '60'}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => setQuery('')} activeOpacity={0.7}>
                <Icon name="x" size={16} color={colors.primary + '80'} />
              </TouchableOpacity>
            )}
          </Animated.View>
        </Animated.View>
      </Animated.View>

      {/* Sliding panels */}
      <View style={styles.contentContainer}>
        <Animated.View style={[styles.panel, { transform: [{ translateX: friendsSlideX }] }]}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent} colors={[colors.accent]} />
            }
          >
            {renderFriendsContent()}
            <View style={{ height: 100 }} />
          </ScrollView>
        </Animated.View>

        <Animated.View style={[styles.panel, { transform: [{ translateX: searchSlideX }] }]}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent} colors={[colors.accent]} />
            }
          >
            {renderSearchContent()}
            <View style={{ height: 100 }} />
          </ScrollView>
        </Animated.View>
      </View>
      {/* No UserProfileModal here anymore */}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingHorizontal: 20, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: colors.primary + '12',
  },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  headerTitle: { fontSize: 28, fontWeight: '700', color: colors.text, letterSpacing: -0.5 },
  requestsBtn: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: colors.secondary + '40', borderWidth: 1, borderColor: colors.primary + '20',
    alignItems: 'center', justifyContent: 'center', position: 'relative',
  },
  badge: {
    position: 'absolute', top: -4, right: -4,
    minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 4, borderWidth: 1.5, borderColor: colors.background,
  },
  badgeText: { fontSize: 10, fontWeight: '700', color: colors.text },
  tabSwitcher: {
    flexDirection: 'row', backgroundColor: colors.secondary + '25',
    borderRadius: 14, padding: 3, marginBottom: 14,
  },
  tabBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 11,
  },
  tabBtnActive: {
    backgroundColor: colors.accent,
    shadowColor: colors.accent, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25, shadowRadius: 6, elevation: 4,
  },
  tabBtnText: { fontSize: 14, fontWeight: '600', color: colors.primary + '80' },
  tabBtnTextActive: { color: colors.text },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.secondary + '30', borderWidth: 1.5,
    borderRadius: 14, paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 13 : 2, marginBottom: 2,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '500', paddingVertical: Platform.OS === 'android' ? 10 : 0 },
  contentContainer: { flex: 1, overflow: 'hidden' },
  panel: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: SCREEN_WIDTH },
  scrollContent: { padding: 20, paddingTop: 16 },
  emptyHint: { alignItems: 'center', paddingTop: 48, paddingHorizontal: 24, gap: 12 },
  emptyIconWrapper: {
    width: 72, height: 72, borderRadius: 24,
    backgroundColor: colors.secondary + '30', borderWidth: 1, borderColor: colors.primary + '20',
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  emptyHintTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  emptyHintText: { fontSize: 14, color: colors.primary + '70', textAlign: 'center', lineHeight: 20 },
  center: { alignItems: 'center', paddingTop: 60 },
  friendCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.secondary + '18', borderRadius: 18,
    borderWidth: 1, borderColor: colors.primary + '15',
    paddingHorizontal: 16, paddingVertical: 14, marginBottom: 10, gap: 14,
  },
  friendAvatarWrapper: { position: 'relative' },
  friendAvatar: { width: 52, height: 52, borderRadius: 26, borderWidth: 2, borderColor: colors.accent + '50' },
  friendAvatarPlaceholder: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: colors.secondary + '60', borderWidth: 2, borderColor: colors.accent + '30',
    alignItems: 'center', justifyContent: 'center',
  },
  friendAvatarInitials: { fontSize: 18, fontWeight: '700', color: colors.text },
  onlineDot: {
    position: 'absolute', bottom: 1, right: 1,
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: ONLINE_COLOR, borderWidth: 2, borderColor: colors.background,
  },
  friendInfo: { flex: 1, gap: 2 },
  friendNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  friendName: { fontSize: 15, fontWeight: '700', color: colors.text, flexShrink: 1 },
  onlinePill: {
    backgroundColor: ONLINE_COLOR + '20', borderRadius: 5,
    borderWidth: 1, borderColor: ONLINE_COLOR + '50',
    paddingHorizontal: 6, paddingVertical: 2,
  },
  onlinePillText: { fontSize: 10, fontWeight: '700', color: ONLINE_COLOR },
  friendUsername: { fontSize: 13, color: colors.accent, fontWeight: '500' },
  friendDesc: { fontSize: 12, color: colors.primary + '70', marginTop: 2 },
  removeBtn: {
    width: 38, height: 38, borderRadius: 11,
    backgroundColor: colors.secondary + '30', borderWidth: 1, borderColor: colors.primary + '20',
    alignItems: 'center', justifyContent: 'center',
  },
});

export default SearchScreen;