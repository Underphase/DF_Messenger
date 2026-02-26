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
import { useChangePassword, useConfirmChangePassword } from '../../hooks/user.hook';

type Step = 'enter' | 'confirm';

const ChangePasswordScreen = () => {
  const navigation = useNavigation();
  const { mutateAsync: changePassword,  isPending: isSending   } = useChangePassword();
  const { mutateAsync: confirmPassword, isPending: isConfirming } = useConfirmChangePassword();

  const [step,            setStep]            = useState<Step>('enter');
  const [oldPassword,        setOldPassword]        = useState('');
  const [newPassword,        setNewPassword]        = useState('');
  const [confirmPasswordVal, setConfirmPasswordVal] = useState('');
  const [code,            setCode]            = useState('');
  const [timeLeft,        setTimeLeft]        = useState(0);
  const [canResend,       setCanResend]       = useState(false);
  const [showOld,         setShowOld]         = useState(false);
  const [showNew,         setShowNew]         = useState(false);
  const [showConfirm,     setShowConfirm]     = useState(false);
  const [errors,          setErrors]          = useState<Record<string, string>>({});

  const codeInputRef  = useRef<TextInput>(null);
  const cursorOpacity = useRef(new Animated.Value(1)).current;

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

  useEffect(() => {
    if (timeLeft <= 0) return;
    const t = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) { setCanResend(true); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [timeLeft]);

  // ── Validation ────────────────────────────────────────────────────────────────
  const validate = () => {
    const e: Record<string, string> = {};
    if (oldPassword.length < 1)              e.oldPassword = 'Введите текущий пароль';
    if (newPassword.length < 8)              e.newPassword = 'Минимум 8 символов';
    if (newPassword.length > 70)             e.newPassword = 'Максимум 70 символов';
    if (newPassword !== confirmPasswordVal)  e.confirmPassword = 'Пароли не совпадают';
    if (oldPassword === newPassword)         e.newPassword = 'Новый пароль совпадает со старым';
    return e;
  };

  // ── Step 1 ────────────────────────────────────────────────────────────────────
  const handleSendCode = async () => {
    const e = validate();
    if (Object.keys(e).length > 0) { setErrors(e); return; }

    try {
      setErrors({});
      const res = await changePassword({
        oldPassword,
        newPassword,
        ConfirmPassword: confirmPasswordVal,
      });
      setTimeLeft(res.expiresIn);
      setCanResend(false);
      setStep('confirm');
      setTimeout(() => codeInputRef.current?.focus(), 300);
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Ошибка при отправке';
      if (typeof msg === 'string' && msg.toLowerCase().includes('password')) {
        setErrors({ oldPassword: 'Неверный текущий пароль' });
      } else {
        setErrors({ api: msg });
      }
    }
  };

  // ── Step 2 ────────────────────────────────────────────────────────────────────
  const handleConfirm = async (c = code) => {
    if (c.length !== 6) { setErrors({ code: 'Введите 6-значный код' }); return; }
    try {
      setErrors({});
      await confirmPassword({ newPassword, code: c });
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
      const res = await changePassword({ oldPassword, newPassword, ConfirmPassword: confirmPasswordVal });
      setTimeLeft(res.expiresIn);
      setCanResend(false);
    } catch (err: any) {
      setErrors({ api: err?.response?.data?.message || 'Ошибка' });
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
        <Text style={styles.headerTitle}>Сменить пароль</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">

        {step === 'enter' && (
          <>
            {/* Old password */}
            <Text style={styles.label}>Текущий пароль</Text>
            <View style={[styles.inputContainer, errors.oldPassword && styles.inputError]}>
              <Icon name="lock" size={18} color={colors.primary} style={styles.inputIcon} />
              <TextInput
                value={oldPassword}
                onChangeText={t => { setOldPassword(t); setErrors({ ...errors, oldPassword: '' }); }}
                style={[styles.input, { marginRight: 8 }]}
                placeholder="Введите текущий пароль"
                placeholderTextColor={colors.primary + '60'}
                secureTextEntry={!showOld}
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
              />
              <TouchableOpacity onPress={() => setShowOld(!showOld)}>
                <Icon name={showOld ? 'eye-off' : 'eye'} size={18} color={colors.primary} />
              </TouchableOpacity>
            </View>
            {errors.oldPassword && <Text style={styles.errorText}>{errors.oldPassword}</Text>}

            <View style={styles.spacer} />

            {/* New password */}
            <Text style={styles.label}>Новый пароль</Text>
            <View style={[styles.inputContainer, errors.newPassword && styles.inputError]}>
              <Icon name="lock" size={18} color={colors.primary} style={styles.inputIcon} />
              <TextInput
                value={newPassword}
                onChangeText={t => { setNewPassword(t); setErrors({ ...errors, newPassword: '' }); }}
                style={[styles.input, { marginRight: 8 }]}
                placeholder="Минимум 8 символов"
                placeholderTextColor={colors.primary + '60'}
                secureTextEntry={!showNew}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity onPress={() => setShowNew(!showNew)}>
                <Icon name={showNew ? 'eye-off' : 'eye'} size={18} color={colors.primary} />
              </TouchableOpacity>
            </View>
            {errors.newPassword && <Text style={styles.errorText}>{errors.newPassword}</Text>}

            <View style={styles.spacer} />

            {/* Confirm new password */}
            <Text style={styles.label}>Повторите новый пароль</Text>
            <View style={[styles.inputContainer, errors.confirmPassword && styles.inputError]}>
              <Icon name="lock" size={18} color={colors.primary} style={styles.inputIcon} />
              <TextInput
                value={confirmPasswordVal}
                onChangeText={t => { setConfirmPasswordVal(t); setErrors({ ...errors, confirmPassword: '' }); }}
                style={[styles.input, { marginRight: 8 }]}
                placeholder="Повторите пароль"
                placeholderTextColor={colors.primary + '60'}
                secureTextEntry={!showConfirm}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity onPress={() => setShowConfirm(!showConfirm)}>
                <Icon name={showConfirm ? 'eye-off' : 'eye'} size={18} color={colors.primary} />
              </TouchableOpacity>
            </View>
            {errors.confirmPassword && <Text style={styles.errorText}>{errors.confirmPassword}</Text>}

            {errors.api && (
              <View style={styles.apiError}>
                <Icon name="alert-circle" size={15} color="#ff6b6b" />
                <Text style={styles.apiErrorText}>{errors.api}</Text>
              </View>
            )}

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
              Код подтверждения отправлен на вашу почту
            </Text>

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
                {timeLeft > 0 ? formatTime(timeLeft) : 'Время истекло'}
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
              <Text style={styles.backTextBtnText}>Изменить пароль</Text>
            </TouchableOpacity>
          </>
        )}
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
    width: 40, height: 40, borderRadius: 12, backgroundColor: colors.secondary + '40',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  scrollContent: { padding: 24 },
  spacer: { height: 20 },
  label: {
    fontSize: 12, fontWeight: '700', color: colors.primary + '80',
    letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8,
  },
  inputContainer: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.secondary + '30', borderWidth: 1.5,
    borderColor: colors.primary + '30', borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 2, marginBottom: 4,
  },
  inputError: { borderColor: '#ff6b6b' },
  inputIcon:  { marginRight: 12 },
  input: { flex: 1, color: colors.text, fontSize: 15, paddingVertical: 14, fontWeight: '500' },
  errorText: { color: '#ff6b6b', fontSize: 12, fontWeight: '500', marginBottom: 4 },
  apiError: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#ff6b6b15', borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: '#ff6b6b30', marginTop: 12, marginBottom: 4,
  },
  apiErrorText: { color: '#ff6b6b', fontSize: 14, fontWeight: '600', flex: 1 },
  primaryButton: {
    backgroundColor: colors.accent, paddingVertical: 16, borderRadius: 14,
    alignItems: 'center', marginTop: 24,
    shadowColor: colors.accent, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3, shadowRadius: 10, elevation: 8,
  },
  primaryButtonText: { color: colors.text, fontSize: 16, fontWeight: '700' },
  // Code step
  confirmTitle: { fontSize: 26, fontWeight: '700', color: colors.text, textAlign: 'center', marginBottom: 10 },
  confirmSubtitle: { fontSize: 15, color: colors.primary, textAlign: 'center', lineHeight: 22, marginBottom: 32 },
  codeContainer: {
    flexDirection: 'row', justifyContent: 'center', gap: 10,
    marginBottom: 20, position: 'relative',
  },
  codeBox: {
    width: 48, height: 56, borderWidth: 2, borderColor: colors.primary + '40',
    borderRadius: 12, backgroundColor: colors.secondary + '30',
    alignItems: 'center', justifyContent: 'center', position: 'relative',
  },
  codeBoxActive:  { borderColor: colors.accent, borderWidth: 2.5, backgroundColor: colors.accent + '10' },
  codeBoxFilled:  { borderColor: colors.accent, backgroundColor: colors.accent + '20' },
  codeBoxError:   { borderColor: '#ff6b6b' },
  codeBoxText:    { color: colors.text, fontSize: 24, fontWeight: '700' },
  cursor: { position: 'absolute', width: 2, height: 24, backgroundColor: colors.accent },
  hiddenInput: { position: 'absolute', width: 1, height: 1, opacity: 0 },
  timerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 10 },
  timerText: { fontSize: 14, color: colors.primary, fontWeight: '600' },
  resendButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, backgroundColor: colors.secondary + '40',
    borderRadius: 12, borderWidth: 1.5, borderColor: colors.accent + '50', marginBottom: 8,
  },
  resendText: { color: colors.accent, fontSize: 15, fontWeight: '600' },
  backTextBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 20, paddingVertical: 8 },
  backTextBtnText: { color: colors.primary, fontSize: 14, fontWeight: '500' },
});

export default ChangePasswordScreen;