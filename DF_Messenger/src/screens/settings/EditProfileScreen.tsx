import React, { useState, useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Feather';
import { colors } from '../../styles/colors';
import { useMe, useUpdateProfile } from '../../hooks/user.hook';

const DESCRIPTION_LIMIT = 80;

const EditProfileScreen = () => {
  const navigation = useNavigation();
  const { data: user } = useMe();
  const { mutateAsync: updateProfile, isPending: isSaving } = useUpdateProfile();

  const [nickName,    setNickName]    = useState('');
  const [username,    setUsername]    = useState('');
  const [description, setDescription] = useState('');
  const [errors,      setErrors]      = useState<Record<string, string>>({});

  const initializedRef = useRef(false);

  useEffect(() => {
    if (user && !initializedRef.current) {
      setNickName(user.nickName);
      setUsername(user.username);
      setDescription(user.description ?? '');
      initializedRef.current = true;
    }
  }, [user]);

  const handleSave = async () => {
    const newErrors: Record<string, string> = {};

    if (nickName.trim().length === 0) newErrors.nickName = 'Имя не может быть пустым';
    if (username.trim().length === 0) newErrors.username = 'Никнейм не может быть пустым';
    if (!/^[a-zA-Z0-9_]+$/.test(username)) newErrors.username = 'Только буквы, цифры и _';
    if (description.length > DESCRIPTION_LIMIT) newErrors.description = `Максимум ${DESCRIPTION_LIMIT} символов`;

    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }

    try {
      setErrors({});
      await updateProfile({
        nickName:    nickName.trim(),
        username:    username.trim(),
        description: description.trim(),
      });
      navigation.goBack();
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      if (typeof msg === 'string' && msg.toLowerCase().includes('username')) {
        setErrors({ username: 'Этот никнейм уже занят' });
      } else {
        setErrors({ api: msg || 'Ошибка при сохранении' });
      }
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Icon name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Редактировать профиль</Text>
        <TouchableOpacity
          style={[styles.saveBtn, isSaving && { opacity: 0.5 }]}
          onPress={handleSave}
          disabled={isSaving}
        >
          {isSaving
            ? <ActivityIndicator size="small" color={colors.accent} />
            : <Text style={styles.saveBtnText}>Готово</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* Hint */}
        <View style={styles.hintRow}>
          <Icon name="info" size={14} color={colors.accent + '80'} />
          <Text style={styles.hintText}>Аватар и баннер можно сменить на главном экране профиля</Text>
        </View>

        {/* Fields */}
        <View style={styles.fieldsCard}>
          {/* NickName */}
          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>Отображаемое имя</Text>
            <View style={[styles.inputContainer, errors.nickName && styles.inputError]}>
              <Icon name="user" size={18} color={colors.primary} style={styles.inputIcon} />
              <TextInput
                value={nickName}
                onChangeText={t => { setNickName(t); setErrors({ ...errors, nickName: '' }); }}
                style={styles.input}
                placeholder="Ваше имя"
                placeholderTextColor={colors.primary + '60'}
                autoCorrect={false}
              />
            </View>
            {errors.nickName && <Text style={styles.errorText}>{errors.nickName}</Text>}
          </View>

          <View style={styles.fieldSeparator} />

          {/* Username */}
          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>Никнейм</Text>
            <View style={[styles.inputContainer, errors.username && styles.inputError]}>
              <Text style={styles.atSign}>@</Text>
              <TextInput
                value={username}
                onChangeText={t => { setUsername(t.toLowerCase()); setErrors({ ...errors, username: '' }); }}
                style={styles.input}
                placeholder="username"
                placeholderTextColor={colors.primary + '60'}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            {errors.username
              ? <Text style={styles.errorText}>{errors.username}</Text>
              : <Text style={styles.fieldHint}>Через @ вас смогут найти другие пользователи</Text>}
          </View>

          <View style={styles.fieldSeparator} />

          {/* Description */}
          <View style={styles.fieldBlock}>
            <View style={styles.fieldLabelRow}>
              <Text style={styles.fieldLabel}>О себе</Text>
              <Text style={[styles.charCount, description.length > DESCRIPTION_LIMIT && styles.charCountOver]}>
                {description.length}/{DESCRIPTION_LIMIT}
              </Text>
            </View>
            <View style={[styles.inputContainer, styles.textAreaContainer, errors.description && styles.inputError]}>
              <TextInput
                value={description}
                onChangeText={t => { setDescription(t); setErrors({ ...errors, description: '' }); }}
                style={[styles.input, styles.textArea]}
                placeholder="Расскажите о себе..."
                placeholderTextColor={colors.primary + '60'}
                multiline
                maxLength={DESCRIPTION_LIMIT + 10}
                autoCorrect={false}
              />
            </View>
            {errors.description && <Text style={styles.errorText}>{errors.description}</Text>}
          </View>
        </View>

        {errors.api && (
          <View style={styles.apiError}>
            <Icon name="alert-circle" size={16} color="#ff6b6b" />
            <Text style={styles.apiErrorText}>{errors.api}</Text>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 56 : 36,
    paddingBottom: 16, paddingHorizontal: 20,
    borderBottomWidth: 1, borderBottomColor: colors.primary + '15',
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: colors.secondary + '40',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  saveBtn: {
    paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: colors.accent + '25', borderRadius: 12,
    borderWidth: 1, borderColor: colors.accent + '50',
    minWidth: 80, alignItems: 'center',
  },
  saveBtnText: { color: colors.accent, fontWeight: '700', fontSize: 15 },
  scrollContent: { padding: 20 },

  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.accent + '12',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.accent + '30',
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 20,
  },
  hintText: { fontSize: 13, color: colors.accent + 'CC', flex: 1, lineHeight: 18 },

  fieldsCard: {
    backgroundColor: colors.secondary + '25', borderRadius: 20,
    borderWidth: 1, borderColor: colors.primary + '15',
    paddingHorizontal: 16, paddingVertical: 8, marginBottom: 16,
  },
  fieldBlock: { paddingVertical: 12 },
  fieldSeparator: { height: 1, backgroundColor: colors.primary + '12' },
  fieldLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  fieldLabel: {
    fontSize: 12, fontWeight: '700', color: colors.primary + '80',
    letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8,
  },
  fieldHint: { fontSize: 12, color: colors.primary + '50', marginTop: 6, marginLeft: 2 },
  charCount: { fontSize: 12, color: colors.primary + '60', fontWeight: '600' },
  charCountOver: { color: '#ff6b6b' },
  inputContainer: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.secondary + '30',
    borderWidth: 1.5, borderColor: colors.primary + '30',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 2,
  },
  textAreaContainer: { alignItems: 'flex-start', paddingVertical: 10 },
  inputError: { borderColor: '#ff6b6b' },
  inputIcon: { marginRight: 10 },
  atSign: { color: colors.accent, fontSize: 16, fontWeight: '700', marginRight: 6 },
  input: { flex: 1, color: colors.text, fontSize: 15, paddingVertical: 12, fontWeight: '500' },
  textArea: { minHeight: 72, textAlignVertical: 'top', paddingVertical: 0 },
  errorText: { color: '#ff6b6b', fontSize: 12, marginTop: 5, marginLeft: 2, fontWeight: '500' },
  apiError: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#ff6b6b15', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#ff6b6b30',
  },
  apiErrorText: { color: '#ff6b6b', fontSize: 14, fontWeight: '600', flex: 1 },
});

export default EditProfileScreen;