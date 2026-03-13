import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Keychain from 'react-native-keychain';
import Icon from 'react-native-vector-icons/Feather';
import {
  useLogin,
  useRegister,
  useSendCode,
  useVerify,
  useForgotPassword,
  useConfirmForgotPassword,
} from '../hooks/login.hook';
import { AuthStackParamList } from '../navigation/types';
import { colors } from '../styles/colors';
import { useAuth } from '../context/AuthContext';

type Props = NativeStackScreenProps<AuthStackParamList, 'LoginScreen'>;

type AuthMode = 'login' | 'register';
type Screen = 'auth' | 'verify' | 'forgot';
type ForgotStep = 'email' | 'confirm';

const LoginScreen: React.FC<Props> = ({ navigation }) => {
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [screen, setScreen] = useState<Screen>('auth');
  const { signIn } = useAuth();

  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [verifyCode, setVerifyCode] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const [timeLeft, setTimeLeft] = useState(0);
  const [canResend, setCanResend] = useState(false);

  // Реальная ширина switcher — измеряется через onLayout
  const [switcherWidth, setSwitcherWidth] = useState(0);

  const codeInputRef = useRef<TextInput>(null);
  const forgotCodeInputRef = useRef<TextInput>(null);

  const [forgotStep, setForgotStep] = useState<ForgotStep>('email');
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotCode, setForgotCode] = useState('');
  const [forgotNewPassword, setForgotNewPassword] = useState('');
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  const registerMutation = useRegister();
  const loginMutation = useLogin();
  const verifyMutation = useVerify();
  const sendCodeMutation = useSendCode();
  const forgotMutation = useForgotPassword();
  const confirmForgotMutation = useConfirmForgotPassword();

  const logoScale = useRef(new Animated.Value(0)).current;
  const logoRotate = useRef(new Animated.Value(0)).current;
  const formOpacity = useRef(new Animated.Value(0)).current;
  const formTranslateY = useRef(new Animated.Value(30)).current;

  const usernameOpacity = useRef(
    new Animated.Value(authMode === 'register' ? 1 : 0),
  ).current;
  const usernameHeight = useRef(
    new Animated.Value(authMode === 'register' ? 80 : 0),
  ).current;

  const tabIndicatorPosition = useRef(
    new Animated.Value(authMode === 'login' ? 0 : 1),
  ).current;

  const cursorOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const blinkAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(cursorOpacity, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(cursorOpacity, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ]),
    );
    blinkAnimation.start();
    return () => blinkAnimation.stop();
  }, []);

  useEffect(() => {
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

    Animated.parallel([
      Animated.timing(formOpacity, {
        toValue: 1,
        duration: 800,
        delay: 200,
        useNativeDriver: true,
      }),
      Animated.timing(formTranslateY, {
        toValue: 0,
        duration: 600,
        delay: 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    checkPendingVerification();
  }, []);

  useEffect(() => {
    const toValue = authMode === 'register' ? 1 : 0;
    const heightValue = authMode === 'register' ? 80 : 0;
    const tabPosition = authMode === 'login' ? 0 : 1;

    Animated.parallel([
      Animated.timing(usernameOpacity, {
        toValue,
        duration: 300,
        useNativeDriver: false,
      }),
      Animated.timing(usernameHeight, {
        toValue: heightValue,
        duration: 300,
        easing: Easing.out(Easing.ease),
        useNativeDriver: false,
      }),
      Animated.spring(tabIndicatorPosition, {
        toValue: tabPosition,
        friction: 8,
        tension: 80,
        useNativeDriver: false,
      }),
    ]).start();
  }, [authMode]);

  const checkPendingVerification = async () => {
    try {
      const pendingEmail = await AsyncStorage.getItem('pending_verification_email');
      const expiresAt = await AsyncStorage.getItem('verification_expires_at');

      if (pendingEmail && expiresAt) {
        const now = Date.now();
        const expires = parseInt(expiresAt, 10);

        if (now < expires) {
          setEmail(pendingEmail);
          setScreen('verify');
          const secondsLeft = Math.floor((expires - now) / 1000);
          setTimeLeft(secondsLeft);
        } else {
          await AsyncStorage.removeItem('pending_verification_email');
          await AsyncStorage.removeItem('verification_expires_at');
        }
      }
    } catch (error) {
      console.error('Error checking pending verification:', error);
    }
  };

  useEffect(() => {
    if (timeLeft > 0) {
      const timer = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            setCanResend(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [timeLeft]);

  const validateEmail = (value: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(value) && value.length <= 320;
  };

  const validatePassword = (value: string): boolean => {
    return value.length >= 8 && value.length <= 70;
  };

  const validateUsername = (value: string): boolean => {
    return value.length > 0 && value.length <= 30;
  };

  const handleAuth = async () => {
    setErrors({});
    const newErrors: { [key: string]: string } = {};

    if (!validateEmail(email)) {
      newErrors.email = 'Некорректный email (макс. 320 символов)';
    }
    if (!validatePassword(password)) {
      newErrors.password = 'Пароль: 8-70 символов';
    }
    if (authMode === 'register' && !validateUsername(username)) {
      newErrors.username = 'Имя: 1-30 символов';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    try {
      if (authMode === 'register') {
        const response = await registerMutation.mutateAsync({
          email,
          nickName: username,
          password,
        });

        await AsyncStorage.setItem('pending_verification_email', email);
        const expiresAt = Date.now() + response.expiresIn * 1000;
        await AsyncStorage.setItem('verification_expires_at', expiresAt.toString());

        setTimeLeft(response.expiresIn);
        setCanResend(false);
        setScreen('verify');
      } else {
        const response = await loginMutation.mutateAsync({ email, password });

        await AsyncStorage.setItem('pending_verification_email', email);
        const expiresAt = Date.now() + response.expiresIn * 1000;
        await AsyncStorage.setItem('verification_expires_at', expiresAt.toString());

        setTimeLeft(response.expiresIn);
        setCanResend(false);
        setScreen('verify');
      }
    } catch (error: any) {
      setErrors({ api: error?.response?.data?.message || 'Ошибка при отправке' });
    }
  };

  const handleVerify = async () => {
    if (verifyCode.length !== 6) {
      setErrors({ code: 'Введите 6-значный код' });
      return;
    }
    await handleVerifyWithCode(verifyCode);
  };

  const handleResendCode = async () => {
    if (!canResend) return;
    setErrors({});
    try {
      const response = await sendCodeMutation.mutateAsync({ email });
      const expiresAt = Date.now() + response.expiresIn * 1000;
      await AsyncStorage.setItem('verification_expires_at', expiresAt.toString());
      setTimeLeft(response.expiresIn);
      setCanResend(false);
    } catch (error: any) {
      setErrors({ api: error?.response?.data?.message || error?.message || 'Ошибка при отправке кода' });
    }
  };

  const handleCodeChange = (value: string) => {
    const cleanValue = value.replace(/[^0-9]/g, '').slice(0, 6);
    setVerifyCode(cleanValue);
    setErrors({});

    if (cleanValue.length === 6) {
      Keyboard.dismiss();
      setTimeout(() => handleVerifyWithCode(cleanValue), 200);
    }
  };

  const handleVerifyWithCode = async (code: string) => {
    if (code.length !== 6) {
      setErrors({ code: 'Введите 6-значный код' });
      return;
    }
    try {
      const response = await verifyMutation.mutateAsync({ email, code });

      await Keychain.setGenericPassword(
        'user',
        JSON.stringify({
          accessToken: response.accessToken,
          refreshToken: response.refreshToken,
        }),
      );

      await AsyncStorage.removeItem('pending_verification_email');
      await AsyncStorage.removeItem('verification_expires_at');

      signIn();
    } catch (error: any) {
      setErrors({ code: error?.response?.data?.message || 'Неверный код' });
      setVerifyCode('');
      codeInputRef.current?.focus();
    }
  };

  const handleForgotSendCode = async () => {
    setErrors({});
    if (!validateEmail(forgotEmail)) {
      setErrors({ forgotEmail: 'Некорректный email' });
      return;
    }
    try {
      await forgotMutation.mutateAsync({ email: forgotEmail });
      setForgotStep('confirm');
    } catch (error: any) {
      setErrors({ api: error?.response?.data?.message || 'Ошибка при отправке' });
    }
  };

  const handleForgotCodeChange = (value: string) => {
    const clean = value.replace(/[^0-9]/g, '').slice(0, 6);
    setForgotCode(clean);
    setErrors({});
  };

  const handleForgotConfirm = async () => {
    setErrors({});
    const newErrors: { [key: string]: string } = {};

    if (forgotCode.length !== 6) {
      newErrors.forgotCode = 'Введите 6-значный код';
    }
    if (!validatePassword(forgotNewPassword)) {
      newErrors.forgotPassword = 'Пароль: 8-70 символов';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    try {
      await confirmForgotMutation.mutateAsync({
        email: forgotEmail,
        code: forgotCode,
        newPassword: forgotNewPassword,
      });
      setScreen('auth');
      setForgotStep('email');
      setForgotEmail('');
      setForgotCode('');
      setForgotNewPassword('');
      setErrors({});
    } catch (error: any) {
      setErrors({ api: error?.response?.data?.message || 'Неверный код или ошибка' });
    }
  };

  const switchAuthMode = (mode: AuthMode) => {
    setAuthMode(mode);
    setErrors({});
    setPassword('');
    if (mode === 'login') setUsername('');
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const isLoading =
    registerMutation.isPending ||
    loginMutation.isPending ||
    verifyMutation.isPending ||
    forgotMutation.isPending ||
    confirmForgotMutation.isPending;

  const logoRotateInterpolate = logoRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const getSubtext = () => {
    if (screen === 'verify') return 'Проверьте вашу почту';
    if (screen === 'forgot') return forgotStep === 'email' ? 'Восстановление пароля' : 'Введите код и новый пароль';
    return 'Добро пожаловать';
  };

  // Половина switcher минус padding (4px слева + 4px справа = 8px)
  // switcherWidth === 0 пока onLayout не сработал — используем fallback
  const halfWidth = switcherWidth > 0 ? (switcherWidth - 8) / 2 : 0;

  const indicatorTranslateX = tabIndicatorPosition.interpolate({
    inputRange: [0, 1],
    outputRange: [0, halfWidth],
  });

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
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
          <View style={styles.logoCircle}>
            <Icon name="message-circle" size={48} color={colors.primary} />
          </View>
        </Animated.View>

        <Animated.View style={{ opacity: formOpacity }}>
          <Text style={styles.logoText}>DF Messenger</Text>
          <Text style={styles.logoSubtext}>{getSubtext()}</Text>
        </Animated.View>

        {/* Auth Form */}
        {screen === 'auth' && (
          <Animated.View
            style={[
              styles.formContainer,
              {
                opacity: formOpacity,
                transform: [{ translateY: formTranslateY }],
              },
            ]}
          >
            {/* Mode Switcher */}
            <View
              style={styles.modeSwitcher}
              onLayout={e => setSwitcherWidth(e.nativeEvent.layout.width)}
            >
              {/* Индикатор рендерим только когда знаем реальную ширину */}
              {switcherWidth > 0 && (
                <Animated.View
                  style={[
                    styles.modeIndicator,
                    {
                      width: halfWidth,
                      transform: [{ translateX: indicatorTranslateX }],
                    },
                  ]}
                />
              )}
              <TouchableOpacity
                style={styles.modeButton}
                onPress={() => switchAuthMode('login')}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.modeButtonText,
                    authMode === 'login' && styles.modeButtonTextActive,
                  ]}
                >
                  Вход
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modeButton}
                onPress={() => switchAuthMode('register')}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.modeButtonText,
                    authMode === 'register' && styles.modeButtonTextActive,
                  ]}
                >
                  Регистрация
                </Text>
              </TouchableOpacity>
            </View>

            {/* Email Input */}
            <View style={styles.inputWrapper}>
              <View style={[styles.inputContainer, errors.email && styles.inputError]}>
                <Icon name="mail" size={20} color={colors.primary} style={styles.inputIcon} />
                <TextInput
                  value={email}
                  onChangeText={text => { setEmail(text); setErrors({ ...errors, email: '' }); }}
                  style={styles.input}
                  placeholder="Email"
                  placeholderTextColor={colors.primary + '80'}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
              {errors.email && <Text style={styles.errorText}>{errors.email}</Text>}
            </View>

            {/* Username Input (Register only) */}
            <Animated.View
              style={[
                styles.inputWrapper,
                { opacity: usernameOpacity, height: usernameHeight, overflow: 'hidden' },
              ]}
            >
              <View style={[styles.inputContainer, errors.username && styles.inputError]}>
                <Icon name="user" size={20} color={colors.primary} style={styles.inputIcon} />
                <TextInput
                  value={username}
                  onChangeText={text => { setUsername(text); setErrors({ ...errors, username: '' }); }}
                  style={styles.input}
                  placeholder="Имя пользователя"
                  placeholderTextColor={colors.primary + '80'}
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={authMode === 'register'}
                />
              </View>
              {errors.username && <Text style={styles.errorText}>{errors.username}</Text>}
            </Animated.View>

            {/* Password Input */}
            <View style={styles.inputWrapper}>
              <View style={[styles.inputContainer, errors.password && styles.inputError]}>
                <Icon name="lock" size={20} color={colors.primary} style={styles.inputIcon} />
                <TextInput
                  value={password}
                  onChangeText={text => { setPassword(text); setErrors({ ...errors, password: '' }); }}
                  style={[styles.input, styles.passwordInput]}
                  placeholder="Пароль"
                  placeholderTextColor={colors.primary + '80'}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                  <Icon name={showPassword ? 'eye-off' : 'eye'} size={20} color={colors.primary} />
                </TouchableOpacity>
              </View>
              {errors.password && <Text style={styles.errorText}>{errors.password}</Text>}
            </View>

            {errors.api && (
              <Text style={styles.apiErrorText}>{errors.api}</Text>
            )}

            <TouchableOpacity
              style={[styles.submitButton, isLoading && styles.submitButtonDisabled]}
              onPress={handleAuth}
              disabled={isLoading}
              activeOpacity={0.8}
            >
              {isLoading ? (
                <ActivityIndicator color={colors.text} />
              ) : (
                <Text style={styles.submitButtonText}>
                  {authMode === 'login' ? 'Войти' : 'Зарегистрироваться'}
                </Text>
              )}
            </TouchableOpacity>

            {authMode === 'login' && (
              <TouchableOpacity
                style={styles.forgotButton}
                onPress={() => {
                  setScreen('forgot');
                  setForgotStep('email');
                  setForgotEmail(email);
                  setErrors({});
                }}
                activeOpacity={0.7}
              >
                <Icon name="help-circle" size={14} color={colors.primary + '70'} />
                <Text style={styles.forgotButtonText}>Забыл пароль</Text>
              </TouchableOpacity>
            )}
          </Animated.View>
        )}

        {/* Verification Screen */}
        {screen === 'verify' && (
          <Animated.View
            style={[
              styles.verifyContainer,
              {
                opacity: formOpacity,
                transform: [{ translateY: formTranslateY }],
              },
            ]}
          >
            <Text style={styles.verifyTitle}>Введите код</Text>
            <Text style={styles.verifySubtitle}>
              Код отправлен на{'\n'}
              <Text style={styles.emailHighlight}>{email}</Text>
            </Text>

            <TouchableOpacity
              style={styles.codeContainer}
              onPress={() => codeInputRef.current?.focus()}
              activeOpacity={1}
            >
              {[0, 1, 2, 3, 4, 5].map(index => {
                const isFilled = verifyCode[index];
                const isActive = index === verifyCode.length && verifyCode.length < 6;
                return (
                  <View
                    key={index}
                    style={[
                      styles.codeBox,
                      isFilled && styles.codeBoxFilled,
                      isActive && styles.codeBoxActive,
                      errors.code && styles.codeBoxError,
                    ]}
                  >
                    <Text style={styles.codeBoxText}>{verifyCode[index] || ''}</Text>
                    {isActive && !isFilled && (
                      <Animated.View style={[styles.cursor, { opacity: cursorOpacity }]} />
                    )}
                  </View>
                );
              })}
              <TextInput
                ref={codeInputRef}
                value={verifyCode}
                onChangeText={handleCodeChange}
                style={styles.hiddenCodeInput}
                keyboardType="number-pad"
                maxLength={6}
                autoFocus
                caretHidden
              />
            </TouchableOpacity>

            {errors.code && <Text style={styles.errorText}>{errors.code}</Text>}

            <View style={styles.timerSection}>
              <View style={styles.timerContainer}>
                <Icon name="clock" size={16} color={colors.primary} />
                <Text style={styles.timerText}>
                  {timeLeft > 0 ? formatTime(timeLeft) : 'Время истекло'}
                </Text>
              </View>
              {canResend && (
                <View style={styles.resendButtonContainer}>
                  <TouchableOpacity
                    style={styles.resendButton}
                    onPress={handleResendCode}
                    disabled={sendCodeMutation.isPending}
                    activeOpacity={0.7}
                  >
                    {sendCodeMutation.isPending ? (
                      <ActivityIndicator size="small" color={colors.accent} />
                    ) : (
                      <>
                        <Icon name="rotate-cw" size={16} color={colors.accent} />
                        <Text style={styles.resendButtonText}>Отправить заново</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {errors.api && (
              <View style={{ marginBottom: 16 }}>
                <Text style={styles.errorText}>{errors.api}</Text>
              </View>
            )}

            <View style={styles.verifyButtonContainer}>
              <TouchableOpacity
                style={[
                  styles.submitButton,
                  styles.verifyButton,
                  (isLoading || verifyCode.length !== 6) && styles.submitButtonDisabled,
                ]}
                onPress={handleVerify}
                disabled={isLoading || verifyCode.length !== 6}
                activeOpacity={0.8}
              >
                {isLoading ? (
                  <ActivityIndicator color={colors.text} />
                ) : (
                  <Text style={styles.submitButtonText}>Подтвердить</Text>
                )}
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.backButton}
              onPress={() => { setScreen('auth'); setVerifyCode(''); setErrors({}); }}
              activeOpacity={0.7}
            >
              <Icon name="arrow-left" size={16} color={colors.primary} />
              <Text style={styles.backButtonText}>Назад к входу</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* Forgot Password Screen */}
        {screen === 'forgot' && (
          <Animated.View
            style={[
              styles.verifyContainer,
              {
                opacity: formOpacity,
                transform: [{ translateY: formTranslateY }],
              },
            ]}
          >
            {forgotStep === 'email' ? (
              <>
                <View style={styles.forgotIconWrap}>
                  <Icon name="unlock" size={32} color={colors.accent} />
                </View>
                <Text style={styles.verifyTitle}>Забыли пароль?</Text>
                <Text style={styles.verifySubtitle}>
                  Введите вашу почту — отправим код для сброса пароля
                </Text>

                <View style={[styles.inputWrapper, { width: '100%' }]}>
                  <View style={[styles.inputContainer, errors.forgotEmail && styles.inputError]}>
                    <Icon name="mail" size={20} color={colors.primary} style={styles.inputIcon} />
                    <TextInput
                      value={forgotEmail}
                      onChangeText={text => { setForgotEmail(text); setErrors({ ...errors, forgotEmail: '' }); }}
                      style={styles.input}
                      placeholder="Email"
                      placeholderTextColor={colors.primary + '80'}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </View>
                  {errors.forgotEmail && <Text style={styles.errorText}>{errors.forgotEmail}</Text>}
                </View>

                {errors.api && <Text style={[styles.apiErrorText, { width: '100%' }]}>{errors.api}</Text>}

                <TouchableOpacity
                  style={[styles.submitButton, { width: '100%' }, isLoading && styles.submitButtonDisabled]}
                  onPress={handleForgotSendCode}
                  disabled={isLoading}
                  activeOpacity={0.8}
                >
                  {isLoading ? (
                    <ActivityIndicator color={colors.text} />
                  ) : (
                    <>
                      <Icon name="send" size={16} color={colors.text} style={{ marginRight: 8 }} />
                      <Text style={styles.submitButtonText}>Отправить код</Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            ) : (
              <>
                <View style={styles.forgotIconWrap}>
                  <Icon name="key" size={32} color={colors.accent} />
                </View>
                <Text style={styles.verifyTitle}>Новый пароль</Text>
                <Text style={styles.verifySubtitle}>
                  Код отправлен на{'\n'}
                  <Text style={styles.emailHighlight}>{forgotEmail}</Text>
                </Text>

                <TouchableOpacity
                  style={styles.codeContainer}
                  onPress={() => forgotCodeInputRef.current?.focus()}
                  activeOpacity={1}
                >
                  {[0, 1, 2, 3, 4, 5].map(index => {
                    const isFilled = forgotCode[index];
                    const isActive = index === forgotCode.length && forgotCode.length < 6;
                    return (
                      <View
                        key={index}
                        style={[
                          styles.codeBox,
                          isFilled && styles.codeBoxFilled,
                          isActive && styles.codeBoxActive,
                          errors.forgotCode && styles.codeBoxError,
                        ]}
                      >
                        <Text style={styles.codeBoxText}>{forgotCode[index] || ''}</Text>
                        {isActive && !isFilled && (
                          <Animated.View style={[styles.cursor, { opacity: cursorOpacity }]} />
                        )}
                      </View>
                    );
                  })}
                  <TextInput
                    ref={forgotCodeInputRef}
                    value={forgotCode}
                    onChangeText={handleForgotCodeChange}
                    style={styles.hiddenCodeInput}
                    keyboardType="number-pad"
                    maxLength={6}
                    autoFocus
                    caretHidden
                  />
                </TouchableOpacity>
                {errors.forgotCode && <Text style={styles.errorText}>{errors.forgotCode}</Text>}

                <View style={[styles.inputWrapper, { width: '100%', marginTop: 16 }]}>
                  <View style={[styles.inputContainer, errors.forgotPassword && styles.inputError]}>
                    <Icon name="lock" size={20} color={colors.primary} style={styles.inputIcon} />
                    <TextInput
                      value={forgotNewPassword}
                      onChangeText={text => { setForgotNewPassword(text); setErrors({ ...errors, forgotPassword: '' }); }}
                      style={[styles.input, styles.passwordInput]}
                      placeholder="Новый пароль"
                      placeholderTextColor={colors.primary + '80'}
                      secureTextEntry={!showForgotPassword}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    <TouchableOpacity onPress={() => setShowForgotPassword(!showForgotPassword)}>
                      <Icon name={showForgotPassword ? 'eye-off' : 'eye'} size={20} color={colors.primary} />
                    </TouchableOpacity>
                  </View>
                  {errors.forgotPassword && <Text style={styles.errorText}>{errors.forgotPassword}</Text>}
                </View>

                {errors.api && <Text style={[styles.apiErrorText, { width: '100%' }]}>{errors.api}</Text>}

                <View style={[styles.verifyButtonContainer, { width: '100%' }]}>
                  <TouchableOpacity
                    style={[
                      styles.submitButton,
                      styles.verifyButton,
                      (isLoading || forgotCode.length !== 6 || forgotNewPassword.length < 8) && styles.submitButtonDisabled,
                    ]}
                    onPress={handleForgotConfirm}
                    disabled={isLoading || forgotCode.length !== 6 || forgotNewPassword.length < 8}
                    activeOpacity={0.8}
                  >
                    {isLoading ? (
                      <ActivityIndicator color={colors.text} />
                    ) : (
                      <Text style={styles.submitButtonText}>Сменить пароль</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}

            <TouchableOpacity
              style={styles.backButton}
              onPress={() => {
                if (forgotStep === 'confirm') {
                  setForgotStep('email');
                  setForgotCode('');
                  setErrors({});
                } else {
                  setScreen('auth');
                  setForgotEmail('');
                  setErrors({});
                }
              }}
              activeOpacity={0.7}
            >
              <Icon name="arrow-left" size={16} color={colors.primary} />
              <Text style={styles.backButtonText}>
                {forgotStep === 'confirm' ? 'Изменить email' : 'Назад к входу'}
              </Text>
            </TouchableOpacity>
          </Animated.View>
        )}
      </ScrollView>

      {/* Декоративные шары — вне скролла, не двигаются */}
      <View style={styles.decorativeCircle1} pointerEvents="none" />
      <View style={styles.decorativeCircle2} pointerEvents="none" />
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
    paddingTop: 60,
    paddingBottom: Platform.OS === 'android' ? 80 : 40,
  },

  logoContainer: {
    alignItems: 'center',
    marginBottom: 20,
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

  formContainer: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },

  modeSwitcher: {
    flexDirection: 'row',
    backgroundColor: colors.secondary + '40',
    borderRadius: 16,
    padding: 4,
    marginBottom: 32,
    position: 'relative',
  },
  modeIndicator: {
    position: 'absolute',
    left: 4,
    top: 4,
    bottom: 4,
    backgroundColor: colors.accent,
    borderRadius: 12,
    zIndex: 0,
  },
  modeButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    zIndex: 1,
  },
  modeButtonActive: {
    backgroundColor: 'transparent',
  },
  modeButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.primary,
  },
  modeButtonTextActive: {
    color: colors.text,
  },

  inputWrapper: {
    marginBottom: 20,
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
  },
  passwordInput: {
    marginRight: 8,
  },

  errorText: {
    color: '#ff6b6b',
    fontSize: 13,
    marginTop: 6,
    marginLeft: 4,
    fontWeight: '500',
  },
  apiErrorText: {
    color: '#ff6b6b',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
    fontWeight: '600',
    padding: 12,
    backgroundColor: '#ff6b6b20',
    borderRadius: 10,
  },

  submitButton: {
    flexDirection: 'row',
    backgroundColor: colors.accent,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
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

  forgotButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 18,
    paddingVertical: 6,
  },
  forgotButtonText: {
    color: colors.primary + '80',
    fontSize: 14,
    fontWeight: '500',
  },

  forgotIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: colors.accent + '18',
    borderWidth: 1.5,
    borderColor: colors.accent + '40',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },

  verifyContainer: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    alignItems: 'center',
  },
  verifyTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
  },
  verifySubtitle: {
    fontSize: 15,
    color: colors.primary,
    textAlign: 'center',
    marginBottom: 40,
    lineHeight: 22,
  },
  emailHighlight: {
    color: colors.accent,
    fontWeight: '600',
  },

  codeContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 24,
    position: 'relative',
  },
  codeBox: {
    width: 48,
    height: 56,
    borderWidth: 2,
    borderColor: colors.primary + '40',
    borderRadius: 12,
    backgroundColor: colors.secondary + '30',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  codeBoxActive: {
    borderColor: colors.accent,
    borderWidth: 2.5,
    backgroundColor: colors.accent + '10',
  },
  codeBoxFilled: {
    borderColor: colors.accent,
    backgroundColor: colors.accent + '20',
  },
  codeBoxError: {
    borderColor: '#ff6b6b',
  },
  codeBoxText: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
  },
  cursor: {
    position: 'absolute',
    width: 2,
    height: 24,
    backgroundColor: colors.accent,
    opacity: 0.8,
  },
  hiddenCodeInput: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
  },

  timerSection: {
    width: '100%',
    marginBottom: 24,
  },
  timerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
  },
  timerText: {
    fontSize: 15,
    color: colors.primary,
    fontWeight: '600',
  },

  resendButtonContainer: {
    width: '100%',
  },
  resendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 24,
    backgroundColor: colors.secondary + '40',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.accent + '60',
  },
  resendButtonText: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: '600',
  },

  verifyButtonContainer: {
    width: '100%',
    marginTop: 8,
  },
  verifyButton: {
    width: '100%',
  },

  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 24,
    paddingVertical: 8,
  },
  backButtonText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '500',
  },

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

export default LoginScreen;