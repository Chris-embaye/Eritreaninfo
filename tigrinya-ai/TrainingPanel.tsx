import { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  Modal, ActivityIndicator, Alert,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Speech from 'expo-speech';
import AsyncStorage from '@react-native-async-storage/async-storage';

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
const KEY_TRAINING = 'hadas_training_examples';

export type TrainingExample = {
  id: string;
  tigrinya: string;
  phonetic: string;
  source: string;
  addedAt: string;
};

export async function loadTrainingExamples(): Promise<TrainingExample[]> {
  const raw = await AsyncStorage.getItem(KEY_TRAINING);
  return raw ? JSON.parse(raw) : [];
}

async function saveExample(ex: TrainingExample) {
  const all = await loadTrainingExamples();
  const updated = [ex, ...all].slice(0, 50); // keep max 50
  await AsyncStorage.setItem(KEY_TRAINING, JSON.stringify(updated));
}

async function deleteExample(id: string) {
  const all = await loadTrainingExamples();
  await AsyncStorage.setItem(KEY_TRAINING, JSON.stringify(all.filter(e => e.id !== id)));
}

async function transcribeAudio(base64: string, mimeType: string): Promise<{ tigrinya: string; phonetic: string }> {
  const body = {
    contents: [{
      role: 'user',
      parts: [
        { inline_data: { mime_type: mimeType, data: base64 } },
        { text: `Transcribe this Tigrinya audio exactly. Return ONLY a JSON object like:
{"tigrinya":"<Ge'ez script>","phonetic":"<syllable-hyphenated phonetics for English TTS, e.g. suh-lahm>"}` },
      ],
    }],
  };
  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('Transcription failed');
  const json = await res.json();
  const text: string = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
  const match = text.match(/\{.*\}/s);
  return match ? JSON.parse(match[0]) : { tigrinya: '...', phonetic: '...' };
}

type Props = { visible: boolean; onClose: () => void };

export function TrainingPanel({ visible, onClose }: Props) {
  const [examples, setExamples] = useState<TrainingExample[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (visible) loadTrainingExamples().then(setExamples);
  }, [visible]);

  async function handleUpload() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'audio/*',
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      setLoading(true);
      setStatus('Reading file…');

      const base64 = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      setStatus('Transcribing with Gemini…');
      const mimeType = asset.mimeType || 'audio/mpeg';
      const { tigrinya, phonetic } = await transcribeAudio(base64, mimeType);

      const ex: TrainingExample = {
        id: Date.now().toString(),
        tigrinya,
        phonetic,
        source: asset.name,
        addedAt: new Date().toLocaleDateString(),
      };

      await saveExample(ex);
      setExamples(prev => [ex, ...prev]);
      setStatus('');
    } catch (e: any) {
      setStatus(`Error: ${e?.message ?? 'Try again'}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    Alert.alert('Delete', 'Remove this training example?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await deleteExample(id);
        setExamples(prev => prev.filter(e => e.id !== id));
      }},
    ]);
  }

  function preview(ex: TrainingExample) {
    Speech.stop();
    Speech.speak(ex.phonetic, { language: 'en', rate: 0.8 });
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={s.container}>
        {/* Header */}
        <View style={s.header}>
          <Text style={s.title}>🎓 Tigrinya Training</Text>
          <TouchableOpacity onPress={onClose} style={s.closeBtn}>
            <Text style={s.closeTxt}>✕</Text>
          </TouchableOpacity>
        </View>

        <Text style={s.subtitle}>Upload Tigrinya audio → Gemini transcribes it → saved as training data used in every response</Text>

        {/* Upload button */}
        <TouchableOpacity style={s.uploadBtn} onPress={handleUpload} disabled={loading}>
          {loading
            ? <ActivityIndicator color="#0f172a" />
            : <Text style={s.uploadTxt}>📂  Upload Audio File</Text>
          }
        </TouchableOpacity>
        <Text style={s.hint}>Supports MP3, M4A, WAV, AAC — from Files, iCloud, Google Drive, etc.</Text>

        {status ? <Text style={s.status}>{status}</Text> : null}

        {/* Examples list */}
        <Text style={s.sectionTitle}>Saved Examples ({examples.length})</Text>
        <ScrollView style={s.list} showsVerticalScrollIndicator={false}>
          {examples.length === 0 && (
            <Text style={s.empty}>No examples yet. Upload audio to get started.</Text>
          )}
          {examples.map(ex => (
            <View key={ex.id} style={s.card}>
              <View style={{ flex: 1 }}>
                <Text style={s.cardTigrinya}>{ex.tigrinya}</Text>
                <Text style={s.cardPhonetic}>{ex.phonetic}</Text>
                <Text style={s.cardMeta}>{ex.source} · {ex.addedAt}</Text>
              </View>
              <View style={s.cardActions}>
                <TouchableOpacity onPress={() => preview(ex)} style={s.cardBtn}>
                  <Text style={{ color: '#4ade80', fontSize: 18 }}>🔊</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDelete(ex.id)} style={s.cardBtn}>
                  <Text style={{ color: '#ef4444', fontSize: 18 }}>🗑️</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#0f172a', paddingTop: 60, paddingHorizontal: 20 },
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title:        { color: '#e2e8f0', fontSize: 20, fontWeight: '800' },
  closeBtn:     { width: 36, height: 36, borderRadius: 18, backgroundColor: '#1e293b', alignItems: 'center', justifyContent: 'center' },
  closeTxt:     { color: '#94a3b8', fontSize: 16 },
  subtitle:     { color: '#64748b', fontSize: 13, lineHeight: 19, marginBottom: 20 },
  uploadBtn:    { backgroundColor: '#4ade80', borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginBottom: 8 },
  uploadTxt:    { color: '#0f172a', fontWeight: '800', fontSize: 16 },
  hint:         { color: '#475569', fontSize: 12, textAlign: 'center', marginBottom: 12 },
  status:       { color: '#f97316', fontSize: 13, textAlign: 'center', marginBottom: 8 },
  sectionTitle: { color: '#94a3b8', fontSize: 13, fontWeight: '700', marginBottom: 10, marginTop: 4 },
  list:         { flex: 1 },
  empty:        { color: '#475569', textAlign: 'center', marginTop: 40 },
  card:         { backgroundColor: '#1e293b', borderRadius: 12, padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#334155' },
  cardTigrinya: { color: '#e2e8f0', fontSize: 18, fontWeight: '700', marginBottom: 2 },
  cardPhonetic: { color: '#4ade80', fontSize: 13, fontStyle: 'italic', marginBottom: 4 },
  cardMeta:     { color: '#475569', fontSize: 11 },
  cardActions:  { flexDirection: 'row', gap: 8 },
  cardBtn:      { padding: 6 },
});
