import { useState, useRef, useEffect } from 'react';
import { TigrinyaKeyboard } from './TigrinyaKeyboard';
import { getSuggestions } from './transliterate';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { auth } from './firebaseConfig';
import { AuthScreen } from './AuthScreen';
import { TrainingPanel, loadTrainingExamples, TrainingExample } from './TrainingPanel';
import * as DocumentPicker from 'expo-document-picker';
import {
  StyleSheet, Text, View, TouchableOpacity, ScrollView,
  ActivityIndicator, SafeAreaView, Alert, TextInput,
  KeyboardAvoidingView, Platform, Modal, Animated,
} from 'react-native';
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';
import * as FileSystem from 'expo-file-system/legacy';

const FREE_DAILY_LIMIT = 5;
const KEY_USAGE   = 'hadas_usage';
const KEY_PREMIUM = 'hadas_premium';

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
// Faster models — text uses lite, audio uses standard flash
const GEMINI_URL_TEXT  = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
const GEMINI_URL_AUDIO = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

const PHONETIC_RULES = `For the [Speak] field, write syllable-by-syllable phonetics separated by hyphens so English TTS sounds like Tigrinya. Rules:
- Vowels: a=ah, e=uh, i=ee, o=oh, u=oo (Italian-style, never silent)
- ሓ/ሕ=hah (guttural), ዐ/ዕ=ah (from throat), ቀ/ቅ=kah (back of mouth)
- Ejectives: ጠ=ttah, ጸ=tsah, ጨ=tchah
- ሽ=sh, ቸ=ch, ኝ=nyuh, ዝ=z
- Example: ሰላም="suh-lahm", ሓደ="hah-duh", ከመይ="kuh-mey"`;

const SYSTEM_PROMPT = `You are Hadas (ሓዳስ), a Tigrinya AI assistant created by Chris Embaye. Never mention Google or Gemini. Do not add any explanation or preamble.
The user spoke in Tigrinya. Respond ONLY with this exact format and nothing else:
[What you heard]: <Tigrinya script here>
[Response]: <Tigrinya script here>
[Speak]: <phonetics here — ${PHONETIC_RULES}>`;

const GEN_CONFIG = { maxOutputTokens: 400, thinkingConfig: { thinkingBudget: 0 } };

type Message = {
  role: 'user' | 'ai';
  text: string;
  speak?: string;
  time: string;
};

function nowTime() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

async function askGemini(
  audioBase64: string,
  history: Message[],
  mimeType = 'audio/mp4'
): Promise<{ heard: string; response: string; speak: string }> {
  const pastContents = history.slice(-4).map(m => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: m.text }],
  }));

  const body = {
    contents: [
      ...pastContents,
      {
        role: 'user',
        parts: [
          { inline_data: { mime_type: mimeType, data: audioBase64 } },
          { text: SYSTEM_PROMPT },
        ],
      },
    ],
    generationConfig: GEN_CONFIG,
  };

  const res = await fetch(GEMINI_URL_AUDIO, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`Gemini error: ${await res.text()}`);

  const json = await res.json();
  const text: string = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

  const heardMatch    = text.match(/\[What you heard\]:\s*(.+?)(?=\[Response\]|$)/s);
  const responseMatch = text.match(/\[Response\]:\s*(.+?)(?=\[Speak\]|$)/s);
  const speakMatch    = text.match(/\[Speak\]:\s*(.+)/s);

  return {
    heard:    heardMatch?.[1]?.trim() ?? '...',
    response: responseMatch?.[1]?.trim() ?? text,
    speak:    speakMatch?.[1]?.trim() ?? responseMatch?.[1]?.trim() ?? text,
  };
}

async function askGeminiText(
  userText: string,
  history: Message[]
): Promise<{ response: string; speak: string }> {
  const pastContents = history.slice(-4).map(m => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: m.text }],
  }));

  const body = {
    contents: [
      ...pastContents,
      {
        role: 'user',
        parts: [{ text: `You are Hadas (ሓዳስ), a Tigrinya AI assistant created by Chris Embaye. Never mention Google or Gemini. Do not add any explanation or preamble.
The user said: "${userText}"
Respond ONLY with this exact format and nothing else:
[Response]: <Tigrinya script here>
[Speak]: <phonetics here — ${PHONETIC_RULES}>` }],
      },
    ],
    generationConfig: GEN_CONFIG,
  };

  const res = await fetch(GEMINI_URL_TEXT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`Gemini error: ${await res.text()}`);

  const json = await res.json();
  const text: string = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

  const responseMatch = text.match(/\[Response\]:\s*(.+?)(?=\[Speak\]|$)/s);
  const speakMatch    = text.match(/\[Speak\]:\s*(.+)/s);

  return {
    response: responseMatch?.[1]?.trim() ?? text,
    speak:    speakMatch?.[1]?.trim() ?? responseMatch?.[1]?.trim() ?? text,
  };
}

export default function App() {
  const [user, setUser]                 = useState<User | null | undefined>(undefined);
  const [isListening, setIsListening]   = useState(false);
  const [isThinking, setIsThinking]     = useState(false);
  const [isSpeaking, setIsSpeaking]     = useState(false);
  const [messages, setMessages]         = useState<Message[]>([]);
  const [status, setStatus]             = useState('Tap the mic to speak in Tigrinya');
  const [replayingIdx, setReplayingIdx] = useState<number | null>(null);
  const [textInput, setTextInput]           = useState('');
  const [inputFocused, setInputFocused]     = useState(false);
  const [showTigrinyaKb, setShowTigrinyaKb] = useState(false);
  const [voices, setVoices]                 = useState<Speech.Voice[]>([]);
  const [voiceId, setVoiceId]               = useState<string | undefined>(undefined);
  const [showVoices, setShowVoices]         = useState(false);
  const [showTraining, setShowTraining]     = useState(false);
  const [trainingExamples, setTrainingExamples] = useState<TrainingExample[]>([]);
  const isAdmin = user?.email === 'embayechris@gmail.com';
  const [isPremium, setIsPremium]     = useState(false);
  const [usageCount, setUsageCount]   = useState(0);
  const [showPaywall, setShowPaywall] = useState(false);

  const scrollRef    = useRef<ScrollView>(null);
  const textInputRef = useRef<TextInput>(null);
  const activeRecRef = useRef<Audio.Recording | null>(null);
  const isProcessing = useRef(false);
  const messagesRef  = useRef<Message[]>([]);

  // Tweak 4: pulse animation for mic
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (isListening) {
      pulseLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.55, duration: 700, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1,    duration: 700, useNativeDriver: true }),
        ])
      );
      pulseLoop.current.start();
    } else {
      pulseLoop.current?.stop();
      pulseAnim.setValue(1);
    }
  }, [isListening]);

  useEffect(() => { messagesRef.current = messages; }, [messages]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => setUser(u));
    return unsub;
  }, []);

  useEffect(() => { loadTrainingExamples().then(setTrainingExamples); }, []);

  useEffect(() => {
    AsyncStorage.multiGet([KEY_PREMIUM, KEY_USAGE]).then(([[, prem], [, usage]]) => {
      if (prem === 'true') setIsPremium(true);
      if (usage) {
        const { date, count } = JSON.parse(usage);
        if (date === new Date().toDateString()) setUsageCount(count);
      }
    });
  }, []);

  async function checkQuota(): Promise<boolean> {
    if (user?.email === 'embayechris@gmail.com') return true;
    const prem = await AsyncStorage.getItem(KEY_PREMIUM);
    if (prem === 'true') return true;
    const raw   = await AsyncStorage.getItem(KEY_USAGE);
    const today = new Date().toDateString();
    const { date, count } = raw ? JSON.parse(raw) : { date: '', count: 0 };
    const todayCount = date === today ? count : 0;
    if (todayCount >= FREE_DAILY_LIMIT) { setShowPaywall(true); return false; }
    const next = todayCount + 1;
    await AsyncStorage.setItem(KEY_USAGE, JSON.stringify({ date: today, count: next }));
    setUsageCount(next);
    return true;
  }

  useEffect(() => {
    Speech.getAvailableVoicesAsync().then(all => {
      const sorted = [
        ...all.filter(v => v.language.startsWith('ti') || v.language.startsWith('am')),
        ...all.filter(v => v.language.startsWith('en')),
      ];
      setVoices(sorted.length > 0 ? sorted : all);
    });
  }, []);

  function doSpeak(text: string, onDone: () => void, onError: () => void) {
    Speech.speak(text, { voice: voiceId, language: voiceId ? undefined : 'en', rate: 0.82, onDone, onError });
  }

  async function uploadAndSend() {
    if (!await checkQuota()) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setIsThinking(true);
      setStatus('Reading file…');
      const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
      setStatus('Processing…');
      const mimeType = asset.mimeType || 'audio/mpeg';
      const { heard, response, speak: phonetic } = await askGemini(base64, messagesRef.current, mimeType);
      const t = nowTime();
      setMessages(cur => [...cur,
        { role: 'user', text: `🎵 ${asset.name}\n${heard}`, time: t },
        { role: 'ai',   text: response, speak: phonetic, time: t },
      ]);
      setIsThinking(false);
      setIsSpeaking(true);
      setStatus('Speaking…');
      doSpeak(phonetic,
        () => { setIsSpeaking(false); setStatus('Tap the mic to speak in Tigrinya'); },
        () => { setIsSpeaking(false); setStatus('Tap the mic to speak in Tigrinya'); },
      );
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e: any) {
      setIsThinking(false);
      setStatus(`Error: ${e?.message ?? 'please try again'}`);
    }
  }

  const lastWord    = (textInput.split(/\s+/).pop() ?? '').trim();
  const suggestions = getSuggestions(lastWord);

  function applySuggestion(word: string) {
    setTextInput(prev => {
      const parts = prev.split(/(\s+)/);
      for (let i = parts.length - 1; i >= 0; i--) {
        if (parts[i].trim()) { parts[i] = word; break; }
      }
      return parts.join('');
    });
    setTimeout(() => textInputRef.current?.focus(), 50);
  }

  async function startRecording() {
    if (isProcessing.current || isListening) return;
    if (!await checkQuota()) return;
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) { setStatus('Microphone permission denied'); return; }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording: rec } = await Audio.Recording.createAsync({
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
        isMeteringEnabled: true,
      });
      activeRecRef.current = rec;
      setIsListening(true);
      setStatus('Listening… tap to stop');
      let silenceStart: number | null = null;
      rec.setOnRecordingStatusUpdate(s => {
        if (!s.isRecording) return;
        const db = s.metering ?? -160;
        if (db < -40) {
          if (silenceStart === null) silenceStart = Date.now();
          else if (Date.now() - silenceStart > 2000) { rec.setOnRecordingStatusUpdate(null); doStop(rec); }
        } else { silenceStart = null; }
      });
    } catch { setStatus('Failed to start recording'); }
  }

  async function doStop(rec: Audio.Recording) {
    if (isProcessing.current) return;
    isProcessing.current = true;
    rec.setOnRecordingStatusUpdate(null);
    activeRecRef.current = null;
    setIsListening(false);
    setIsThinking(true);
    setStatus('Processing…');
    try {
      await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      if (!uri) throw new Error('No audio recorded');
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      const { heard, response, speak: phonetic } = await askGemini(base64, messagesRef.current);
      const t = nowTime();
      setMessages(cur => [...cur,
        { role: 'user', text: heard, time: t },
        { role: 'ai',   text: response, speak: phonetic, time: t },
      ]);
      setIsThinking(false);
      setIsSpeaking(true);
      setStatus('Speaking…');
      doSpeak(phonetic,
        () => { setIsSpeaking(false); setStatus('Tap the mic to speak in Tigrinya'); },
        () => { setIsSpeaking(false); setStatus('Tap the mic to speak in Tigrinya'); },
      );
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e: any) {
      setIsThinking(false);
      setStatus(`Error: ${e?.message ?? 'please try again'}`);
    } finally { isProcessing.current = false; }
  }

  async function sendText() {
    const text = textInput.trim();
    if (!text || isThinking || isSpeaking || isListening) return;
    if (!await checkQuota()) return;
    setTextInput('');
    setIsThinking(true);
    setStatus('Processing…');
    try {
      const { response, speak: phonetic } = await askGeminiText(text, messagesRef.current);
      const t = nowTime();
      setMessages(cur => [...cur,
        { role: 'user', text, time: t },
        { role: 'ai',   text: response, speak: phonetic, time: t },
      ]);
      setIsThinking(false);
      setIsSpeaking(true);
      setStatus('Speaking…');
      doSpeak(phonetic,
        () => { setIsSpeaking(false); setStatus('Tap the mic to speak in Tigrinya'); },
        () => { setIsSpeaking(false); setStatus('Tap the mic to speak in Tigrinya'); },
      );
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e: any) {
      setIsThinking(false);
      setStatus(`Error: ${e?.message ?? 'please try again'}`);
    }
  }

  function handleMicPress() {
    const rec = activeRecRef.current;
    if (isListening && rec) doStop(rec);
    else if (!isThinking && !isSpeaking) startRecording();
  }

  function replayMessage(msg: Message, idx: number) {
    if (!msg.speak || isSpeaking || isThinking || isListening) return;
    Speech.stop();
    setReplayingIdx(idx);
    doSpeak(msg.speak, () => setReplayingIdx(null), () => setReplayingIdx(null));
  }

  function clearChat() {
    Alert.alert('Clear Chat', 'Start a new conversation?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: () => {
        setMessages([]); Speech.stop(); setIsSpeaking(false);
        setReplayingIdx(null); setStatus('Tap the mic to speak in Tigrinya');
      }},
    ]);
  }

  if (user === undefined) return null;
  if (user === null) return <AuthScreen />;

  const remaining = FREE_DAILY_LIMIT - usageCount;

  // Tweak 2: live status dot color
  const dotColor = isListening ? '#ef4444' : (isThinking || isSpeaking) ? '#f97316' : '#4ade80';

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <SafeAreaView style={styles.container}>

      {/* Paywall */}
      <Modal visible={showPaywall} animationType="slide" transparent onRequestClose={() => setShowPaywall(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.paywallSheet}>
            <Text style={styles.paywallIcon}>🔒</Text>
            <Text style={styles.paywallTitle}>Free Limit Reached</Text>
            <Text style={styles.paywallSub}>You've used your {FREE_DAILY_LIMIT} free messages for today.{'\n'}Come back tomorrow or upgrade for unlimited access.</Text>
            <View style={styles.paywallPerks}>
              {['Unlimited voice & text messages', 'All future features included', 'Support Tigrinya AI development'].map((p, i) => (
                <Text key={i} style={styles.paywallPerk}>✓  {p}</Text>
              ))}
            </View>
            <TouchableOpacity style={styles.paywallBtn} onPress={async () => {
              await AsyncStorage.setItem(KEY_PREMIUM, 'true');
              setIsPremium(true); setShowPaywall(false);
            }}>
              <Text style={styles.paywallBtnText}>Upgrade to Premium  $4.99 / month</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowPaywall(false)} style={{ marginTop: 16 }}>
              <Text style={{ color: '#475569', textAlign: 'center' }}>Maybe later</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {isAdmin && (
        <TrainingPanel
          visible={showTraining}
          onClose={() => { setShowTraining(false); loadTrainingExamples().then(setTrainingExamples); }}
        />
      )}

      {/* Voice picker */}
      <Modal visible={showVoices} animationType="slide" transparent onRequestClose={() => setShowVoices(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowVoices(false)}>
          <View style={styles.voiceSheet} onStartShouldSetResponder={() => true}>
            <Text style={styles.voiceSheetTitle}>Choose a Voice</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {voices.map(v => {
                const active = voiceId === v.identifier;
                return (
                  <TouchableOpacity key={v.identifier} style={[styles.voiceRow, active && styles.voiceRowActive]}
                    onPress={() => { setVoiceId(v.identifier); Speech.stop(); Speech.speak('suh-lahm', { voice: v.identifier, rate: 0.82 }); }}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.voiceName, active && { color: '#4ade80' }]}>{v.name}</Text>
                      <Text style={styles.voiceLang}>{v.language}</Text>
                    </View>
                    {active && <Text style={{ color: '#4ade80', fontSize: 18 }}>✓</Text>}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity style={styles.voiceDone} onPress={() => setShowVoices(false)}>
              <Text style={styles.voiceDoneText}>Done</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Header */}
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <TouchableOpacity onPress={() => setShowVoices(true)} style={styles.headerBtn}>
            <Text style={styles.headerBtnIcon}>♪</Text>
          </TouchableOpacity>
          {isAdmin && (
            <TouchableOpacity onPress={() => setShowTraining(true)} style={styles.headerBtn}>
              <Text style={styles.headerBtnIcon}>✎</Text>
            </TouchableOpacity>
          )}
        </View>
        {/* Tweak 2: live status dot */}
        <View style={{ alignItems: 'center' }}>
          <Text style={styles.title}>ሓዳስ</Text>
          <View style={styles.subtitleRow}>
            <View style={[styles.statusDot, { backgroundColor: dotColor }]} />
            <Text style={styles.subtitle}>Hadas · Tigrinya AI</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <TouchableOpacity onPress={clearChat} style={styles.headerBtn}>
            <Text style={styles.headerBtnIcon}>⌫</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => signOut(auth)} style={styles.headerBtn}>
            <Text style={styles.headerBtnIcon}>↩</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Chat */}
      <ScrollView ref={scrollRef} style={styles.chat} contentContainerStyle={styles.chatContent} keyboardShouldPersistTaps="handled">

        {messages.length === 0 && !isThinking && (
          <Text style={styles.emptyText}>Your conversation will appear here</Text>
        )}

        {messages.map((msg, i) =>
          msg.role === 'user' ? (
            <View key={i} style={styles.userBubbleWrap}>
              <View style={styles.userBubble}>
                <Text style={styles.userBubbleText}>{msg.text}</Text>
              </View>
              {/* Tweak 5: timestamp */}
              <Text style={styles.timestamp}>{msg.time}</Text>
            </View>
          ) : (
            <TouchableOpacity key={i} activeOpacity={0.75} onPress={() => replayMessage(msg, i)} style={styles.aiBubbleRow}>
              <View style={[styles.aiAvatar, replayingIdx === i && styles.aiAvatarActive]}>
                <Text style={styles.aiAvatarText}>ሓ</Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.aiBubble}>
                  <Text style={styles.bubbleText}>{msg.text}</Text>
                  <Text style={styles.tapHint}>{replayingIdx === i ? '🔊 playing…' : '▶ tap to replay'}</Text>
                </View>
                {/* Tweak 5: timestamp */}
                <Text style={[styles.timestamp, { marginLeft: 4 }]}>{msg.time}</Text>
              </View>
            </TouchableOpacity>
          )
        )}

        {isThinking && (
          <View style={styles.aiBubbleRow}>
            <View style={styles.aiAvatar}>
              <Text style={styles.aiAvatarText}>ሓ</Text>
            </View>
            <View style={styles.aiBubble}>
              <ActivityIndicator color="#4ade80" size="small" />
            </View>
          </View>
        )}
      </ScrollView>

      {showTigrinyaKb && (
        <TigrinyaKeyboard
          onChar={ch => setTextInput(prev => prev + ch)}
          onBackspace={() => setTextInput(prev => prev.slice(0, -1))}
          onSpace={() => setTextInput(prev => prev + ' ')}
        />
      )}

      {/* Tweak 3: Footer with top separator */}
      <View style={styles.footer}>
        <View style={styles.footerSep} />

        <View style={styles.statusRow}>
          <Text style={styles.status}>{status}</Text>
          {!isPremium && !isAdmin && (
            <TouchableOpacity style={styles.quotaPill} onPress={() => setShowPaywall(true)}>
              <Text style={styles.quotaPillCount}>{remaining} left</Text>
              <View style={styles.quotaDivider} />
              <Text style={styles.quotaUpgrade}>Upgrade ↑</Text>
            </TouchableOpacity>
          )}
        </View>

        {isSpeaking && (
          <TouchableOpacity style={styles.stopBtn}
            onPress={() => { Speech.stop(); setIsSpeaking(false); setStatus('Tap the mic to speak in Tigrinya'); }}>
            <Text style={styles.stopBtnText}>■ Stop Speaking</Text>
          </TouchableOpacity>
        )}

        {suggestions.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={styles.sugBar} contentContainerStyle={styles.sugBarContent}>
            {suggestions.map((s, i) => (
              <TouchableOpacity key={i} style={styles.sugChip} onPress={() => applySuggestion(s)}>
                <Text style={styles.sugChipText}>{s}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        <View style={styles.inputRow}>
          <TouchableOpacity
            style={[styles.kbToggle, showTigrinyaKb && styles.kbToggleActive]}
            onPress={() => setShowTigrinyaKb(v => !v)}
          >
            <Text style={styles.kbToggleText}>ፊደል</Text>
          </TouchableOpacity>
          <TextInput
            ref={textInputRef}
            style={[styles.textInput, inputFocused && styles.textInputFocused]}
            value={textInput}
            onChangeText={setTextInput}
            placeholder="Type in Tigrinya or English…"
            placeholderTextColor="#475569"
            multiline={false}
            returnKeyType="send"
            onSubmitEditing={sendText}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            editable={!isThinking && !isSpeaking && !isListening}
            showSoftInputOnFocus={!showTigrinyaKb}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!textInput.trim() || isThinking || isSpeaking) && styles.sendBtnDisabled]}
            onPress={sendText}
            disabled={!textInput.trim() || isThinking || isSpeaking || isListening}
          >
            <Text style={styles.sendIcon}>➤</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.uploadFileBtn, (isThinking || isSpeaking || isListening) && styles.micDisabled]}
            onPress={uploadAndSend}
            disabled={isThinking || isSpeaking || isListening}
          >
            <Text style={{ fontSize: 20 }}>📎</Text>
          </TouchableOpacity>

          {/* Tweak 4: Mic with pulse ring */}
          <View style={styles.micWrap}>
            {isListening && (
              <Animated.View style={[styles.micRing, { transform: [{ scale: pulseAnim }] }]} />
            )}
            <TouchableOpacity
              style={[styles.mic, isListening && styles.micActive, (isThinking || isSpeaking) && styles.micDisabled]}
              onPress={handleMicPress}
              disabled={isThinking || isSpeaking}
            >
              <Text style={styles.micIcon}>{isListening ? '⏹' : '🎤'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

    </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#0f172a' },

  header:      { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title:       { fontSize: 28, fontWeight: 'bold', color: '#4ade80', letterSpacing: 2 },
  subtitleRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  statusDot:   { width: 7, height: 7, borderRadius: 4 },
  subtitle:    { fontSize: 11, color: '#64748b' },
  headerBtn:   { width: 38, height: 38, borderRadius: 19, backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155', alignItems: 'center', justifyContent: 'center' },
  headerBtnIcon: { color: '#94a3b8', fontSize: 17, fontWeight: '700' },

  chat:        { flex: 1, paddingHorizontal: 16 },
  chatContent: { paddingVertical: 12, gap: 14, flexGrow: 1 },

  // Tweak 1: empty state
  emptyState:     { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60, gap: 14 },
  emptyAvatar:    { width: 80, height: 80, borderRadius: 40, backgroundColor: '#1e3a5f', borderWidth: 2, borderColor: '#4ade80', alignItems: 'center', justifyContent: 'center' },
  emptyAvatarText:{ color: '#4ade80', fontSize: 32, fontWeight: '800' },
  emptyTitle:     { color: '#e2e8f0', fontSize: 22, fontWeight: '700' },
  emptySubtitle:  { color: '#64748b', fontSize: 14, textAlign: 'center', lineHeight: 22 },

  aiBubbleRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  aiAvatar:     { width: 34, height: 34, borderRadius: 17, backgroundColor: '#1e3a5f', borderWidth: 1.5, borderColor: '#4ade80', alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  aiAvatarActive: { backgroundColor: '#14532d' },
  aiAvatarText: { color: '#4ade80', fontSize: 14, fontWeight: '800' },
  aiBubble:     { backgroundColor: '#1e293b', borderRadius: 16, borderTopLeftRadius: 4, padding: 14, borderWidth: 1, borderColor: '#334155', flexShrink: 1 },
  bubbleText:   { color: '#e2e8f0', fontSize: 16, lineHeight: 24 },
  tapHint:      { color: '#475569', fontSize: 11, marginTop: 6, fontStyle: 'italic' },

  userBubbleWrap: { alignSelf: 'flex-end', alignItems: 'flex-end', gap: 3, maxWidth: '80%' },
  userBubble:     { backgroundColor: '#4ade80', borderRadius: 16, borderBottomRightRadius: 4, padding: 14 },
  userBubbleText: { color: '#0f172a', fontSize: 16, lineHeight: 24, fontWeight: '600' },

  // Tweak 5: timestamps
  timestamp:    { color: '#334155', fontSize: 10 },

  // Tweak 3: footer separator
  footer:      { paddingHorizontal: 16, paddingBottom: 12, paddingTop: 8, alignItems: 'center', gap: 10 },
  footerSep:   { height: 1, backgroundColor: '#1e293b', width: '100%', marginBottom: 2 },

  statusRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' },
  status:      { color: '#64748b', fontSize: 13, flex: 1 },
  quotaPill:   { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e293b', borderRadius: 20, borderWidth: 1, borderColor: '#f97316', paddingHorizontal: 10, paddingVertical: 5, gap: 8 },
  quotaPillCount: { color: '#f97316', fontSize: 12, fontWeight: '700' },
  quotaDivider:   { width: 1, height: 12, backgroundColor: '#f97316', opacity: 0.4 },
  quotaUpgrade:   { color: '#f97316', fontSize: 12, fontWeight: '700' },

  stopBtn:     { backgroundColor: '#ef4444', paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20 },
  stopBtnText: { color: '#fff', fontWeight: '600' },

  // Tweak 4: mic pulse
  micWrap:     { position: 'relative', width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  micRing:     { position: 'absolute', width: 44, height: 44, borderRadius: 22, backgroundColor: '#ef4444', opacity: 0.3 },
  mic:         { width: 44, height: 44, borderRadius: 22, backgroundColor: '#4ade80', alignItems: 'center', justifyContent: 'center', shadowColor: '#4ade80', shadowOpacity: 0.4, shadowRadius: 12, elevation: 6 },
  micActive:   { backgroundColor: '#ef4444', shadowColor: '#ef4444' },
  micDisabled: { backgroundColor: '#334155', shadowColor: 'transparent' },
  micIcon:     { fontSize: 20 },

  inputRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, width: '100%', paddingHorizontal: 4 },
  textInput:        { flex: 1, backgroundColor: '#1e293b', color: '#e2e8f0', borderRadius: 24, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, borderWidth: 1, borderColor: '#334155' },
  textInputFocused: { borderColor: '#4ade80', shadowColor: '#4ade80', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } },
  sendBtn:          { width: 44, height: 44, borderRadius: 22, backgroundColor: '#4ade80', alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled:  { backgroundColor: '#334155' },
  sendIcon:         { color: '#0f172a', fontSize: 18, fontWeight: 'bold' },
  uploadFileBtn:    { width: 44, height: 44, borderRadius: 12, backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155', alignItems: 'center', justifyContent: 'center' },
  kbToggle:         { width: 44, height: 44, borderRadius: 10, backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155', alignItems: 'center', justifyContent: 'center' },
  kbToggleActive:   { backgroundColor: '#1e3a5f', borderColor: '#4ade80' },
  kbToggleText:     { color: '#94a3b8', fontSize: 13, fontWeight: '700' },

  modalOverlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  paywallSheet:    { backgroundColor: '#1e293b', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 28, alignItems: 'center' },
  paywallIcon:     { fontSize: 48, marginBottom: 12 },
  paywallTitle:    { color: '#e2e8f0', fontSize: 22, fontWeight: '800', marginBottom: 8, textAlign: 'center' },
  paywallSub:      { color: '#94a3b8', fontSize: 14, textAlign: 'center', lineHeight: 21, marginBottom: 20 },
  paywallPerks:    { alignSelf: 'stretch', gap: 8, marginBottom: 24 },
  paywallPerk:     { color: '#4ade80', fontSize: 14 },
  paywallBtn:      { backgroundColor: '#4ade80', borderRadius: 16, paddingVertical: 14, paddingHorizontal: 28, alignSelf: 'stretch', alignItems: 'center' },
  paywallBtnText:  { color: '#0f172a', fontWeight: '800', fontSize: 15 },
  voiceSheet:      { backgroundColor: '#1e293b', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '70%' },
  voiceSheetTitle: { color: '#e2e8f0', fontSize: 18, fontWeight: '700', marginBottom: 16, textAlign: 'center' },
  voiceRow:        { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 10, borderRadius: 10, marginBottom: 4 },
  voiceRowActive:  { backgroundColor: '#0f3460' },
  voiceName:       { color: '#e2e8f0', fontSize: 15, fontWeight: '600' },
  voiceLang:       { color: '#64748b', fontSize: 12, marginTop: 2 },
  voiceDone:       { backgroundColor: '#4ade80', borderRadius: 14, paddingVertical: 12, marginTop: 12, alignItems: 'center' },
  voiceDoneText:   { color: '#0f172a', fontWeight: '700', fontSize: 16 },
  sugBar:          { width: '100%', maxHeight: 44 },
  sugBarContent:   { alignItems: 'center', paddingHorizontal: 4, gap: 8 },
  sugChip:         { backgroundColor: '#1e3a5f', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: '#3b82f6' },
  sugChipText:     { color: '#93c5fd', fontSize: 17, fontWeight: '600' },
});
