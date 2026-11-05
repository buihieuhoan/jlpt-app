"""Chuyển file Excel ngữ pháp N3 sang src/assets/n3_grammar_quizzes.json.

Chạy:  python convert_grammar_quiz.py [đường_dẫn_excel]

Ngoài việc đổi định dạng, script còn:
  - Tách furigana thành các đoạn ruby để app hiển thị chữ nhỏ trên Kanji.
  - Tự ghép lại câu hoàn chỉnh từ đề + đáp án đúng (cột "Câu hoàn chỉnh" gốc có nhiều chỗ lệch).
  - Áp bảng hiệu đính bên dưới cho các câu mà đáp án gốc bị sai (đã kiểm chứng bằng cách ghép câu).
"""
import json
import re
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent
EXCEL_PATH = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'Trac_nghiem_Ngu_phap_N3_Tong_hop_Bai_4_23.xlsx'
OUTPUT_PATH = ROOT / 'src' / 'assets' / 'n3_grammar_quizzes.json'

LETTERS = 'ABCD'

# Câu bỏ qua vì đề gốc không có đáp án hợp lý.
SKIP = {57}

# Sửa lỗi chính tả / định dạng trong đề gốc.
QUESTION_FIX = {
    84: '今年（　　　）合格したい。',                                  # đề gốc lặp こそ
    95: '足元が (1) (2*) (3) (4) になってください。',                 # thiếu に
    120: 'パソコンの調子が悪い（　　　）、仕事がなかなか進まない。',  # 良い -> 悪い
    79: '涙が出る（　　　）うれしかった。',                           # đề gốc chèn sẵn furigana
    140: '1か月も入院する(1*) (2) (3) (4) つらいことか。',             # 1っか月
    174: '彼は (1) (2*) (3) (4)、私にはわからなかった。',             # thừa ので
    181: '山田さんは甘いものが (1)、(2) (3*) (4)？',
    235: '今は、(1) (2*) (3) (4)よ。',
    240: 'あの学生は試験の成績が(1) (2*) (3) (4)。',
    241: '彼は、(1) (2) (3*) (4)。',
}

# Thứ tự đúng của 4 mảnh trong câu sắp xếp (theo chữ cái đáp án), dùng khi câu
# hoàn chỉnh gốc bị sai hoặc không dò được. Đáp án = mảnh nằm ở ô ★.
ORDER_FIX = {
    25: 'CADB', 66: 'DBAC', 67: 'CBDA', 68: 'CDAB', 72: 'CADB', 76: 'CBDA',
    95: 'CBDA', 96: 'CBDA', 97: 'CBDA', 99: 'BCAD', 110: 'CBDA', 111: 'DACB',
    113: 'DACB', 114: 'DBCA', 127: 'DCBA', 140: 'CDAB', 141: 'CDBA', 142: 'CBDA',
    144: 'DBAC', 155: 'DBAC', 156: 'DBAC', 173: 'CADB', 181: 'ABCD', 182: 'ADCB', 224: 'CBDA',
    235: 'ACBD', 240: 'BDAC',
}

# Câu chọn đáp án có đáp án gốc sai.
ANSWER_FIX = {
    131: ('A',
          '・A: Đúng. ～一方だ đi sau động từ thể từ điển: 増える一方だ = ngày càng tăng lên.\n'
          '・C: Sai. 一方だ không đi với thể masu bỏ masu (増え).\n'
          '・B, D: Sai cách chia / sai ý nghĩa.',
          'V (thể từ điển) + 一方だ. 増える + 一方である.'),
}

# Cách đọc gốc của một vài đáp án bị lỗi.
READING_FIX = {(113, 'D'): 'さきのかぞくは', (155, 'A'): 'にたいしても'}

# Đáp án gốc bị thiếu chữ.
OPTION_FIX = {(12, 'C'): 'この仕事は (このしごとは - Công việc này)'}

# Furigana gốc thiếu okurigana (後（うしろ） trong khi đề viết 後ろ).
RUBY_FIX = {21: {'後': 'うし'}, 103: {'春': 'はる'}}
# Cách đọc gốc bị gõ sai trong nhiều câu (をちゅうしに).
RUBY_ALL = {'中心': 'ちゅうしん'}

PATTERN_FIX = {'이라는': 'というの', '～ me/': '～'}

KANJI = '㐀-鿿豈-﫿々〆ヶ'
RE_KANJI_RUN = re.compile(f'[{KANJI}]+')
RE_BLANK = re.compile(r'[（(][\s　]*[）)]')
RE_SLOT = re.compile(r'\s*\((\d)(\*?)\)\s*')
RE_KANA_ONLY = re.compile(r'^[ぁ-んァ-ヶー]+$')


def clean(v) -> str:
    return '' if v is None or (isinstance(v, float) and pd.isna(v)) else str(v).strip()


def kata_to_hira(s: str) -> str:
    return ''.join(chr(ord(c) - 0x60) if 'ァ' <= c <= 'ヶ' else c for c in s)


def align(text: str, reading: str):
    """Gióng cách đọc kana với chữ Kanji: 洗わずに + あらわずに -> [(洗, あら)]."""
    reading = re.sub(r'[^ぁ-んー]', '', kata_to_hira(reading))
    if re.search(r'[0-9０-９A-Za-z]', text):  # số / chữ Latin không gióng được
        return []
    parts, runs = [], []
    for m in re.finditer(f'[{KANJI}]+|[ぁ-んァ-ヶー]', text):
        tok = m.group()
        if RE_KANJI_RUN.fullmatch(tok):
            if parts and parts[-1] == '(.+?)':  # hai cụm Kanji liền nhau thì không biết cắt ở đâu
                return []
            parts.append('(.+?)')
            runs.append(tok)
        else:
            parts.append(re.escape(kata_to_hira(tok)))
    if not runs or not reading:
        return []
    m = re.fullmatch(''.join(parts), reading)
    return list(zip(runs, m.groups())) if m else []


def furigana_pairs(furi: str, exclude=()):
    """Lấy các cặp (Kanji, cách đọc) từ chuỗi kiểu 田口（たぐち）くん / 教え（おしえ）.

    Ngoặc chứa đáp án (vd. あいさつも（せずに）) hoặc ngoặc lồng nhau
    （に違いない（にちがいない）） không phải furigana nên bị bỏ qua.
    """
    pairs, stack = [], []
    for i, ch in enumerate(furi):
        if ch == '（':
            stack.append([i, False])
        elif ch == '）' and stack:
            start, has_child = stack.pop()
            if stack:
                stack[-1][1] = True
            if stack or has_child:
                continue
            content = furi[start + 1:i].strip()
            if not RE_KANA_ONLY.match(content) or content in exclude:
                continue
            before = re.search(f'([{KANJI}]+)([ぁ-ん]*)$', furi[:start])
            if not before or re.search(r'[0-9０-９][かヶカ]?$', furi[:before.start()]):
                continue
            base, okuri = before.groups()
            if okuri and (not content.endswith(okuri) or len(content) <= len(okuri)):
                continue
            pairs.append((base, kata_to_hira(content[:len(content) - len(okuri)] if okuri else content)))
    return pairs


def to_ruby(text: str, dictionary: dict, **extra):
    """Chia text thành các đoạn {t, r?}; Kanji có trong từ điển được gắn cách đọc."""
    segs, plain, i = [], '', 0
    while i < len(text):
        # Kanji đứng sau số (3人, 1か月) đọc theo cả cụm nên bỏ qua
        if RE_KANJI_RUN.match(text[i]) and not re.search(r'[0-9０-９][かヶカ]?$', text[:i]):
            j = i
            while j < len(text) and RE_KANJI_RUN.match(text[j]):
                j += 1
            # Ưu tiên cả cụm Kanji, nếu không có thì thử tiền tố dài nhất.
            for k in range(j, i, -1):
                if text[i:k] in dictionary:
                    if plain:
                        segs.append({'t': plain, **extra})
                        plain = ''
                    segs.append({'t': text[i:k], 'r': dictionary[text[i:k]], **extra})
                    i = k
                    break
            else:
                plain += text[i]
                i += 1
        else:
            plain += text[i]
            i += 1
    if plain:
        segs.append({'t': plain, **extra})
    return segs


def parse_option(raw: str, reading_fix: str = ''):
    m = re.match(r'^(.+?)\s*\((.*)\)(.*)$', raw, re.S)
    if not m:
        return {'text': raw.strip(), 'reading': '', 'meaning': ''}
    text, inner, tail = m.group(1).strip(), m.group(2), m.group(3).strip()
    reading, _, meaning = inner.partition(' - ')
    if not meaning:
        reading, meaning = '', inner
    meaning = (meaning.strip() + (' ' + tail if tail else '')).strip()
    reading = reading_fix or reading.strip()
    return {'text': text, 'reading': reading if RE_KANA_ONLY.match(reading.replace(' ', '')) else '', 'meaning': meaning}


def fix_pattern(s: str) -> str:
    for a, b in PATTERN_FIX.items():
        s = s.replace(a, b)
    return s


def merge_overlap(option: str, after: str) -> str:
    """Bỏ phần lặp giữa đáp án và đoạn sau ô trống (くせに + に、 -> くせに、)."""
    for k in range(min(len(option), len(after)), 0, -1):
        if option.endswith(after[:k]):
            return after[k:]
    return after


df = pd.read_excel(EXCEL_PATH).fillna('')
cols = list(df.columns)
rows = [dict(zip(cols, r)) for r in df.itertuples(index=False)]

# Từ điển cách đọc toàn cục, dùng khi furigana của câu không phủ hết Kanji.
global_votes: dict = {}
def option_texts(r):
    return {parse_option(clean(r[f'Đáp án {l}']))['text'] for l in LETTERS}


for r in rows:
    for base, rd in furigana_pairs(clean(r['Furigana cả câu']), option_texts(r)):
        global_votes.setdefault(base, {}).setdefault(rd, 0)
        global_votes[base][rd] += 1
GLOBAL_DICT = {b: max(v, key=v.get) for b, v in global_votes.items() if len(v) == 1}

quizzes, warnings = [], []
for r in rows:
    stt = int(r['STT'])
    if stt in SKIP:
        continue

    lesson_raw = clean(r['Bài học / Chủ đề Ngữ pháp'])
    lesson_num = int(re.search(r'\d+', lesson_raw).group())
    topic_m = re.search(r'\((.*)\)\s*$', lesson_raw)
    topic = fix_pattern(re.sub(r'^Sắp xếp câu\s*-\s*', '', topic_m.group(1) if topic_m else ''))

    question = QUESTION_FIX.get(stt, clean(r['Câu hỏi (Đề bài gốc)']))
    # Không dựa vào cột "Dạng bài" vì có dòng bị lệch cột / ghi sai dạng
    is_order = bool(RE_SLOT.search(question))
    kind = 'order' if is_order else ('sentence' if not RE_BLANK.search(question) else 'choice')

    raw_opts = [OPTION_FIX.get((stt, l), clean(r[f'Đáp án {l}'])) for l in LETTERS]
    if not raw_opts[3]:  # dòng bị lệch cột
        raw_opts[3] = clean(r['Sắp xếp D'])
    options = [parse_option(o, READING_FIX.get((stt, LETTERS[i]), ''))
               for i, o in enumerate(raw_opts) if o and o != '-']

    answer_letter = clean(r['Đáp án đúng']).upper()
    analysis = clean(r['Phân tích chi tiết các đáp án'])
    usage = clean(r['Dấu hiệu & Lưu ý kết hợp'])
    note = ''

    # Từ điển cách đọc riêng cho câu này
    furi = clean(r['Furigana cả câu'])
    dictionary = {}
    for o in options:
        dictionary.update(align(o['text'], o['reading']))
    dictionary.update(GLOBAL_DICT)
    dictionary.update(furigana_pairs(furi, {o['text'] for o in options}))
    dictionary.update(RUBY_FIX.get(stt, {}))
    dictionary.update(RUBY_ALL)

    extra = {}
    if is_order:
        star = int(next(m.group(1) for m in RE_SLOT.finditer(question) if m.group(2)))
        texts = [o['text'] for o in options]
        if stt in ORDER_FIX:
            order = [LETTERS.index(c) for c in ORDER_FIX[stt]]
        else:
            full = re.sub(r'\s', '', clean(r['Câu hoàn chỉnh (Đã ghép / Đã điền)']).split(' / ')[0])
            pos = [full.find(re.sub(r'[\s（）()]', '', t)) for t in texts]
            if min(pos) < 0:
                raise SystemExit(f'#{stt}: không dò được thứ tự, cần thêm vào ORDER_FIX')
            order = sorted(range(len(texts)), key=lambda i: pos[i])
        derived = LETTERS[order[star - 1]]
        if derived != answer_letter:
            if stt not in ORDER_FIX:
                raise SystemExit(f'#{stt}: đáp án {answer_letter} lệch với thứ tự ghép ({derived})')
            note = f'Đáp án gốc trong file là {answer_letter}; đã hiệu đính thành {derived} theo thứ tự ghép câu.'
            pieces = ' → '.join(f'{texts[i]} ({LETTERS[i]}){" ★" if n == star - 1 else ""}' for n, i in enumerate(order))
            analysis = f'Thứ tự đúng: {pieces}.\nÔ ★ là ô số {star} → Đáp án {derived} ({texts[order[star - 1]]}).'
            usage = ''
        answer_letter = derived
        extra = {'order': order, 'star': star}

        # Đề: chữ thường + 4 ô trống, ô ★ đánh dấu
        q_segs, s_chunks, last = [], [], 0
        for n, m in enumerate(RE_SLOT.finditer(question)):
            between = question[last:m.start()]
            q_segs += to_ruby(between, dictionary)
            q_segs.append({'slot': int(m.group(1)), 'star': bool(m.group(2))})
            s_chunks += [(between, 0), (texts[order[n]], 2 if n == star - 1 else 1)]
            last = m.end()
        q_segs += to_ruby(question[last:], dictionary)
        s_chunks.append((question[last:], 0))
        if stt not in ORDER_FIX:
            norm = lambda x: re.sub(r'[\s、。，,（）()]', '', x)
            built = norm(''.join(t for t, _ in s_chunks))
            original = norm(clean(r['Câu hoàn chỉnh (Đã ghép / Đã điền)']).split(' / ')[0])
            if built != original:
                warnings.append(f'#{stt}: câu ghép "{built}" khác câu gốc "{original}" - cần xem lại')
        plain_q = RE_SLOT.sub(lambda m: '＿★＿' if m.group(2) else '＿＿', question)
    else:
        if stt in ANSWER_FIX:
            fixed_letter, analysis, usage = ANSWER_FIX[stt]
            note = f'Đáp án gốc trong file là {answer_letter}; đã hiệu đính thành {fixed_letter}.'
            answer_letter = fixed_letter
        ans_text = options[LETTERS.index(answer_letter)]['text']
        m = RE_BLANK.search(question)
        if m:
            before, after = question[:m.start()].rstrip(' '), question[m.end():].lstrip(' ')
            q_segs = to_ruby(before, dictionary) + [{'blank': True}] + to_ruby(after, dictionary)
            s_chunks = [(before, 0), (ans_text, 2), (merge_overlap(ans_text, after), 0)]
            plain_q = before + '（　　　）' + after
        else:
            q_segs = to_ruby(question, dictionary)
            s_chunks = [(ans_text, 0)]
            plain_q = question

    sentence_ruby = [seg for text, hl in s_chunks if text for seg in to_ruby(text, dictionary, **({'hl': hl} if hl else {}))]
    for o in options:
        ruby = to_ruby(o['text'], dictionary)
        if any('r' in seg for seg in ruby):
            o['ruby'] = ruby
        if o['reading'] == o['text'] or not RE_KANJI_RUN.search(o['text']):
            o['reading'] = ''

    quizzes.append({
        'id': f'n3-grammar-{stt:03d}',
        'stt': stt,
        'level': clean(r['Cấp độ']).upper() or 'N3',
        'lesson': f'Buổi {lesson_num}',
        'lessonNum': lesson_num,
        'topic': topic,
        'type': kind,
        'question': plain_q,
        'questionRuby': q_segs,
        'options': options,
        'answer': LETTERS.index(answer_letter),
        **extra,
        'sentence': ''.join(t for t, _ in s_chunks),
        'sentenceRuby': sentence_ruby,
        'translation': clean(r['Bản dịch']),
        'pattern': fix_pattern(clean(r['Mẫu Ngữ pháp chính'])),
        'meaning': clean(r['Ý nghĩa & Cách dùng ngữ pháp']),
        'usage': usage,
        'analysis': analysis,
        **({'note': note} if note else {}),
    })
    if note:
        warnings.append(f'#{stt}: {note}')

OUTPUT_PATH.write_text(json.dumps(quizzes, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
print(f'Đã chuyển {len(quizzes)} câu ngữ pháp -> {OUTPUT_PATH}')
print(f'Hiệu đính {len(warnings)} câu:')
print('\n'.join(warnings))
