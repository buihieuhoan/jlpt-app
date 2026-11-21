"""Gộp bộ trắc nghiệm Từ vựng N3 (93 "bài" ~10 câu) về đúng 44 bài của giáo trình N3 Junbi Từ vựng.

Chạy:  python regroup_vocab_quiz.py [pdf_từ_vựng]
  -> cập nhật src/assets/n3_quizzes.json (lesson / lessonNum / tags)
  -> rồi chạy: node update_vocab_lessons_firestore.js  để cập nhật DB

Cách xếp bài cho từng câu:
  1. Lấy danh sách 880 từ của sách: mục lục cho dải số thứ tự từng bài (第1課：01～20...),
     từ chính in cỡ 22 nằm cạnh số thứ tự.
  2. Tra đáp án đúng (hoặc từ đầu tiên trong phần giải thích, vd. "溜まる (たまる): ...") trong danh sách
     đó, khớp nguyên từ hoặc theo gốc Kanji (溜まって ~ 溜まる).
  3. Bộ câu cũ đi theo đúng thứ tự sách (khoảng 2 bài cũ = 1 bài sách), nên câu không tra được
     (câu diễn đạt lại, từ ghép...) xếp theo bài sách chiếm đa số trong bài cũ của nó. Câu tra ra bài
     cách xa bài đa số hơn 1 bài (từ quen dùng lại) cũng xếp theo bài đa số.
"""
import collections
import json
import re
import sys
from pathlib import Path

import fitz  # PyMuPDF

ROOT = Path(__file__).resolve().parent
PDF_PATH = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'N3 Junbi - Từ vựng - bản hoàn thiện.pdf'
QUIZ_PATH = ROOT / 'src' / 'assets' / 'n3_quizzes.json'
KJ = '㐀-鿿々'


def book_word_lessons(doc):
    toc = ''.join(doc[i].get_text() for i in range(3, 7))
    ranges = [(int(a), int(b), int(c)) for a, b, c in re.findall(r'第\s*(\d+)\s*課[：:]\s*(\d+)\s*～\s*(\d+)', toc)]
    if len(ranges) != 44:
        raise SystemExit(f'Mục lục: đọc được {len(ranges)} bài, cần 44')
    lesson_of = {n: lesson for lesson, lo, hi in ranges for n in range(lo, hi + 1)}

    entries = collections.defaultdict(list)
    for pno in range(8, doc.page_count + 1):
        spans = [s for b in doc[pno - 1].get_text('dict')['blocks'] for ln in b.get('lines', [])
                 for s in ln['spans'] if s['text'].strip()]
        nums = sorted((s['bbox'][1], int(s['text'].strip())) for s in spans
                      if s['bbox'][0] < 100 and 'Arial' in s['font'] and re.fullmatch(r'\d{1,3}', s['text'].strip()))
        for s in spans:
            t = s['text'].strip()
            if s['size'] >= 15 and 'Demibold' in s['font'] and '課' not in t and s['bbox'][0] < 220:
                above = [n for y, n in nums if y <= s['bbox'][1] + 5]
                if above:
                    entries[above[-1]].append(t)

    words = {}
    for n, parts in entries.items():
        text = re.sub(r'[（(][^）)]*[）)]', '', ''.join(parts))  # bỏ trợ từ (が)(を)...
        for w in re.split(r'[・／/、,\s]', text):
            if w:
                words.setdefault(w, lesson_of[n])
    return words


def stem(w):
    """Phần tới chữ Kanji cuối: 溜まって -> 溜, 確かめる -> 確."""
    m = re.match(rf'^(.*[{KJ}])', w)
    return m.group(1) if m else w


def main():
    words = book_word_lessons(fitz.open(PDF_PATH))
    stems = collections.defaultdict(set)
    for w, lesson in words.items():
        stems[stem(w)].add(lesson)

    quizzes = json.loads(QUIZ_PATH.read_text(encoding='utf-8'))
    matched = []
    for q in quizzes:
        answer = q['options'][q['correctAnswerIndex']]
        first = re.match(rf'\s*([{KJ}ぁ-んァ-ヶー]+)\s*[（(]', q['explanation'])
        cands = [answer] + ([first.group(1)] if first else [])
        lesson = next((words[c] for c in cands if c in words), None)
        if lesson is None:
            for c in cands:
                s = stems.get(stem(c))
                if s and len(s) == 1 and re.search(f'[{KJ}]', stem(c)):
                    lesson = next(iter(s))
                    break
        matched.append(lesson)

    # Bài sách chiếm đa số trong từng bài cũ
    by_old = collections.defaultdict(collections.Counter)
    for q, lesson in zip(quizzes, matched):
        if lesson:
            by_old[q['lesson']][lesson] += 1
    majority = {old: cnt.most_common(1)[0][0] for old, cnt in by_old.items()}

    stats = collections.Counter()
    for q, lesson in zip(quizzes, matched):
        major = majority[q['lesson']]
        if lesson is not None and abs(lesson - major) <= 1:
            final, stats['tra được từ'] = lesson, stats['tra được từ'] + 1
        else:
            final = major
            stats['theo bài đa số' if lesson is None else 'ngoại lệ -> bài đa số'] += 1
        name = f'Bài {final}'
        if q.get('jlptLevel') != 'N3':
            stats['đổi cấp N4 -> N3 (từ của sách N3)'] += 1
        q.update({'lesson': name, 'lessonNum': final, 'tags': ['vocab', name], 'jlptLevel': 'N3'})

    counts = collections.Counter(q['lessonNum'] for q in quizzes)
    missing = sorted(set(range(1, 45)) - set(counts))
    if missing:
        raise SystemExit(f'Không có câu nào cho bài: {missing}')
    QUIZ_PATH.write_text(json.dumps(quizzes, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'{len(quizzes)} câu -> {len(counts)} bài. {dict(stats)}')
    print('Số câu mỗi bài:', ' '.join(f'{k}:{counts[k]}' for k in sorted(counts)))


if __name__ == '__main__':
    main()
