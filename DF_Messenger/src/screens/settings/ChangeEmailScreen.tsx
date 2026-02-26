import React, { useState, useRef, useEffect } from 'react';
import {
  ActivityIndicator,
  Animated,
  Keyboard,
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
import { useChangeEmail, useConfirmChangeEmail, useMe } from '../../hooks/user.hook';

type Step = 'enter' | 'confirm';

const ChangeEmailScreen = () => {
  const navigation = useNavigation();
  const { data: user } = useMe();
  const { mutateAsync: changeEmail,  isPending: isSending   } = useChangeEmail();
  const { mutateAsync: confirmEmail, isPending: isConfirming } = useConfirmChangeEmail();

  const [step,      setStep]     = useState<Step>('enter');
  const [newEmail,  setNewEmail] = useState('');
  const [code,      setCode]     = useState('');
  const [canResend, setCanResend] = useState(false);
  const [errors,    setErrors]   = useState<Record<string, string>>({});

  const codeInputRef  = useRef<TextInput>(null);
  const cursorOpacity = useRef(new Animated.Value(1)).current;

  // oldEmail comes directly from the cached user — no manual input needed
  const oldEmail = user?.email ?? '';

  // Blinking cursor
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(cursorOpacity, { toValue: 0, duration: 500, useNativeDriver: true }),
        Animated.timing(cursorOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, []);

  const validateEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

  // ── Step 1: request code ─────────────────────────────────────────────────────
  const handleSendCode = async () => {
    if (!validateEmail(newEmail)) {
      setErrors({ email: 'Некорректный email' });
      return;
    }
    if (oldEmail === newEmail) {
      setErrors({ email: 'Новый email совпадает с текущим' });
      return;
    }
    try {
      setErrors({});
      // Send both: oldEmail from useMe + newEmail typed by user
      await changeEmail({ oldEmail, newEmail });
      setCanResend(false);
      setStep('confirm');
      setTimeout(() => codeInputRef.current?.focus(), 300);
    } catch (err: any) {
      setErrors({ api: err?.response?.data?.message || 'Ошибка при отправке' });
    }
  };

  // ── Step 2: confirm ──────────────────────────────────────────────────────────
  const handleConfirm = async (c = code) => {
    if (c.length !== 6) { setErrors({ code: 'Введите 6-значный код' }); return; }
    try {
      setErrors({});
      await confirmEmail({ newEmail, code: c });
      navigation.goBack();
    } catch (err: any) {
      setErrors({ code: err?.response?.data?.message || 'Неверный код' });
      setCode('');
      codeInputRef.current?.focus();
    }
  };

  const handleCodeChange = (val: string) => {
    const clean = val.replace(/[^0-9]/g, '').slice(0, 6);
    setCode(clean);
    setErrors({});
    if (clean.length === 6) {
      Keyboard.dismiss();
      setTimeout(() => handleConfirm(clean), 200);
    }
  };

  const handleResend = async () => {
    if (!canResend) return;
    try {
      setErrors({});
      await changeEmail({ oldEmail, newEmail });
      setCanResend(false);
    } catch (err: any) {
      setErrors({ api: err?.response?.data?.message || 'Ошибка при отправке' });
    }
  };

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Icon name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Сменить email</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">

        {step === 'enter' && (
          <>
            {/* Info card */}
            <View style={styles.infoCard}>
              <Icon name="info" size={16} color={colors.accent} />
              <Text style={styles.infoText}>
                Код подтверждения будет отправлен на новый email
              </Text>
            </View>

            {/* Current email — locked, taken from useMe */}
            <Text style={styles.label}>Текущий email</Text>
            <View style={styles.lockedContainer}>
              <Icon name="mail" size={18} color={colors.primary + '60'} style={styles.inputIcon} />
              <Text style={styles.lockedText} numberOfLines={1}>
                {oldEmail || '...'}
              </Text>
              <Icon name="lock" size={15} color={colors.primary + '40'} />
            </View>

            <View style={{ height: 20 }} />

            {/* New email — editable */}
            <Text style={styles.label}>Новый email</Text>
            <View style={[styles.inputContainer, errors.email && styles.inputError]}>
              <Icon name="mail" size={18} color={colors.primary} style={styles.inputIcon} />
              <TextInput
                value={newEmail}
                onChangeText={t => { setNewEmail(t); setErrors({}); }}
                style={styles.input}
                placeholder="новый@email.com"
                placeholderTextColor={colors.primary + '60'}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
              />
            </View>
            {errors.email && <Text style={styles.errorText}>{errors.email}</Text>}
            {errors.api   && <Text style={styles.errorText}>{errors.api}</Text>}

            <TouchableOpacity
              style={[styles.primaryButton, isSending && { opacity: 0.5 }]}
              onPress={handleSendCode}
              disabled={isSending}
              activeOpacity={0.8}
            >
              {isSending
                ? <ActivityIndicator color={colors.text} />
                : <Text style={styles.primaryButtonText}>Отправить код</Text>}
            </TouchableOpacity>
          </>
        )}

        {step === 'confirm' && (
          <>
            <Text style={styles.confirmTitle}>Введите код</Text>
            <Text style={styles.confirmSubtitle}>
              Код отправлен на{'\n'}
              <Text style={styles.emailHighlight}>{newEmail}</Text>
            </Text>

            {/* Code boxes */}
            <TouchableOpacity
              style={styles.codeContainer}
              onPress={() => codeInputRef.current?.focus()}
              activeOpacity={1}
            >
              {[0,1,2,3,4,5].map(i => {
                const filled = !!code[i];
                const active = i === code.length && code.length < 6;
                return (
                  <View key={i} style={[
                    styles.codeBox,
                    filled && styles.codeBoxFilled,
                    active  && styles.codeBoxActive,
                    errors.code && styles.codeBoxError,
                  ]}>
                    <Text style={styles.codeBoxText}>{code[i] || ''}</Text>
                    {active && (
                      <Animated.View style={[styles.cursor, { opacity: cursorOpacity }]} />
                    )}
                  </View>
                );
              })}
              <TextInput
                ref={codeInputRef}
                value={code}
                onChangeText={handleCodeChange}
                style={styles.hiddenInput}
                keyboardType="number-pad"
                maxLength={6}
                autoFocus
                caretHidden
              />
            </TouchableOpacity>

            {errors.code && <Text style={[styles.errorText, { textAlign: 'center' }]}>{errors.code}</Text>}

            <View style={styles.timerRow}>
              <Icon name="clock" size={14} color={colors.primary} />
              <Text style={styles.timerText}>
                {canResend ? 'Время истекло' : 'Ожидайте перед повторной отправкой'}
              </Text>
            </View>

            {canResend && (
              <TouchableOpacity style={styles.resendButton} onPress={handleResend} activeOpacity={0.7}>
                <Icon name="rotate-cw" size={15} color={colors.accent} />
                <Text style={styles.resendText}>Отправить заново</Text>
              </TouchableOpacity>
            )}

            {errors.api && <Text style={[styles.errorText, { textAlign: 'center', marginTop: 8 }]}>{errors.api}</Text>}

            <TouchableOpacity
              style={[styles.primaryButton, (isConfirming || code.length !== 6) && { opacity: 0.5 }]}
              onPress={() => handleConfirm()}
              disabled={isConfirming || code.length !== 6}
              activeOpacity={0.8}
            >
              {isConfirming
                ? <ActivityIndicator color={colors.text} />
                : <Text style={styles.primaryButtonText}>Подтвердить</Text>}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.backTextBtn}
              onPress={() => { setStep('enter'); setCode(''); setErrors({}); }}
            >
              <Icon name="arrow-left" size={15} color={colors.primary} />
              <Text style={styles.backTextBtnText}>Изменить email</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: colors.background },
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
  headerTitle:  { fontSize: 17, fontWeight: '700', color: colors.text },
  scrollContent: { padding: 24 },

  infoCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.accent + '18', borderWidth: 1,
    borderColor: colors.accent + '40', borderRadius: 12,
    padding: 14, marginBottom: 24,
  },
  infoText: { color: colors.accent, fontSize: 14, fontWeight: '500', flex: 1 },

  label: {
    fontSize: 12, fontWeight: '700', color: colors.primary + '80',
    letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8,
  },

  // Locked (read-only) current email field
  lockedContainer: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.secondary + '18',
    borderWidth: 1.5, borderColor: colors.primary + '18',
    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
  },
  lockedText: {
    flex: 1, color: colors.primary + '80',
    fontSize: 15, fontWeight: '500',
  },

  inputContainer: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.secondary + '30',
    borderWidth: 1.5, borderColor: colors.primary + '30',
    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 2,
    marginBottom: 4,
  },
  inputError:  { borderColor: '#ff6b6b' },
  inputIcon:   { marginRight: 12 },
  input: {
    flex: 1, color: colors.text, fontSize: 15,
    paddingVertical: 14, fontWeight: '500',
  },
  errorText: { color: '#ff6b6b', fontSize: 13, fontWeight: '500', marginBottom: 6 },

  primaryButton: {
    backgroundColor: colors.accent, paddingVertical: 16,
    borderRadius: 14, alignItems: 'center', marginTop: 20,
    shadowColor: colors.accent, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3, shadowRadius: 10, elevation: 8,
  },
  primaryButtonText: { color: colors.text, fontSize: 16, fontWeight: '700' },

  // Confirm step
  confirmTitle: {
    fontSize: 26, fontWeight: '700', color: colors.text,
    textAlign: 'center', marginBottom: 10,
  },
  confirmSubtitle: {
    fontSize: 15, color: colors.primary,
    textAlign: 'center', lineHeight: 22, marginBottom: 32,
  },
  emailHighlight: { color: colors.accent, fontWeight: '600' },

  codeContainer: {
    flexDirection: 'row', justifyContent: 'center',
    gap: 10, marginBottom: 20, position: 'relative',
  },
  codeBox: {
    width: 48, height: 56, borderWidth: 2,
    borderColor: colors.primary + '40', borderRadius: 12,
    backgroundColor: colors.secondary + '30',
    alignItems: 'center', justifyContent: 'center', position: 'relative',
  },
  codeBoxActive:  { borderColor: colors.accent, borderWidth: 2.5, backgroundColor: colors.accent + '10' },
  codeBoxFilled:  { borderColor: colors.accent, backgroundColor: colors.accent + '20' },
  codeBoxError:   { borderColor: '#ff6b6b' },
  codeBoxText:    { color: colors.text, fontSize: 24, fontWeight: '700' },
  cursor: { position: 'absolute', width: 2, height: 24, backgroundColor: colors.accent },
  hiddenInput: { position: 'absolute', width: 1, height: 1, opacity: 0 },

  timerRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 6, marginBottom: 10,
  },
  timerText: { fontSize: 14, color: colors.primary, fontWeight: '500' },
  resendButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, backgroundColor: colors.secondary + '40',
    borderRadius: 12, borderWidth: 1.5, borderColor: colors.accent + '50', marginBottom: 8,
  },
  resendText: { color: colors.accent, fontSize: 15, fontWeight: '600' },
  backTextBtn: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 6, marginTop: 20, paddingVertical: 8,
  },
  backTextBtnText: { color: colors.primary, fontSize: 14, fontWeight: '500' },
});

export default ChangeEmailScreen;