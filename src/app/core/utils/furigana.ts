import { RubySegment } from '../services/grammar.service';

// Tách / gióng furigana cho dữ liệu Kanji & Từ vựng (cùng thuật toán với convert_grammar_quiz.py)

const KANJI = '\\u3400-\\u9fff\\uf900-\\ufaff々〆ヶ';
const RE_KANJI = new RegExp(`[${KANJI}]`);
const RE_TOKEN = new RegExp(`[${KANJI}]+|[ぁ-んァ-ヶー]`, 'g');
const RE_OKURI = new RegExp(`([${KANJI}]+)([ぁ-ん]*)$`);
const RE_BLANK = /[（(][\s　]*[）)]/;
const RE_KANA_ONLY = /^[ぁ-んァ-ヶー]+$/;
const RE_AFTER_NUMBER = /[0-9０-９][かヶカ]?$/;

export type ReadingDict = Map<string, string>;

export function kataToHira(s: string): string {
  return s.replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

export function hasKanji(s: string): boolean {
  return RE_KANJI.test(s);
}

export function isKana(s: string): boolean {
  return RE_KANA_ONLY.test(s);
}

/** Gióng cách đọc kana với chữ: 洗わずに + あらわずに -> [[洗, あら]] */
export function alignReading(text: string, reading: string): [string, string][] {
  const r = kataToHira(reading).replace(/[^ぁ-んー]/g, '');
  if (!r || /[0-9０-９]/.test(text)) return []; // số đọc theo cả cụm, không gióng được
  const parts: string[] = [];
  const runs: string[] = [];
  for (const m of text.matchAll(RE_TOKEN)) {
    const tok = m[0];
    if (RE_KANJI.test(tok)) {
      if (parts[parts.length - 1] === '(.+?)') return []; // 2 cụm Kanji liền nhau
      parts.push('(.+?)');
      runs.push(tok);
    } else {
      parts.push(kataToHira(tok));
    }
  }
  if (runs.length === 0) return [];
  const m = new RegExp(`^${parts.join('')}$`).exec(r);
  return m ? runs.map((run, i) => [run, m[i + 1]] as [string, string]) : [];
}

/**
 * Lấy cặp (Kanji, cách đọc) từ chuỗi kiểu 田口（たぐち）くん / 教え（おしえ）.
 * Ngoặc không đứng sau Kanji (đáp án, từ cần hỏi) hoặc ngoặc lồng nhau thì bỏ qua.
 */
export function parseInlineFurigana(furi: string): [string, string][] {
  const pairs: [string, string][] = [];
  const stack: [number, boolean][] = [];
  for (let i = 0; i < furi.length; i++) {
    const ch = furi[i];
    if (ch === '（') {
      stack.push([i, false]);
    } else if (ch === '）' && stack.length) {
      const [start, hasChild] = stack.pop()!;
      if (stack.length) stack[stack.length - 1][1] = true;
      if (stack.length || hasChild) continue;
      const content = furi.slice(start + 1, i).trim();
      if (!RE_KANA_ONLY.test(content)) continue;
      const prefix = furi.slice(0, start);
      const before = RE_OKURI.exec(prefix);
      if (!before || RE_AFTER_NUMBER.test(prefix.slice(0, before.index))) continue;
      const [, base, okuri] = before;
      if (okuri && (!content.endsWith(okuri) || content.length <= okuri.length)) continue;
      pairs.push([base, kataToHira(okuri ? content.slice(0, content.length - okuri.length) : content)]);
    }
  }
  return pairs;
}

/** Các cụm trong ngoặc không phải furigana, vd. 多忙 trong （多忙）な — chính là từ đang được hỏi. */
export function markedTargets(furi: string): string[] {
  const targets: string[] = [];
  const re = /（([^（）]+)）/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(furi))) {
    const content = m[1].trim();
    const prefix = furi.slice(0, m.index);
    const isReading = RE_KANA_ONLY.test(content) && RE_OKURI.test(prefix);
    if (content && !isReading) targets.push(content);
  }
  return targets;
}

/** Chia text thành đoạn ruby theo từ điển cách đọc; ô （　　　） thành ô trống. */
export function toRuby(text: string, dict: ReadingDict, extra: Partial<RubySegment> = {}): RubySegment[] {
  const segs: RubySegment[] = [];
  let plain = '';
  const flush = () => {
    if (plain) segs.push({ t: plain, ...extra });
    plain = '';
  };

  let i = 0;
  while (i < text.length) {
    const blank = RE_BLANK.exec(text.slice(i));
    if (blank && blank.index === 0) {
      flush();
      segs.push({ blank: true });
      i += blank[0].length;
      continue;
    }
    if (RE_KANJI.test(text[i]) && !RE_AFTER_NUMBER.test(text.slice(0, i))) {
      let j = i;
      while (j < text.length && RE_KANJI.test(text[j])) j++;
      let matched = false;
      // Ưu tiên cả cụm Kanji, không có thì thử tiền tố dài nhất
      for (let k = j; k > i; k--) {
        const reading = dict.get(text.slice(i, k));
        if (reading) {
          flush();
          segs.push({ t: text.slice(i, k), r: reading, ...extra });
          i = k;
          matched = true;
          break;
        }
      }
      if (matched) continue;
    }
    plain += text[i];
    i++;
  }
  flush();
  return segs;
}

/**
 * Furigana cho câu hỏi Kanji / Từ vựng từ trường `furigana` của dữ liệu.
 * `forbidden`: cách đọc không được hiện (vì chính là đáp án).
 * `targets`: cụm được gạch chân như từ cần hỏi trong đề JLPT.
 */
export function buildQuestionRuby(question: string, furigana: string | undefined, forbidden: string[] = [], targets: string[] = []): RubySegment[] {
  const dict: ReadingDict = new Map();
  if (furigana) {
    let pairs = parseInlineFurigana(furigana);
    if (pairs.length === 0) {
      // Dạng viết lại cả câu bằng kana: （　　　）が ぶか に はなしている
      pairs = alignReading(question.replace(RE_BLANK, ''), furigana.replace(RE_BLANK, ''));
    }
    pairs.forEach(([base, reading]) => dict.set(base, reading));
  }

  const banned = forbidden.map(f => kataToHira(f)).filter(isKana);
  dict.forEach((reading, base) => {
    if (banned.some(b => b.includes(reading) || reading.includes(b))) dict.delete(base);
  });

  const target = targets.find(t => t && question.includes(t));
  if (!target) return toRuby(question, dict);
  const at = question.indexOf(target);
  return [
    ...toRuby(question.slice(0, at), dict),
    ...toRuby(target, dict, { hl: 1 }),
    ...toRuby(question.slice(at + target.length), dict)
  ];
}

/** Furigana cho một từ khi đã biết cách đọc cả từ (VD từ vựng tự tạo: 確かめる / たしかめる). */
export function wordRuby(word: string, reading: string | undefined): RubySegment[] {
  if (!reading || !hasKanji(word)) return [{ t: word }];
  const pairs = alignReading(word, reading);
  if (pairs.length) return toRuby(word, new Map(pairs));
  return [{ t: word, r: kataToHira(reading) }];
}

/** Từ điển cách đọc lấy từ phần giải thích: "上司 (じょうし): Cấp trên", "溜まる (たまる)". */
export function readingsFromText(text: string): ReadingDict {
  const dict: ReadingDict = new Map();
  const re = new RegExp(`([${KANJI}][${KANJI}ぁ-ん]*)\\s*[（(]\\s*([ぁ-んァ-ヶー]+)`, 'g');
  for (const m of text.matchAll(re)) {
    alignReading(m[1], m[2]).forEach(([base, reading]) => {
      if (!dict.has(base)) dict.set(base, reading);
    });
  }
  return dict;
}
