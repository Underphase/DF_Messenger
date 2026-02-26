import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/Feather';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';

import { AuthStackParamList } from '../navigation/types';
import { colors } from '../styles/colors';
import { useCreateDevice, useVerifyKey } from '../hooks/key.hook';
import { keys } from '../api';

type Props = NativeStackScreenProps<AuthStackParamList, 'KeyLoginScreen'>;

const KeyScreen: React.FC<Props> = ({ navigation }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [userKeyInput, setUserKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { mutateAsync: createDevice } = useCreateDevice();
  const { mutate: verify } = useVerifyKey();
  // ── Animations ──────────────────────────────────────────────────────────────
  const logoScale    = useRef(new Animated.Value(0)).current;
  const logoRotate   = useRef(new Animated.Value(0)).current;
  const formOpacity  = useRef(new Animated.Value(0)).current;
  const formSlide    = useRef(new Animated.Value(40)).current;
  const shakeX       = useRef(new Animated.Value(0)).current;

  // Pulsing glow on the icon circle
  const glowOpacity  = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    // Logo entrance
    Animated.parallel([
      Animated.spring(logoScale, {
        toValue: 1,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }),
      Animated.timing(logoRotate, {
        toValue: 1,
        duration: 1000,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    // Form entrance
    Animated.parallel([
      Animated.timing(formOpacity, {
        toValue: 1,
        duration: 800,
        delay: 200,
        useNativeDriver: true,
      }),
      Animated.timing(formSlide, {
        toValue: 0,
        duration: 600,
        delay: 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    // Idle pulsing glow
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(glowOpacity, {
          toValue: 0.7,
          duration: 1800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(glowOpacity, {
          toValue: 0.2,
          duration: 1800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  // ── Shake animation on error ─────────────────────────────────────────────────
  const triggerShake = () => {
    shakeX.setValue(0);
    Animated.sequence([
      Animated.timing(shakeX, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: 10,  duration: 60, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: -8,  duration: 60, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: 8,   duration: 60, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: -4,  duration: 60, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: 0,   duration: 60, useNativeDriver: true }),
    ]).start();
  };

  // ── Device check on mount ────────────────────────────────────────────────────
  useEffect(() => {
    const checkDevice = async () => {
      try {
        const deviceId  = await AsyncStorage.getItem('deviceId');
        const deviceKey = await AsyncStorage.getItem('deviceKey');

        if (!deviceId || !deviceKey) {
          setIsLoading(false);
          return;
        }

        const device = await keys.getDevice(Number(deviceId));

        if (device.deviceKey === deviceKey) {
          navigation.navigate('LoginScreen');
          return;
        } else {
          await AsyncStorage.multiRemove(['deviceId', 'deviceKey']);
        }
      } catch (err) {
        console.error('Ошибка при проверке устройства:', err);
        await AsyncStorage.multiRemove(['deviceId', 'deviceKey']);
      }

      setIsLoading(false);
    };

    checkDevice();
  }, [navigation]);

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const handleCreateDevice = async () => {
    const deviceKey = uuidv4();
    const response  = await createDevice(deviceKey);

    if (!response.deviceId) throw new Error('deviceId не вернулся с сервера');

    await AsyncStorage.multiSet([
      ['deviceId', String(response.deviceId)],
      ['deviceKey', deviceKey],
    ]);
  };

  const handleSubmit = async () => {
    if (userKeyInput.trim().length === 0) {
      setError('Ключ не может быть пустым');
      triggerShake();
      return;
    }

    setError('');
    setIsSubmitting(true);

    verify(userKeyInput.trim(), {
      onSuccess: async () => {
        try {
          await handleCreateDevice();
          navigation.navigate('LoginScreen');
        } catch (err) {
          console.error('Ошибка создания устройства:', err);
          setError('Ошибка при сохранении устройства');
          triggerShake();
        } finally {
          setIsSubmitting(false);
        }
      },
      onError: () => {
        setError('Ключ неверный или недействителен');
        triggerShake();
        setIsSubmitting(false);
      },
    });
  };

  const logoRotateInterpolate = logoRotate.interpolate({
    inputRange:  [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // ── Loading splash ───────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.loadingText}>Проверка устройства...</Text>
      </View>
    );
  }

  // ── Main UI ──────────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Logo */}
        <Animated.View
          style={[
            styles.logoContainer,
            {
              transform: [
                { scale: logoScale },
                { rotate: logoRotateInterpolate },
              ],
            },
          ]}
        >
          {/* Pulsing outer glow ring */}
          <Animated.View style={[styles.logoGlow, { opacity: glowOpacity }]} />
          <View style={styles.logoCircle}>
            <Icon name="key" size={48} color={colors.primary} />
          </View>
        </Animated.View>

        {/* Title */}
        <Animated.View style={{ opacity: formOpacity }}>
          <Text style={styles.logoText}>DF Messenger</Text>
          <Text style={styles.logoSubtext}>Введите ключ доступа</Text>
        </Animated.View>

        {/* Form */}
        <Animated.View
          style={[
            styles.formContainer,
            {
              opacity: formOpacity,
              transform: [
                { translateY: formSlide },
                { translateX: shakeX },
              ],
            },
          ]}
        >
          {/* Info card */}
          <View style={styles.infoCard}>
            <Icon name="shield" size={16} color={colors.accent} style={{ marginRight: 8 }} />
            <Text style={styles.infoText}>
              Доступ только по приглашению
            </Text>
          </View>

          {/* Key input */}
          <View style={styles.inputWrapper}>
            <View style={[styles.inputContainer, error ? styles.inputError : null]}>
              <Icon name="lock" size={20} color={colors.primary} style={styles.inputIcon} />
              <TextInput
                value={userKeyInput}
                onChangeText={(t) => {
                  setUserKeyInput(t);
                  setError('');
                }}
                style={styles.input}
                placeholder="Введите ключ"
                placeholderTextColor={colors.primary + '80'}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry={!showKey}
              />
              <TouchableOpacity onPress={() => setShowKey(!showKey)}>
                <Icon
                  name={showKey ? 'eye-off' : 'eye'}
                  size={20}
                  color={colors.primary}
                />
              </TouchableOpacity>
            </View>
            {error ? (
              <Text style={styles.errorText}>{error}</Text>
            ) : null}
          </View>

          {/* Submit button */}
          <TouchableOpacity
            style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={isSubmitting}
            activeOpacity={0.8}
          >
            {isSubmitting ? (
              <ActivityIndicator color={colors.text} />
            ) : (
              <>
                <Icon name="unlock" size={18} color={colors.text} style={{ marginRight: 8 }} />
                <Text style={styles.submitButtonText}>Подтвердить</Text>
              </>
            )}
          </TouchableOpacity>
        </Animated.View>

        {/* Decorative circles (same as LoginScreen) */}
        <View style={styles.decorativeCircle1} />
        <View style={styles.decorativeCircle2} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centerContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
    paddingTop: 60,
    paddingBottom: 40,
  },

  // Loading
  loadingText: {
    color: colors.primary,
    marginTop: 16,
    fontSize: 16,
    fontWeight: '500',
  },

  // Logo
  logoContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  logoGlow: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.accent,
    // softens into the background
    opacity: 0.3,
  },
  logoCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.secondary + '30',
    borderWidth: 2,
    borderColor: colors.primary + '40',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12
  },
  logoText: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.5,
    marginBottom: 8,
    textAlign: 'center',
  },
  logoSubtext: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: '400',
    textAlign: 'center',
    opacity: 0.9,
    marginBottom: 32,
  },

  // Form
  formContainer: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },

  // Info card
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.accent + '18',
    borderWidth: 1,
    borderColor: colors.accent + '50',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  infoText: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },

  // Input
  inputWrapper: {
    marginBottom: 24,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.secondary + '30',
    borderWidth: 1.5,
    borderColor: colors.primary + '40',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  inputError: {
    borderColor: '#ff6b6b',
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
    paddingVertical: 14,
    fontWeight: '500',
    marginRight: 8,
  },
  errorText: {
    color: '#ff6b6b',
    fontSize: 13,
    marginTop: 6,
    marginLeft: 4,
    fontWeight: '500',
  },

  // Button
  submitButton: {
    flexDirection: 'row',
    backgroundColor: colors.accent,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  // Decorative
  decorativeCircle1: {
    position: 'absolute',
    top: -100,
    right: -100,
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: colors.primary + '10',
    opacity: 0.3,
  },
  decorativeCircle2: {
    position: 'absolute',
    bottom: -80,
    left: -80,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: colors.accent + '15',
    opacity: 0.3,
  },
});

export default KeyScreen;