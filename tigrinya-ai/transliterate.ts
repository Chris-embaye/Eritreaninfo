// Tigrinya Ge'ez fidel — 33 consonant families × 7 vowel orders
const FIDEL: string[][] = [
  ['ሀ','ሁ','ሂ','ሃ','ሄ','ህ','ሆ'], //  0 h
  ['ለ','ሉ','ሊ','ላ','ሌ','ል','ሎ'], //  1 l
  ['ሐ','ሑ','ሒ','ሓ','ሔ','ሕ','ሖ'], //  2 hh (pharyngeal)
  ['መ','ሙ','ሚ','ማ','ሜ','ም','ሞ'], //  3 m
  ['ሠ','ሡ','ሢ','ሣ','ሤ','ሥ','ሦ'], //  4 S' (archaic)
  ['ረ','ሩ','ሪ','ራ','ሬ','ር','ሮ'], //  5 r
  ['ሰ','ሱ','ሲ','ሳ','ሴ','ስ','ሶ'], //  6 s
  ['ሸ','ሹ','ሺ','ሻ','ሼ','ሽ','ሾ'], //  7 sh
  ['ቀ','ቁ','ቂ','ቃ','ቄ','ቅ','ቆ'], //  8 q
  ['ቐ','ቑ','ቒ','ቓ','ቔ','ቕ','ቖ'], //  9 Q
  ['በ','ቡ','ቢ','ባ','ቤ','ብ','ቦ'], // 10 b
  ['ቨ','ቩ','ቪ','ቫ','ቬ','ቭ','ቮ'], // 11 v
  ['ተ','ቱ','ቲ','ታ','ቴ','ት','ቶ'], // 12 t
  ['ቸ','ቹ','ቺ','ቻ','ቼ','ች','ቾ'], // 13 ch / c
  ['ነ','ኑ','ኒ','ና','ኔ','ን','ኖ'], // 14 n
  ['ኘ','ኙ','ኚ','ኛ','ኜ','ኝ','ኞ'], // 15 ny / gn
  ['አ','ኡ','ኢ','ኣ','ኤ','እ','ኦ'], // 16 vowel-initial (glottal)
  ['ከ','ኩ','ኪ','ካ','ኬ','ክ','ኮ'], // 17 k
  ['ኸ','ኹ','ኺ','ኻ','ኼ','ኽ','ኾ'], // 18 kh
  ['ወ','ዉ','ዊ','ዋ','ዌ','ው','ዎ'], // 19 w
  ['ዐ','ዑ','ዒ','ዓ','ዔ','ዕ','ዖ'], // 20 vowel-initial (pharyngeal ayin)
  ['ዘ','ዙ','ዚ','ዛ','ዜ','ዝ','ዞ'], // 21 z
  ['ዠ','ዡ','ዢ','ዣ','ዤ','ዥ','ዦ'], // 22 zh
  ['የ','ዩ','ዪ','ያ','ዬ','ይ','ዮ'], // 23 y
  ['ደ','ዱ','ዲ','ዳ','ዴ','ድ','ዶ'], // 24 d
  ['ጀ','ጁ','ጂ','ጃ','ጄ','ጅ','ጆ'], // 25 j
  ['ገ','ጉ','ጊ','ጋ','ጌ','ግ','ጎ'], // 26 g
  ['ጠ','ጡ','ጢ','ጣ','ጤ','ጥ','ጦ'], // 27 T (ejective)
  ['ጨ','ጩ','ጪ','ጫ','ጬ','ጭ','ጮ'], // 28 C (ejective ch)
  ['ጰ','ጱ','ጲ','ጳ','ጴ','ጵ','ጶ'], // 29 P (ejective)
  ['ጸ','ጹ','ጺ','ጻ','ጼ','ጽ','ጾ'], // 30 ts / S'
  ['ፈ','ፉ','ፊ','ፋ','ፌ','ፍ','ፎ'], // 31 f
  ['ፐ','ፑ','ፒ','ፓ','ፔ','ፕ','ፖ'], // 32 p
];

// Longer patterns MUST come before shorter ones that share a prefix
const CONS_PATTERNS: [string, number][] = [
  ['sh', 7], ['ch', 13], ['ny', 15], ['gn', 15],
  ['kh', 18], ['zh', 22], ['ts', 30],
  ['l', 1], ['m', 3], ['r', 5], ['s', 6], ['q', 8],
  ['b', 10], ['v', 11], ['t', 12], ['c', 13], ['n', 14],
  ['k', 17], ['w', 19], ['z', 21], ['y', 23], ['d', 24],
  ['j', 25], ['g', 26], ['f', 31], ['p', 32],
];

const VOWEL_SET = new Set(['a', 'e', 'i', 'o', 'u']);

function vowelIdx(v: string): number {
  switch (v) {
    case 'e':            return 0;
    case 'u':            return 1;
    case 'i':            return 2;
    case 'a':            return 3;
    case 'ie': case 'ee': return 4;
    case 'o':            return 6;
    default:             return 5; // 6th order — bare consonant
  }
}

// hRow: which row to use for standalone 'h' (0 = glottal ሀ, 2 = pharyngeal ሓ)
// initRow: which row to use for vowel-initial syllables (16 = አ, 20 = ዐ)
function romanToFidel(roman: string, hRow: number, initRow: number): string {
  let result = '';
  let i = 0;
  const s = roman.toLowerCase();

  while (i < s.length) {
    let row = -1;
    let consLen = 0;

    if (VOWEL_SET.has(s[i])) {
      row = initRow;
      consLen = 0;
    } else if (s[i] === 'h') {
      row = hRow;
      consLen = 1;
    } else {
      for (const [pat, r] of CONS_PATTERNS) {
        if (s.startsWith(pat, i)) { row = r; consLen = pat.length; break; }
      }
    }

    if (row === -1) { result += s[i++]; continue; }

    i += consLen;

    // Match vowel — try two-char digraphs first
    let vowel = '';
    if (i < s.length) {
      if (s.startsWith('ie', i) || s.startsWith('ee', i)) {
        vowel = s.slice(i, i + 2); i += 2;
      } else if (VOWEL_SET.has(s[i])) {
        vowel = s[i++];
      }
    }

    result += FIDEL[row][vowelIdx(vowel)];
  }

  return result;
}

// Returns up to 3 unique fidel suggestions for a romanized word
export function getSuggestions(word: string): string[] {
  if (!word || /[ሀ-᎟]/.test(word)) return [];

  const v1 = romanToFidel(word, 0, 16); // standard:    h=ሀ  init=አ
  const v2 = romanToFidel(word, 2, 20); // pharyngeal:  h=ሓ  init=ዐ
  const v3 = romanToFidel(word, 0, 20); // ayin-init:   h=ሀ  init=ዐ

  return [...new Set([v1, v2, v3])];
}
