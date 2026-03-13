import React, { useRef, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/Feather';
import ImageCropPicker from 'react-native-image-crop-picker';
import FastImage from 'react-native-fast-image';
import { colors } from '../../styles/colors';
import { useMe, useLogout, useUploadAvatar, useUploadBanner } from '../../hooks/user.hook';
import { SettingsStackParamList } from '../../navigation/types';
import EditProfileScreen from '../settings/EditProfileScreen';
import ChangeEmailScreen from '../settings/ChangeEmailScreen';
import ChangePasswordScreen from '../settings/ChangePasswordScreen';
import BlockedUsersScreen from '../friends/BlockedUsersScreen';

const BANNER_HEIGHT = 160;

const Stack = createNativeStackNavigator<SettingsStackParamList>();

const ProfileHome = () => {
  const { data: user, isLoading } = useMe();
  const { mutate: logout, isPending: isLoggingOut } = useLogout();
  const { mutateAsync: uploadAvatar, isPending: isUploadingAvatar } = useUploadAvatar();
  const { mutateAsync: uploadBanner, isPending: isUploadingBanner } = useUploadBanner();

  const [isPickingBanner, setIsPickingBanner] = useState(false);
  const [isPickingAvatar, setIsPickingAvatar] = useState(false);

  const bannerUri = user?.bannerUrl
    ? `${user.bannerUrl}?t=${new Date(user.updatedAt).getTime()}`
    : null;
  const avatarUri = user?.avatarUrl
    ? `${user.avatarUrl}?t=${new Date(user.updatedAt).getTime()}`
    : null;

  const navigation = useNavigation<NativeStackNavigationProp<SettingsStackParamList>>();

  const fadeIn      = useRef(new Animated.Value(0)).current;
  const slideUp     = useRef(new Animated.Value(30)).current;
  const avatarScale = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeIn, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(slideUp, { toValue: 0, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.spring(avatarScale, { toValue: 1, friction: 7, tension: 40, useNativeDriver: true }),
    ]).start();
  }, []);

  const handlePickAvatar = async () => {
    if (isPickingAvatar || isUploadingAvatar) return;
    setIsPickingAvatar(true);
    try {
      const picked = await ImageCropPicker.openPicker({
        mediaType: 'photo',
        cropping: true,
        width: 512,
        height: 512,
        cropperCircleOverlay: true,
        cropperToolbarTitle: 'Аватарка',
        cropperActiveWidgetColor: colors.accent,
        cropperStatusBarLight: false,
        cropperToolbarColor: colors.background,
        cropperToolbarWidgetColor: colors.text,
        forceJpg: true,
        includeBase64: false,
      });
      const name = picked.path.split('/').pop() ?? 'avatar.jpg';
      const type = picked.mime ?? 'image/jpeg';
      await uploadAvatar({ uri: picked.path, type, name });
    } catch (err: any) {
      if (err?.code === 'E_PICKER_CANCELLED') return;
      Alert.alert('Ошибка', err?.response?.data?.message || 'Не удалось загрузить аватарку');
    } finally {
      setIsPickingAvatar(false);
    }
  };

  const handlePickBanner = async () => {
    if (isPickingBanner || isUploadingBanner) return;
    setIsPickingBanner(true);
    try {
      // Шаг 1: выбираем файл БЕЗ кропа — только чтобы определить GIF или нет
      const preview = await ImageCropPicker.openPicker({
        mediaType: 'photo',
        cropping: false,
        includeBase64: false,
      });

      const isGif =
        preview.mime === 'image/gif' ||
        (preview.path ?? '').toLowerCase().endsWith('.gif');

      if (isGif) {
        // GIF — отправляем оригинал, кроп не нужен
        const name = preview.path.split('/').pop() ?? 'banner.gif';
        console.log('BANNER UPLOAD PAYLOAD:', JSON.stringify({
          uri: preview.path,
          type: 'image/gif',
          name: preview.path.split('/').pop(),
          size: preview.size,
          mime: preview.mime,
        }));
        await uploadBanner({
          file: { uri: preview.path, type: 'image/gif', name },
        });
        return;
      }

      // Шаг 2: обычное фото — открываем тот же файл в кроппере через openCropper.
      // openCropper работает нормально когда вызывается ПОСЛЕ openPicker (не сам по себе).
      const cropped = await ImageCropPicker.openCropper({
        path: preview.path,
        width: 800,
        height: 300,
        cropperToolbarTitle: 'Баннер профиля',
        cropperActiveWidgetColor: colors.accent,
        cropperStatusBarLight: false,
        cropperToolbarColor: colors.background,
        cropperToolbarWidgetColor: colors.text,
        forceJpg: false,
        mediaType: 'photo',
      });

      const name = cropped.path.split('/').pop() ?? 'banner.jpg';
      const type = cropped.mime ?? 'image/jpeg';
      const crop = cropped.cropRect
        ? {
            x: cropped.cropRect.x,
            y: cropped.cropRect.y,
            width: cropped.cropRect.width,
            height: cropped.cropRect.height,
          }
        : undefined;

      await uploadBanner({ file: { uri: cropped.path, type, name }, crop });
    } catch (err: any) {
      if (err?.code === 'E_PICKER_CANCELLED') return;
      console.log('BANNER ERROR FULL:', JSON.stringify({
        message: err?.message,
        code: err?.code,
        status: err?.response?.status,
        data: err?.response?.data,
        config_url: err?.config?.url,
        config_baseURL: err?.config?.baseURL,
      }));
      Alert.alert('Ошибка', err?.response?.data?.message || 'Не удалось загрузить баннер');
    } finally {
      setIsPickingBanner(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  const initials = user
    ? user.nickName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
    : '?';

  const joinedDate = user
    ? new Date(user.createdAt).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })
    : '';

  const bannerBusy = isPickingBanner || isUploadingBanner;
  const avatarBusy = isPickingAvatar || isUploadingAvatar;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.heroCard}>
        <TouchableOpacity
          style={styles.bannerWrapper}
          onPress={handlePickBanner}
          activeOpacity={0.85}
          disabled={bannerBusy}
        >
          {bannerUri
            ? <FastImage
                source={{
                  uri: bannerUri,
                  priority: FastImage.priority.normal,
                  cache: FastImage.cacheControl.web,
                }}
                style={styles.banner}
                resizeMode={FastImage.resizeMode.cover}
              />
            : <View style={styles.bannerPlaceholder}>
                <View style={styles.bannerPlaceholderIcon}>
                  <Icon name="image" size={22} color={colors.primary + '50'} />
                </View>
                <Text style={styles.bannerPlaceholderText}>Добавить баннер</Text>
              </View>
          }
          <View style={[styles.bannerEditOverlay, bannerBusy && { opacity: 0.6 }]}>
            {bannerBusy
              ? <ActivityIndicator size="small" color="#fff" />
              : <><Icon name="camera" size={14} color="#fff" /><Text style={styles.bannerEditText}>Изменить</Text></>}
          </View>
        </TouchableOpacity>

        <Animated.View style={{ opacity: fadeIn }}>
          <View style={styles.avatarRow}>
            <TouchableOpacity
              style={styles.avatarTouchable}
              onPress={handlePickAvatar}
              activeOpacity={0.85}
              disabled={avatarBusy}
            >
              <Animated.View style={{ transform: [{ scale: avatarScale }] }}>
                {avatarUri ? (
                  <Image source={{ uri: avatarUri }} style={styles.avatar} resizeMode="cover" />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <Text style={styles.avatarInitials}>{initials}</Text>
                  </View>
                )}
              </Animated.View>
              <View style={styles.avatarEditBadge}>
                {avatarBusy
                  ? <ActivityIndicator size="small" color={colors.text} />
                  : <Icon name="camera" size={13} color={colors.text} />}
              </View>
            </TouchableOpacity>
          </View>

          <Animated.View style={[styles.nameBlock, { opacity: fadeIn, transform: [{ translateY: slideUp }] }]}>
            <Text style={styles.nickName}>{user?.nickName}</Text>
            <Text style={styles.username}>@{user?.username}</Text>
            {user?.description
              ? <Text style={styles.description}>{user.description}</Text>
              : <Text style={styles.descriptionEmpty}>Нет описания</Text>}
            <View style={styles.joinedRow}>
              <Icon name="calendar" size={12} color={colors.primary + '70'} />
              <Text style={styles.joinedText}>С нами с {joinedDate}</Text>
            </View>
          </Animated.View>
        </Animated.View>
      </View>

      <Animated.View style={[styles.infoRow, { opacity: fadeIn }]}>
        <View style={styles.infoItem}>
          <Icon name="mail" size={16} color={colors.accent} />
          <Text style={styles.infoText} numberOfLines={1}>{user?.email}</Text>
        </View>
      </Animated.View>

      <Animated.View style={[styles.actionsContainer, { opacity: fadeIn, transform: [{ translateY: slideUp }] }]}>
        <Text style={styles.sectionLabel}>Настройки</Text>

        <TouchableOpacity style={styles.actionRow} onPress={() => navigation.navigate('EditProfileScreen')} activeOpacity={0.7}>
          <View style={[styles.actionIcon, { backgroundColor: colors.accent + '25' }]}>
            <Icon name="edit-2" size={18} color={colors.accent} />
          </View>
          <View style={styles.actionContent}>
            <Text style={styles.actionTitle}>Редактировать профиль</Text>
            <Text style={styles.actionSubtitle}>Имя, никнейм, описание</Text>
          </View>
          <Icon name="chevron-right" size={18} color={colors.primary + '50'} />
        </TouchableOpacity>

        <View style={styles.separator} />

        <TouchableOpacity style={styles.actionRow} onPress={() => navigation.navigate('ChangeEmailScreen')} activeOpacity={0.7}>
          <View style={[styles.actionIcon, { backgroundColor: colors.primary + '20' }]}>
            <Icon name="mail" size={18} color={colors.primary} />
          </View>
          <View style={styles.actionContent}>
            <Text style={styles.actionTitle}>Сменить email</Text>
            <Text style={styles.actionSubtitle}>{user?.email}</Text>
          </View>
          <Icon name="chevron-right" size={18} color={colors.primary + '50'} />
        </TouchableOpacity>

        <View style={styles.separator} />

        <TouchableOpacity style={styles.actionRow} onPress={() => navigation.navigate('ChangePasswordScreen')} activeOpacity={0.7}>
          <View style={[styles.actionIcon, { backgroundColor: colors.secondary + '50' }]}>
            <Icon name="lock" size={18} color={colors.primary} />
          </View>
          <View style={styles.actionContent}>
            <Text style={styles.actionTitle}>Сменить пароль</Text>
            <Text style={styles.actionSubtitle}>Изменить пароль от аккаунта</Text>
          </View>
          <Icon name="chevron-right" size={18} color={colors.primary + '50'} />
        </TouchableOpacity>

        <View style={styles.separator} />

        <TouchableOpacity style={styles.actionRow} onPress={() => navigation.navigate('BlockedUsersScreen')} activeOpacity={0.7}>
          <View style={[styles.actionIcon, { backgroundColor: '#ff6b6b15' }]}>
            <Icon name="slash" size={18} color="#ff6b6b" />
          </View>
          <View style={styles.actionContent}>
            <Text style={styles.actionTitle}>Заблокированные</Text>
            <Text style={styles.actionSubtitle}>Управление блокировками</Text>
          </View>
          <Icon name="chevron-right" size={18} color={colors.primary + '50'} />
        </TouchableOpacity>
      </Animated.View>

      <Animated.View style={{ opacity: fadeIn }}>
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={() => logout()}
          disabled={isLoggingOut}
          activeOpacity={0.8}
        >
          {isLoggingOut
            ? <ActivityIndicator color="#ff6b6b" size="small" />
            : <><Icon name="log-out" size={18} color="#ff6b6b" style={{ marginRight: 10 }} /><Text style={styles.logoutText}>Выйти из аккаунта</Text></>}
        </TouchableOpacity>
      </Animated.View>

      <View style={{ height: 100 }} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: { paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingHorizontal: 20 },
  loadingContainer: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },

  heroCard: {
    backgroundColor: colors.secondary + '25',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.primary + '15',
    overflow: 'hidden',
    marginBottom: 16,
  },
  bannerWrapper: {
    width: '100%',
    height: BANNER_HEIGHT,
    position: 'relative',
    backgroundColor: colors.secondary + '40',
  },
  banner: { width: '100%', height: BANNER_HEIGHT },
  bannerPlaceholder: {
    width: '100%',
    height: BANNER_HEIGHT,
    backgroundColor: colors.secondary + '40',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerEditOverlay: {
    position: 'absolute',
    bottom: 8, right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  bannerEditText: { fontSize: 12, fontWeight: '600', color: '#fff' },
  bannerPlaceholderIcon: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: colors.secondary + '60',
    borderWidth: 1, borderColor: colors.primary + '25',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 8,
  },
  bannerPlaceholderText: { fontSize: 13, fontWeight: '600', color: colors.primary + '60' },

  avatarRow: { paddingHorizontal: 20, marginTop: -40 },
  avatarTouchable: { position: 'relative', alignSelf: 'flex-start' },
  avatar: { width: 84, height: 84, borderRadius: 42, borderWidth: 3, borderColor: colors.background },
  avatarPlaceholder: {
    width: 84, height: 84, borderRadius: 42,
    backgroundColor: colors.secondary + '80',
    borderWidth: 3, borderColor: colors.background,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitials: { fontSize: 28, fontWeight: '700', color: colors.text },
  avatarEditBadge: {
    position: 'absolute', bottom: 2, right: 2,
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: colors.background,
  },

  nameBlock: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 20 },
  nickName: { fontSize: 22, fontWeight: '700', color: colors.text, letterSpacing: -0.3, marginBottom: 3 },
  username: { fontSize: 14, color: colors.accent, fontWeight: '600', marginBottom: 10 },
  description: { fontSize: 14, color: colors.primary, lineHeight: 20, marginBottom: 12 },
  descriptionEmpty: { fontSize: 14, color: colors.primary + '40', fontStyle: 'italic', marginBottom: 12 },
  joinedRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  joinedText: { fontSize: 12, color: colors.primary + '70', fontWeight: '500' },

  infoRow: {
    backgroundColor: colors.secondary + '20', borderRadius: 16,
    borderWidth: 1, borderColor: colors.primary + '15',
    paddingVertical: 14, paddingHorizontal: 18, marginBottom: 16,
  },
  infoItem: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  infoText: { color: colors.text, fontSize: 14, fontWeight: '500', flex: 1 },

  actionsContainer: {
    backgroundColor: colors.secondary + '25', borderRadius: 20,
    borderWidth: 1, borderColor: colors.primary + '15',
    paddingVertical: 8, paddingHorizontal: 4, marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 12, fontWeight: '700', color: colors.primary + '60',
    letterSpacing: 1, textTransform: 'uppercase',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  actionRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12, gap: 14,
  },
  actionIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  actionContent: { flex: 1 },
  actionTitle: { fontSize: 15, fontWeight: '600', color: colors.text, marginBottom: 2 },
  actionSubtitle: { fontSize: 13, color: colors.primary + '70' },
  separator: { height: 1, backgroundColor: colors.primary + '10', marginLeft: 70, marginRight: 16 },

  logoutButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#ff6b6b15', borderWidth: 1.5, borderColor: '#ff6b6b40',
    borderRadius: 16, paddingVertical: 16, marginBottom: 8,
  },
  logoutText: { color: '#ff6b6b', fontSize: 16, fontWeight: '700' },
});

export const ProfileStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="SettingsScreen"       component={ProfileHome} />
    <Stack.Screen name="EditProfileScreen"    component={EditProfileScreen} />
    <Stack.Screen name="ChangeEmailScreen"    component={ChangeEmailScreen} />
    <Stack.Screen name="ChangePasswordScreen" component={ChangePasswordScreen} />
    <Stack.Screen name="BlockedUsersScreen"   component={BlockedUsersScreen} />
  </Stack.Navigator>
);

export default ProfileHome;