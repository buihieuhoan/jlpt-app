"""Trích phần lý thuyết Kanji N3 (35 buổi) từ PDF sang src/assets/n3_kanji_theory.json.

Chạy:  python convert_kanji_theory.py [đường_dẫn_pdf]

Mỗi thẻ Kanji trong PDF gồm: số thứ tự, chữ Kanji, âm Hán Việt, 音/訓, mẹo nhớ (cột trái)
và các câu ví dụ có furigana (cột phải). Furigana được ghép vào đúng chữ bên dưới
dựa trên toạ độ từng ký tự (chữ cỡ 6 nằm ngay trên chữ cỡ 11).
"""
import json
import re
import sys
from pathlib import Path

import fitz  # PyMuPDF

ROOT = Path(__file__).resolve().parent
PDF_PATH = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'n3-junbi-kanji-tonghop-fixed.pdf'
OUTPUT_PATH = ROOT / 'src' / 'assets' / 'n3_kanji_theory.json'

KANJI_RE = re.compile(r'[㐀-鿿豈-﫿々〆ヶ]')
BODY_TOP, BODY_BOTTOM = 45, 745     # bỏ header / footer
LEFT_COL_MAX_X = 290                # cột trái: thông tin Kanji
RUBY_MAX_SIZE = 8                   # furigana cỡ 6
MNEMONIC_SIZE = 10                  # mẹo nhớ cỡ 10


def page_items(page, pno):
    """Các span trong thân trang, kèm toạ độ từng ký tự."""
    items = []
    for block in page.get_text('rawdict')['blocks']:
        for line in block.get('lines', []):
            for span in line['spans']:
                chars = [c for c in span['chars']]
                text = ''.join(c['c'] for c in chars)
                if not text.strip():
                    continue
                x0, y0, x1, y1 = span['bbox']
                if y0 < BODY_TOP or y1 > BODY_BOTTOM:
                    continue
                items.append({
                    'page': pno, 'x0': x0, 'y0': y0, 'x1': x1, 'y1': y1,
                    'size': span['size'], 'font': span['font'], 'text': text, 'chars': chars,
                })
    return items


def is_anchor(it):
    # Số thứ tự thẻ: chữ số Arial đậm cỡ 11 ở mép trái thẻ
    return it['x0'] < 110 and 'Arial' in it['font'] and re.fullmatch(r'\d+', it['text'].strip())


def group_lines(items, tol=3):
    """Gom span thành dòng theo (trang, y)."""
    lines = []
    for it in sorted(items, key=lambda i: (i['page'], i['y0'], i['x0'])):
        if lines and lines[-1]['page'] == it['page'] and abs(lines[-1]['y0'] - it['y0']) <= tol:
            lines[-1]['items'].append(it)
        else:
            lines.append({'page': it['page'], 'y0': it['y0'], 'items': [it]})
    for line in lines:
        line['items'].sort(key=lambda i: i['x0'])
        line['text'] = ''.join(i['text'] for i in line['items'])
    return lines


def build_ruby(base_line, rubies):
    """Ghép furigana (span nhỏ phía trên) vào các chữ Kanji nằm ngay bên dưới."""
    chars = [c for it in base_line['items'] for c in it['chars']]
    owner = [None] * len(chars)
    for ri, ruby in enumerate(rubies):
        for ci, c in enumerate(chars):
            cx = (c['bbox'][0] + c['bbox'][2]) / 2
            if ruby['x0'] - 2 <= cx <= ruby['x1'] + 2 and KANJI_RE.match(c['c']):
                owner[ci] = ri
    segs, plain = [], ''
    i = 0
    while i < len(chars):
        if owner[i] is None:
            plain += chars[i]['c']
            i += 1
            continue
        j = i
        while j < len(chars) and owner[j] == owner[i]:
            j += 1
        if plain:
            segs.append({'t': plain})
            plain = ''
        segs.append({'t': ''.join(c['c'] for c in chars[i:j]), 'r': rubies[owner[i]]['text'].strip()})
        i = j
    if plain:
        segs.append({'t': plain})
    return segs


def clean_segments(segs):
    # Bỏ khoảng trắng thừa ở đầu/cuối, gộp đoạn thường liền nhau
    out = []
    for s in segs:
        if out and 'r' not in s and 'r' not in out[-1]:
            out[-1] = {'t': out[-1]['t'] + s['t']}
        else:
            out.append(dict(s))
    if out and 'r' not in out[0]:
        out[0]['t'] = out[0]['t'].lstrip()
    if out and 'r' not in out[-1]:
        out[-1]['t'] = out[-1]['t'].rstrip()
    return [s for s in out if s['t']]


def parse_card(items):
    left = [i for i in items if i['x0'] < LEFT_COL_MAX_X and not is_anchor(i)]
    right = [i for i in items if i['x0'] >= LEFT_COL_MAX_X]

    # --- Cột trái ---
    # Chữ Kanji (cỡ 14) và âm Hán Việt (Arial đậm 11) căn giữa ô tiêu đề thẻ
    centered = lambda i: 150 < (i['x0'] + i['x1']) / 2 < 210
    kanji_items = [i for i in left if i['size'] >= 13 and centered(i)]
    hv_items = [i for i in left if 'Arial' in i['font'] and i['size'] >= 10.5 and centered(i)]
    kanji = ''.join(i['text'] for i in kanji_items).strip()
    han_viet = ' '.join(i['text'].strip() for i in hv_items)
    on, kun, mnemonic, mode = [], [], [], None
    for line in group_lines([i for i in left if i not in kanji_items and i not in hv_items]):
        text = line['text'].strip()
        size = max(i['size'] for i in line['items'])
        if text.startswith('音'):
            mode = 'on'
            on.append(re.sub(r'^音\s*[：:]\s*', '', text))
        elif text.startswith('訓'):
            mode = 'kun'
            kun.append(re.sub(r'^訓\s*[：:]\s*', '', text))
        elif size <= MNEMONIC_SIZE + 0.5:
            mode = 'mnemonic'
            mnemonic.append(text)
        elif mode == 'on':
            on.append(text)
        elif mode == 'kun':
            kun.append(text)
        else:
            mnemonic.append(text)

    # --- Cột phải: ví dụ ---
    base = [i for i in right if i['size'] > RUBY_MAX_SIZE]
    rubies = [i for i in right if i['size'] <= RUBY_MAX_SIZE]
    examples = []
    for line in group_lines(base):
        is_bullet = line['items'][0]['text'].strip() == '•'
        if is_bullet:
            line = {**line, 'items': line['items'][1:]}
            if not line['items']:
                continue
        top = min(i['y0'] for i in line['items'])
        line_rubies = [r for r in rubies if r['page'] == line['page'] and 0 <= top - r['y1'] <= 4]
        segs = build_ruby(line, line_rubies)
        if is_bullet or not examples:
            examples.append(segs)
        else:
            # Dòng bị ngắt / ghi chú tiếp theo: bỏ khoảng trắng ở chỗ nối
            prev = examples[-1]
            if prev and 'r' not in prev[-1]:
                prev[-1] = {'t': prev[-1]['t'].rstrip()}
            if segs and 'r' not in segs[0]:
                segs[0] = {'t': segs[0]['t'].lstrip()}
            examples[-1] = prev + segs
    examples = [clean_segments(e) for e in examples]
    examples = [e for e in examples if e]

    return {
        'kanji': kanji,
        'hanViet': han_viet,
        'on': [s for s in on if s],
        'kun': [s for s in kun if s],
        'mnemonic': re.sub(r'\s+', ' ', ' '.join(mnemonic)).strip(),
        'examples': examples,
    }


def toc_kanji(doc):
    """Danh sách Kanji của từng buổi theo mục lục (trang 3-4) để đối chiếu."""
    text = doc[2].get_text() + doc[3].get_text()
    result = {}
    for num, body in re.findall(r'Bu[ôổ]i\s*(\d+)\s+([^\n]+(?:\n[^\nB0-9][^\n]*)?)', text):
        result[int(num)] = KANJI_RE.findall(body)
    return result


doc = fitz.open(PDF_PATH)
starts = [(int(re.search(r'bai (\d+)', title).group(1)), page)
          for level, title, page in doc.get_toc() if re.search(r'bai \d+', title)]
starts.sort()
toc = toc_kanji(doc)

lessons, problems = [], []
for idx, (num, start) in enumerate(starts):
    end = starts[idx + 1][1] - 1 if idx + 1 < len(starts) else doc.page_count
    # Trang cuối sách là lời cảm ơn, không thuộc buổi 35
    pages = [p for p in range(start, end + 1) if 'Đội ngũ biên soạn' not in doc[p - 1].get_text()]
    items = [it for p in pages for it in page_items(doc[p - 1], p)]
    items.sort(key=lambda i: (i['page'], i['y0'], i['x0']))
    anchors = [i for i in items if is_anchor(i)]

    cards = []
    for ai, a in enumerate(anchors):
        nxt = anchors[ai + 1] if ai + 1 < len(anchors) else None
        key_a = (a['page'], a['y0'] - 12)
        key_n = (nxt['page'], nxt['y0'] - 12) if nxt else (10 ** 6, 0)
        # Nội dung thẻ: từ số thứ tự đến trước thẻ kế tiếp (có thể sang trang sau)
        body = [i for i in items if key_a <= (i['page'], i['y0']) < key_n]
        card = parse_card(body)
        card['no'] = int(a['text'].strip())
        cards.append(card)

    expected = toc.get(num, [])
    got = [c['kanji'] for c in cards]
    if sorted(got) != sorted(expected):  # thứ tự thẻ trong sách có chỗ khác mục lục
        problems.append(f'Buổi {num}: mục lục {"".join(expected)} ≠ trích được {"".join(got)}')
    for c in cards:
        missing = [k for k in ('hanViet', 'mnemonic', 'examples') if not c[k]] + ([] if c['on'] or c['kun'] else ['on/kun'])
        if missing or len(c['kanji']) != 1:
            problems.append(f'Buổi {num} #{c["no"]} {c["kanji"]}: thiếu {missing}')
    lessons.append({'lesson': f'Bài {num}', 'lessonNum': num, 'level': 'N3', 'kanji': cards})

OUTPUT_PATH.write_text(json.dumps(lessons, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
print(f'Đã trích {len(lessons)} buổi, {sum(len(l["kanji"]) for l in lessons)} chữ Kanji -> {OUTPUT_PATH}')
print('\n'.join(problems) if problems else 'Không có sai lệch so với mục lục.')
