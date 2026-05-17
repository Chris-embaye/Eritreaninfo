import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, ActivityIndicator, KeyboardAvoidingView, Platform, Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { auth } from './firebaseConfig';

export function AuthScreen() {
  const [mode, setMode]         = useState<'signin' | 'signup'>('signin');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [info, setInfo]         = useState('');

  function switchMode(m: 'signin' | 'signup') {
    setMode(m);
    setError('');
    setInfo('');
  }

  async function handleSubmit() {
    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password');
      return;
    }
    setLoading(true);
    setError('');
    setInfo('');
    try {
      if (mode === 'signin') {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      } else {
        await createUserWithEmailAndPassword(auth, email.trim(), password);
      }
    } catch (e: any) {
      setError(friendlyError(e.code));
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword() {
    if (!email.trim()) { setError('Enter your email above first'); return; }
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setInfo('Password reset email sent — check your inbox');
      setError('');
    } catch (e: any) {
      setError(friendlyError(e.code));
    }
  }

  function friendlyError(code: string): string {
    switch (code) {
      case 'auth/user-not-found':
      case 'auth/invalid-credential':  return 'Incorrect email or password';
      case 'auth/wrong-password':      return 'Incorrect password';
      case 'auth/email-already-in-use': return 'An account with this email already exists';
      case 'auth/weak-password':        return 'Password must be at least 6 characters';
      case 'auth/invalid-email':        return 'Invalid email address';
      case 'auth/too-many-requests':    return 'Too many attempts — try again later';
      default:                          return 'Something went wrong, please try again';
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Tweak 4: Background gradient */}
      <LinearGradient colors={['#0a1628', '#0f172a', '#111827']} style={{ flex: 1 }}>
        <SafeAreaView style={s.container}>
          <View style={s.inner}>

            {/* Tweak 1: App icon above logo */}
            <View style={s.logoArea}>
              <Image
                source={require('./assets/icon.png')}
                style={s.iconImg}
                resizeMode="cover"
              />
              {/* Tweak 5: Bigger logo + letter spacing */}
              <Text style={s.logo}>ሓዳስ</Text>
              <Text style={s.logoSub}>
                Hadas <Text style={s.dot}>·</Text> Tigrinya AI
              </Text>
            </View>

            {/* Tabs */}
            <View style={s.tabs}>
              {(['signin', 'signup'] as const).map(m => (
                <TouchableOpacity
                  key={m}
                  style={[s.tab, mode === m && s.tabActive]}
                  onPress={() => switchMode(m)}
                >
                  <Text style={[s.tabText, mode === m && s.tabTextActive]}>
                    {m === 'signin' ? 'Sign In' : 'Create Account'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Inputs with icons — Tweak 2 */}
            <View style={s.form}>
              <View style={s.inputRow}>
                <Text style={s.inputIcon}>✉</Text>
                <TextInput
                  style={s.input}
                  placeholder="Email"
                  placeholderTextColor="#475569"
                  value={email}
                  onChangeText={t => { setEmail(t); setError(''); }}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
              <View style={s.inputRow}>
                <Text style={s.inputIcon}>🔒</Text>
                <TextInput
                  style={s.input}
                  placeholder="Password"
                  placeholderTextColor="#475569"
                  value={password}
                  onChangeText={t => { setPassword(t); setError(''); }}
                  secureTextEntry
                />
              </View>
            </View>

            {error ? <Text style={s.error}>{error}</Text> : null}
            {info  ? <Text style={s.info}>{info}</Text>  : null}

            {/* Tweak 3: Gradient button */}
            <TouchableOpacity onPress={handleSubmit} disabled={loading} activeOpacity={0.85}>
              <LinearGradient
                colors={['#4ade80', '#22d3ee']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={s.btn}
              >
                {loading
                  ? <ActivityIndicator color="#0f172a" />
                  : <Text style={s.btnText}>{mode === 'signin' ? 'Sign In' : 'Create Account'}</Text>
                }
              </LinearGradient>
            </TouchableOpacity>

            {mode === 'signin' && (
              <TouchableOpacity style={s.forgotBtn} onPress={handleForgotPassword}>
                <Text style={s.forgotText}>Forgot password?</Text>
              </TouchableOpacity>
            )}
          </View>
        </SafeAreaView>
      </LinearGradient>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container:    { flex: 1 },
  inner:        { flex: 1, justifyContent: 'center', paddingHorizontal: 28 },
  logoArea:     { alignItems: 'center', marginBottom: 40 },
  iconImg:      { width: 90, height: 90, borderRadius: 22, marginBottom: 16 },
  logo:         { fontSize: 64, fontWeight: 'bold', color: '#4ade80', letterSpacing: 8, marginBottom: 6 },
  logoSub:      { color: '#64748b', fontSize: 14, marginTop: 2 },
  dot:          { color: '#4ade80', fontWeight: 'bold' },
  tabs:         { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#1e293b', marginBottom: 28 },
  tab:          { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderColor: 'transparent', marginBottom: -1 },
  tabActive:    { borderColor: '#4ade80' },
  tabText:      { color: '#475569', fontWeight: '600', fontSize: 15 },
  tabTextActive:{ color: '#e2e8f0' },
  form:         { gap: 12, marginBottom: 10 },
  inputRow:     { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e293b', borderRadius: 14, borderWidth: 1, borderColor: '#334155', paddingHorizontal: 14 },
  inputIcon:    { fontSize: 16, marginRight: 10, opacity: 0.6 },
  input:        { flex: 1, color: '#e2e8f0', paddingVertical: 14, fontSize: 15 },
  error:        { color: '#ef4444', fontSize: 13, textAlign: 'center', marginBottom: 8 },
  info:         { color: '#4ade80', fontSize: 13, textAlign: 'center', marginBottom: 8 },
  btn:          { borderRadius: 16, paddingVertical: 15, alignItems: 'center', marginTop: 6, shadowColor: '#4ade80', shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  btnText:      { color: '#0f172a', fontWeight: '800', fontSize: 16 },
  forgotBtn:    { marginTop: 16, alignItems: 'center' },
  forgotText:   { color: '#475569', fontSize: 13 },
});
