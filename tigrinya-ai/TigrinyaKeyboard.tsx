import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';

// All 35 Tigrinya consonant families × 7 vowel orders
const FIDEL: string[][] = [
  ['ሀ','ሁ','ሂ','ሃ','ሄ','ህ','ሆ'],
  ['ለ','ሉ','ሊ','ላ','ሌ','ል','ሎ'],
  ['ሐ','ሑ','ሒ','ሓ','ሔ','ሕ','ሖ'],
  ['መ','ሙ','ሚ','ማ','ሜ','ም','ሞ'],
  ['ሠ','ሡ','ሢ','ሣ','ሤ','ሥ','ሦ'],
  ['ረ','ሩ','ሪ','ራ','ሬ','ር','ሮ'],
  ['ሰ','ሱ','ሲ','ሳ','ሴ','ስ','ሶ'],
  ['ሸ','ሹ','ሺ','ሻ','ሼ','ሽ','ሾ'],
  ['ቀ','ቁ','ቂ','ቃ','ቄ','ቅ','ቆ'],
  ['ቐ','ቑ','ቒ','ቓ','ቔ','ቕ','ቖ'],
  ['በ','ቡ','ቢ','ባ','ቤ','ብ','ቦ'],
  ['ቨ','ቩ','ቪ','ቫ','ቬ','ቭ','ቮ'],
  ['ተ','ቱ','ቲ','ታ','ቴ','ት','ቶ'],
  ['ቸ','ቹ','ቺ','ቻ','ቼ','ች','ቾ'],
  ['ነ','ኑ','ኒ','ና','ኔ','ን','ኖ'],
  ['ኘ','ኙ','ኚ','ኛ','ኜ','ኝ','ኞ'],
  ['አ','ኡ','ኢ','ኣ','ኤ','እ','ኦ'],
  ['ከ','ኩ','ኪ','ካ','ኬ','ክ','ኮ'],
  ['ኸ','ኹ','ኺ','ኻ','ኼ','ኽ','ኾ'],
  ['ወ','ዉ','ዊ','ዋ','ዌ','ው','ዎ'],
  ['ዐ','ዑ','ዒ','ዓ','ዔ','ዕ','ዖ'],
  ['ዘ','ዙ','ዚ','ዛ','ዜ','ዝ','ዞ'],
  ['ዠ','ዡ','ዢ','ዣ','ዤ','ዥ','ዦ'],
  ['የ','ዩ','ዪ','ያ','ዬ','ይ','ዮ'],
  ['ደ','ዱ','ዲ','ዳ','ዴ','ድ','ዶ'],
  ['ጀ','ጁ','ጂ','ጃ','ጄ','ጅ','ጆ'],
  ['ገ','ጉ','ጊ','ጋ','ጌ','ግ','ጎ'],
  ['ጠ','ጡ','ጢ','ጣ','ጤ','ጥ','ጦ'],
  ['ጨ','ጩ','ጪ','ጫ','ጬ','ጭ','ጮ'],
  ['ጰ','ጱ','ጲ','ጳ','ጴ','ጵ','ጶ'],
  ['ጸ','ጹ','ጺ','ጻ','ጼ','ጽ','ጾ'],
  ['ፈ','ፉ','ፊ','ፋ','ፌ','ፍ','ፎ'],
  ['ፐ','ፑ','ፒ','ፓ','ፔ','ፕ','ፖ'],
];

type Props = {
  onChar: (ch: string) => void;
  onBackspace: () => void;
  onSpace: () => void;
};

export function TigrinyaKeyboard({ onChar, onBackspace, onSpace }: Props) {
  return (
    <View style={s.container}>
      <ScrollView style={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="always">
        {FIDEL.map((row, ri) => (
          <View key={ri} style={s.row}>
            {row.map((ch, ci) => (
              <TouchableOpacity key={ci} style={s.key} onPress={() => onChar(ch)} activeOpacity={0.6}>
                <Text style={s.keyText}>{ch}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ))}
      </ScrollView>

      {/* Bottom utility row */}
      <View style={s.bottomRow}>
        <TouchableOpacity style={[s.key, s.utilKey]} onPress={onSpace}>
          <Text style={s.utilText}>space</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.key} onPress={() => onChar('፡')}>
          <Text style={s.keyText}>፡</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.key} onPress={() => onChar('።')}>
          <Text style={s.keyText}>።</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.key} onPress={() => onChar('፣')}>
          <Text style={s.keyText}>፣</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.key, s.backKey]} onPress={onBackspace}>
          <Text style={s.utilText}>⌫</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    backgroundColor: '#0f172a',
    borderTopWidth: 1,
    borderTopColor: '#334155',
    maxHeight: 230,
  },
  scroll: { flex: 1 },
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: 2,
    paddingHorizontal: 4,
    gap: 3,
  },
  key: {
    backgroundColor: '#1e293b',
    borderRadius: 6,
    paddingVertical: 7,
    paddingHorizontal: 4,
    minWidth: 38,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  keyText:  { color: '#e2e8f0', fontSize: 17 },
  bottomRow: {
    flexDirection: 'row',
    gap: 4,
    padding: 6,
    paddingHorizontal: 8,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },
  utilKey:  { flex: 1 },
  backKey:  { minWidth: 50 },
  utilText: { color: '#94a3b8', fontSize: 14, fontWeight: '600' },
});
