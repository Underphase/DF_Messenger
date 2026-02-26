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
} from '../hooks/login.hook';
import { AuthStackParamList } from '../navigation/types';
import { colors } from '../styles/colors';
import { useAuth } from '../context/AuthContext';

type Props = NativeStackScreenProps<AuthStackParamList, 'LoginScreen'>;

type AuthMode = 'login' | 'register';
type Screen = 'auth' | 'verify';

const LoginScreen: React.FC<Props> = ({ navigation }) => {
  // Auth state
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [screen, setScreen] = useState<Screen>('auth');
  const { signIn } = useAuth();

  // Form fields
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [verifyCode, setVerifyCode] = useState('');

  // UI state
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  // Timer for resend code
  const [timeLeft, setTimeLeft] = useState(0);
  const [canResend, setCanResend] = useState(false);

  // Input ref for code verification
  const codeInputRef = useRef<TextInput>(null);

  // API hooks
  const registerMutation = useRegister();
  const loginMutation = useLogin();
  const verifyMutation = useVerify();
  const sendCodeMutation = useSendCode();

  // Animations
  const logoScale = useRef(new Animated.Value(0)).current;
  const logoRotate = useRef(new Animated.Value(0)).current;
  const formOpacity = useRef(new Animated.Value(0)).current;
  const formTranslateY = useRef(new Animated.Value(30)).current;

  // Username field animation
  const usernameOpacity = useRef(
    new Animated.Value(authMode === 'register' ? 1 : 0),
  ).current;
  const usernameHeight = useRef(
    new Animated.Value(authMode === 'register' ? 80 : 0),
  ).current;

  // Tab indicator animation
  const tabIndicatorPosition = useRef(
    new Animated.Value(authMode === 'login' ? 0 : 1),
  ).current;

  // Cursor blink animation
  const cursorOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Start cursor blinking animation
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
    // Logo animation
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

    // Form animation
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

  // Animate username field when switching modes
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
      const pendingEmail = await AsyncStorage.getItem(
        'pending_verification_email',
      );
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

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email) && email.length <= 320;
  };

  const validatePassword = (password: string): boolean => {
    return password.length >= 8 && password.length <= 70;
  };

  const validateUsername = (username: string): boolean => {
    return username.length > 0 && username.length <= 30;
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
        await AsyncStorage.setItem(
          'verification_expires_at',
          expiresAt.toString(),
        );

        setTimeLeft(response.expiresIn);
        setCanResend(false);
        setScreen('verify');
      } else {
        const response = await loginMutation.mutateAsync({
          email,
          password,
        });

        await AsyncStorage.setItem('pending_verification_email', email);
        const expiresAt = Date.now() + response.expiresIn * 1000;
        await AsyncStorage.setItem(
          'verification_expires_at',
          expiresAt.toString(),
        );

        setTimeLeft(response.expiresIn);
        setCanResend(false);
        setScreen('verify');
      }
    } catch (error: any) {
      setErrors({
        api: error?.response?.data?.message || 'Ошибка при отправке',
      });
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
    if (!canResend) {
      console.log('Cannot resend - timer not expired');
      return;
    }

    console.log('Resending code to:', email);
    setErrors({}); // Clear previous errors

    try {
      const response = await sendCodeMutation.mutateAsync({ email });
      console.log('Code resent successfully, expires in:', response.expiresIn);

      const expiresAt = Date.now() + response.expiresIn * 1000;
      await AsyncStorage.setItem(
        'verification_expires_at',
        expiresAt.toString(),
      );

      setTimeLeft(response.expiresIn);
      setCanResend(false);
    } catch (error: any) {
      console.error('Error resending code:', error);
      const errorMessage =
        error?.response?.data?.message ||
        error?.message ||
        'Ошибка при отправке кода';
      setErrors({ api: errorMessage });
    }
  };

  const handleCodeChange = (value: string) => {
    // Only allow digits
    const cleanValue = value.replace(/[^0-9]/g, '');

    // Limit to 6 digits
    const limitedValue = cleanValue.slice(0, 6);

    setVerifyCode(limitedValue);
    setErrors({});

    // Auto-submit when 6 digits are entered
    if (limitedValue.length === 6) {
      Keyboard.dismiss();
      // Auto-verify after small delay
      setTimeout(() => {
        handleVerifyWithCode(limitedValue);
      }, 200);
    }
  };

  const handleVerifyWithCode = async (code: string) => {
    if (code.length !== 6) {
      setErrors({ code: 'Введите 6-значный код' });
      return;
    }

    try {
      const response = await verifyMutation.mutateAsync({
        email,
        code,
      });

      // Save tokens
      await Keychain.setGenericPassword(
        'user',
        JSON.stringify({
          accessToken: response.accessToken,
          refreshToken: response.refreshToken,
        }),
      );

      // Clear pending verification
      await AsyncStorage.removeItem('pending_verification_email');
      await AsyncStorage.removeItem('verification_expires_at');

      signIn();
    } catch (error: any) {
      setErrors({ code: error?.response?.data?.message || 'Неверный код' });
      setVerifyCode('');
      codeInputRef.current?.focus();
    }
  };

  const switchAuthMode = (mode: AuthMode) => {
    setAuthMode(mode);
    setErrors({});
    setPassword('');
    if (mode === 'login') {
      setUsername('');
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const isLoading =
    registerMutation.isPending ||
    loginMutation.isPending ||
    verifyMutation.isPending;

  const logoRotateInterpolate = logoRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

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
          <View style={styles.logoCircle}>
            <Icon name="message-circle" size={48} color={colors.primary} />
          </View>
        </Animated.View>

        <Animated.View style={{ opacity: formOpacity }}>
          <Text style={styles.logoText}>DF Messenger</Text>
          <Text style={styles.logoSubtext}>
            {screen === 'auth' ? 'Добро пожаловать' : 'Проверьте вашу почту'}
          </Text>
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
            <View style={styles.modeSwitcher}>
              {/* Animated background indicator */}
              <Animated.View
                style={[
                  styles.modeIndicator,
                  {
                    transform: [
                      {
                        translateX: tabIndicatorPosition.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, 180], // Adjust based on button width
                        }),
                      },
                    ],
                  },
                ]}
              />

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
              <View
                style={[
                  styles.inputContainer,
                  errors.email && styles.inputError,
                ]}
              >
                <Icon
                  name="mail"
                  size={20}
                  color={colors.primary}
                  style={styles.inputIcon}
                />
                <TextInput
                  value={email}
                  onChangeText={text => {
                    setEmail(text);
                    setErrors({ ...errors, email: '' });
                  }}
                  style={styles.input}
                  placeholder="Email"
                  placeholderTextColor={colors.primary + '80'}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
              {errors.email && (
                <Text style={styles.errorText}>{errors.email}</Text>
              )}
            </View>

            {/* Username Input (Register only) - Animated */}
            <Animated.View
              style={[
                styles.inputWrapper,
                {
                  opacity: usernameOpacity,
                  height: usernameHeight,
                  overflow: 'hidden',
                },
              ]}
            >
              <View
                style={[
                  styles.inputContainer,
                  errors.username && styles.inputError,
                ]}
              >
                <Icon
                  name="user"
                  size={20}
                  color={colors.primary}
                  style={styles.inputIcon}
                />
                <TextInput
                  value={username}
                  onChangeText={text => {
                    setUsername(text);
                    setErrors({ ...errors, username: '' });
                  }}
                  style={styles.input}
                  placeholder="Имя пользователя"
                  placeholderTextColor={colors.primary + '80'}
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={authMode === 'register'}
                />
              </View>
              {errors.username && (
                <Text style={styles.errorText}>{errors.username}</Text>
              )}
            </Animated.View>

            {/* Password Input */}
            <View style={styles.inputWrapper}>
              <View
                style={[
                  styles.inputContainer,
                  errors.password && styles.inputError,
                ]}
              >
                <Icon
                  name="lock"
                  size={20}
                  color={colors.primary}
                  style={styles.inputIcon}
                />
                <TextInput
                  value={password}
                  onChangeText={text => {
                    setPassword(text);
                    setErrors({ ...errors, password: '' });
                  }}
                  style={[styles.input, styles.passwordInput]}
                  placeholder="Пароль"
                  placeholderTextColor={colors.primary + '80'}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                >
                  <Icon
                    name={showPassword ? 'eye-off' : 'eye'}
                    size={20}
                    color={colors.primary}
                  />
                </TouchableOpacity>
              </View>
              {errors.password && (
                <Text style={styles.errorText}>{errors.password}</Text>
              )}
            </View>

            {/* API Error */}
            {errors.api && (
              <View>
                <Text style={styles.apiErrorText}>{errors.api}</Text>
              </View>
            )}

            {/* Submit Button */}
            <TouchableOpacity
              style={[
                styles.submitButton,
                isLoading && styles.submitButtonDisabled,
              ]}
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

            {/* Code Inputs */}
            <TouchableOpacity
              style={styles.codeContainer}
              onPress={() => codeInputRef.current?.focus()}
              activeOpacity={1}
            >
              {/* Visual boxes */}
              {[0, 1, 2, 3, 4, 5].map(index => {
                const isFilled = verifyCode[index];
                const isActive =
                  index === verifyCode.length && verifyCode.length < 6;

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
                    <Text style={styles.codeBoxText}>
                      {verifyCode[index] || ''}
                    </Text>
                    {/* Blinking cursor for active box */}
                    {isActive && !isFilled && (
                      <Animated.View
                        style={[styles.cursor, { opacity: cursorOpacity }]}
                      />
                    )}
                  </View>
                );
              })}

              {/* Hidden input that does the actual work */}
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

            {errors.code && (
              <View>
                <Text style={styles.errorText}>{errors.code}</Text>
              </View>
            )}

            {/* Timer and Resend Button combined */}
            <View style={styles.timerSection}>
              <View style={styles.timerContainer}>
                <Icon name="clock" size={16} color={colors.primary} />
                <Text style={styles.timerText}>
                  {timeLeft > 0 ? formatTime(timeLeft) : 'Время истекло'}
                </Text>
              </View>

              {/* Resend Button - only show when timer expired */}
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
                        <Icon
                          name="rotate-cw"
                          size={16}
                          color={colors.accent}
                        />
                        <Text style={styles.resendButtonText}>
                          Отправить заново
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* API Error for resend */}
            {errors.api && (
              <View style={{ marginBottom: 16 }}>
                <Text style={styles.errorText}>{errors.api}</Text>
              </View>
            )}

            {/* Verify Button */}
            <View style={styles.verifyButtonContainer}>
              <TouchableOpacity
                style={[
                  styles.submitButton,
                  styles.verifyButton,
                  (isLoading || verifyCode.length !== 6) &&
                    styles.submitButtonDisabled,
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

            {/* Back to auth */}
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => {
                setScreen('auth');
                setVerifyCode('');
                setErrors({});
              }}
              activeOpacity={0.7}
            >
              <Icon name="arrow-left" size={16} color={colors.primary} />
              <Text style={styles.backButtonText}>Назад к входу</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* Decorative elements */}
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
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
    paddingTop: 60,
    paddingBottom: 40,
  },

  // Logo
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

  // Form
  formContainer: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },

  // Mode Switcher
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
    width: '48%', // Approximately half minus padding
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

  // Inputs
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

  // Errors
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

  // Submit Button
  submitButton: {
    backgroundColor: colors.accent,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
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

  // Verification
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

  // Code Inputs
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

  // Timer
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

  // Resend Button
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

  // Verify Button
  verifyButtonContainer: {
    width: '100%',
    marginTop: 8,
  },
  verifyButton: {
    width: '100%',
  },

  // Back Button
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

export default LoginScreen;
