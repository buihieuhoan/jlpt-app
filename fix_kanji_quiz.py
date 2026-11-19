"""Soát và sửa bộ trắc nghiệm Kanji N3 (Bài 1-35), xuất Excel đã sửa + JSON cho app.

Chạy:  python fix_kanji_quiz.py [excel_gốc]
  -> Trac_nghiem_Kanji_N3_Bai_1_to_35_da_sua.xlsx (cạnh file gốc)
  -> src/assets/n3_kanji_quizzes.json  (rồi chạy: node upload_kanji_to_firestore.js)

Các lỗi đã sửa:
  - Đề lộ đáp án: dạng ĐỌC viết sẵn cách đọc bằng hiragana (Bài 1: câu 10-20); dạng VIẾT có sẵn
    chữ Kanji cần chọn trong đề (vd. 美術が好きです hỏi chọn 術).
  - Phương án trùng nhau / gõ lỗi; phương án nhiễu cũng đúng (外=ほか, 込んでいる, 洗濯=せんたく...).
  - Câu đề sai ngữ pháp / gõ lặp chữ.
  - Trường furigana: đánh dấu đúng phần đang hỏi bằng ngoặc （漢字） để app gạch chân như đề JLPT.
"""
import json
import re
import sys
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'Trac_nghiem_Kanji_N3_Bai_1_to_35.xlsx'
OUT_XLSX = SRC.with_name(SRC.stem + '_da_sua.xlsx')
OUT_JSON = ROOT / 'src' / 'assets' / 'n3_kanji_quizzes.json'

COLS = {'de': 3, 'furigana': 4, 'A': 5, 'B': 6, 'C': 7, 'D': 8, 'dap_an': 9,
        'giai_thich': 10, 'dich': 11, 'phan_tich': 12}

# Bài 1, câu 10-20: dạng ĐỌC nhưng đề viết sẵn cách đọc -> viết bằng Kanji
READ_LEAK = {
    10: '取り急ぎ、メールで用件だけ伝える。',
    11: '私は親から信頼されている。',
    12: '田中氏が社長を辞任した。',
    13: '彼のファッションは個性的だ。',
    14: 'カメラの倍率を変える。',
    15: '未解決の事件がようやく解決した。',
    16: '問題を保留にする。',
    17: 'この付近には、くまが出るらしい。',
    18: '今、自分がいる位置を地図で確認する。',
    19: 'この歌は1980年代にヒットした。',
    20: '一個二百円の卵を買う。',
}

# Sửa từng câu. 'phan_tich_dong': thay dòng phân tích của phương án tương ứng.
FIXES = {
    # --- Đề dạng VIẾT có sẵn chữ Kanji đáp án ---
    41: {'de': '美じゅつが好きです。', 'furigana': '美（び）（じゅつ）が 好（す）き です。', 'dich': 'Tôi thích mỹ thuật.'},
    42: {'de': '勉強にやく立つ本を読む。', 'furigana': '勉強（べんきょう）に（やく）立（だ）つ 本（ほん）を 読（よ）む。'},
    43: {'de': '頭がいい生と。', 'furigana': '頭（あたま）が いい 生（せい）（と）。', 'dich': 'Học sinh thông minh.'},
    45: {'de': 'ボールをなげる。'},
    46: {'de': '信頼をえる。'},
    47: {'de': 'このロボットはなおせないんです。'},
    48: {'de': '値だんが高い。', 'furigana': '値（ね）（だん）が 高（たか）い。'},
    50: {'de': '価ちを出したい。', 'furigana': '価（か）（ち）を 出（だ）したい。'},
    104: {'de': 'ここにせい別を書いてください。', 'furigana': 'ここに（せい）別（べつ）を 書（か）いてください。',
          'dich': 'Hãy ghi giới tính vào đây.'},
    286: {'de': '色をまちがえた。', 'furigana': '色（いろ）を（まちがえた）。', 'dich': 'Tôi đã nhầm màu.'},
    # --- Phương án nhiễu cũng đúng ---
    22: {'de': 'ほかに意見はないですか。', 'furigana': '（ほか）に 意見（いけん）は ない です か。', 'D': '池',
         'phan_tich_dong': {'D': 'D. 池: Trì - いけ (cái ao)'}},
    148: {'B': '困んで', 'phan_tich_dong': {'B': 'B. 困んで: Sai. Khốn (困) đọc là こまる, không có cách viết này'}},
    290: {'B': '先', 'phan_tich_dong': {'B': 'B. 先: Tiên (trước)'}},
    374: {'B': '服', 'phan_tich_dong': {'B': 'B. 服: Phục (quần áo)'}},
    589: {'de': 'はじめて日本に来ました。', 'furigana': '（はじめて） 日本（にほん）に 来（き）ました。',
          'dich': 'Lần đầu tiên tôi đến Nhật Bản.',
          'giai_thich': '【初】 SƠ\n- Âm Kun: はじ・め / はつ\n- Mẹo nhớ: Việc ĐẦU TIÊN khi may áo quần (衤) là dùng dao (刀) cắt vải.\n- Giải nghĩa: 初めて (はじめて) là lần đầu tiên.',
          'phan_tich_dong': {'C': 'C. 始: Thủy - dùng cho 始める/始まる (bắt đầu), không dùng với nghĩa "lần đầu tiên"',
                             'D': 'D. 初: Đúng. Sơ trong 初めて (はじめて - lần đầu tiên)'}},
    593: {'de': 'やっと目的地にとう着した。', 'furigana': 'やっと 目的地（もくてきち）に（とう）着（ちゃく）した。',
          'dich': 'Cuối cùng cũng đã đến được nơi cần đến.',
          'giai_thich': '【到】 ĐÁO\n- Âm On: トウ\n- Mẹo nhớ: Phi con dao (刂) ĐẾN ĐÍCH.\n- Giải nghĩa: 到着 (とうちゃく) là đến nơi.',
          'phan_tich': 'A. 到: Đúng. Đáo trong 到着 (とうちゃく - đến nơi)\nB. 制: Chế (セイ)\nC. 至: Chí (シ) - không đọc là とう\nD. 製: Chế (セイ)'},
    633: {'de': 'たんじょうびを祝ふくする。', 'furigana': 'たんじょうびを 祝（しゅく）（ふく）する。',
          'phan_tich_dong': {'B': 'B. 祝: Chúc - đã có trong đề (祝ふく), phần cần điền là ふく'}},
    # --- Phương án trùng nhau / gõ lỗi ---
    32: {'C': 'かこく'},
    179: {'D': 'ざんぜい', 'phan_tich': 'Tán (サン) + Thành (セイ) = さんせい. Đáp án A đúng.'},
    182: {'D': 'しつぱい'},
    321: {'C': 'しんほ'},
    359: {'D': 'しゅちょ'},
    407: {'A': 'かんじゃ', 'phan_tich_dong': {'A': 'A. かんじゃ: Sai (かんじゃ là 患者 - bệnh nhân).'}},
    408: {'furigana': '（引っ越し）', 'A': 'ひっごし', 'B': 'ひっこうし', 'C': 'ひっこし', 'D': 'ひきこし', 'dap_an': 'C',
          'phan_tich': 'A. ひっごし: Sai âm đục.\nB. ひっこうし: Sai, thừa trường âm.\nC. ひっこし: Đúng.\nD. ひきこし: Sai, 引っ đọc ngắt âm là ひっ.'},
    447: {'D': 'のうぎょ'},
    502: {'A': 'おなか', 'phan_tich_dong': {'A': 'A. おなか: お腹 (Bụng).'}},
    654: {'C': '主'},
    # --- Đề sai ngữ pháp / gõ lặp chữ ---
    44: {'dich': 'Độc giả phổ thông.'},
    84: {'de': '相手のい図がよくわからない。', 'furigana': '相手（あいて）の（い）図（と）が よく わからない。'},
    87: {'de': '強い信ねんを持つ。'},
    110: {'de': '道をわたる。', 'furigana': '道（みち）を（わたる）。', 'dich': 'Băng qua đường.'},
    123: {'dich': 'Tài liệu này lúc nào cũng có thông tin phù hợp.'},
    144: {'de': '自分の将来は自分できめたほうがいい。', 'A': '覚めた', 'B': '決めた', 'C': '占めた', 'D': '閉めた',
          'phan_tich_dong': {'D': 'D. 閉める: Bế - しめる (Đóng)'}},
    151: {'de': 'この料理がしおからい。'},
    163: {'de': 'やちんが上がったから引っ越そうと思う。', 'furigana': '（やちん）が 上（あ）がった から 引（ひ）っ越（こ）そう と 思（おも）う。'},
    171: {'de': 'わたしのせいで、チームはやぶれた。', 'furigana': 'わたし の せい で、チーム は（やぶれた）。',
          'A': '破れた', 'B': '倒れた', 'C': '折れた', 'D': '敗れた'},
    172: {'de': '車のはんばいのしごとをしている。', 'furigana': '車（くるま）の（はんばい）の しごと を して いる。'},
    188: {'de': '毎日にっきを書きます。', 'furigana': '毎日（まいにち）（にっき）を 書（か）きます。'},
    222: {'de': 'か学者になりたい。'},
    252: {'de': 'こうきゅうなホテルに泊まる。', 'furigana': '（こうきゅう）な ホテルに 泊（と）まる。', 'dich': 'Ở khách sạn cao cấp.'},
    265: {'de': '友達のけっこんしきに参加する。', 'furigana': '友達（ともだち）の（けっこんしき）に 参加（さんか）する。'},
    270: {'de': '国のけいざいを発展させる。', 'furigana': '国（くに）の（けいざい）を 発展（はってん）させる。'},
    285: {'de': '私のかこを思い出したくない。', 'furigana': '私（わたし）の（かこ）を 思（おも）い 出（だ）したくない。',
          'dich': 'Tôi không muốn nhớ lại quá khứ của mình.'},
    287: {'de': '服をぎゃくに着る。'},
    309: {'de': '仕事が終わったら、かくにんする。', 'furigana': '仕事（しごと）が 終（お）わったら、（かくにん）する。'},
    313: {'de': 'このことはふくざつだね。', 'furigana': 'このことは（ふくざつ）だね。'},
    319: {'furigana': '（会議）室（しつ）'},
    324: {'de': '今日の仕事はかん了しました。', 'furigana': '今日（きょう）の 仕事（しごと）は（かん）了（りょう）しました。'},
    352: {'de': 'いしゃになって人々を助けたい。', 'furigana': '医（い）（しゃ）になって 人々（ひとびと）を 助（たす）けたい。'},
    355: {'de': 'きせいを作る。'},
    365: {'de': '参考にする', 'furigana': '（参考）にする'},
    373: {'de': '昨日からずっとねむい。', 'furigana': '昨日（きのう）からずっと（ねむい）。'},
    394: {'de': 'この研究はせいこうしました。', 'furigana': 'この 研究（けんきゅう）は（せいこう）しました。', 'dich': 'Nghiên cứu này đã thành công.'},
    395: {'de': 'ごみの量をへらす。', 'furigana': 'ごみの 量（りょう）を（へらす）。', 'dich': 'Giảm lượng rác.'},
    438: {'de': 'ベトナムはのう業に力を入れている。', 'furigana': 'ベトナムは（のう）業（ぎょう）に 力（ちから）を 入（い）れている。',
          'dich': 'Việt Nam đang chú trọng vào nông nghiệp.'},
    452: {'de': 'わたしのかれ氏はとてもハンサムです。', 'furigana': 'わたしの（かれ）氏（し）はとてもハンサムです。'},
    457: {'de': '次の角を右にまがる。', 'furigana': '次（つぎ）の 角（かど）を 右（みぎ）に（まがる）。', 'dich': 'Rẽ phải ở góc đường tiếp theo.'},
    458: {'furigana': '銀行（ぎんこう）（口座）'},
    473: {'de': '暑すぎて、あせが流れる。', 'furigana': '暑（あつ）すぎて、（あせ）が 流（なが）れる。'},
    510: {'de': '法りつ家になりたい。'},
    512: {'de': '結婚しきに呼ばれた。'},
    546: {'furigana': '（郵便）局（きょく）'},
    553: {'de': '広い部やがほしい。', 'furigana': '広（ひろ）い 部（へ）（や）がほしい。'},
    588: {'de': '白線の内がわに立ってください。'},
    591: {'furigana': '車（くるま）（せい）造（ぞう） 会社（がいしゃ）'},
    592: {'de': '重い病にたおれる。', 'furigana': '重（おも）い 病（やまい）に（たおれる）。', 'dich': 'Gục ngã vì căn bệnh nặng.'},
    610: {'furigana': '道（どう）（ろ）が 込（こ）んでいる。'},
    616: {'de': 'この本をかくグループに一冊ずつ配ってください。', 'furigana': 'この 本（ほん）を（かく）グループに 一冊（いっさつ）ずつ 配（くば）ってください。'},
    653: {'de': 'いちばん大切なのは愛だ。', 'furigana': 'いち（ばん） 大切（たいせつ）なのは 愛（あい）だ。', 'dich': 'Điều quan trọng nhất là tình yêu.'},
    656: {'de': '駅前のしょう店街で買い物をする。', 'furigana': '駅前（えきまえ）の（しょう）店街（てんがい）で 買（か）い 物（もの）をする。',
          'dich': 'Đi mua sắm ở khu phố mua sắm trước nhà ga.',
          'giai_thich': '【商】 THƯƠNG\n- Âm On: ショウ | Âm Kun: あきな・う\n- Mẹo nhớ: THƯƠNG LÁI luôn phải đứng (立) và nói (口) nhiều gấp 4 (四) lần người khác.\n- Giải nghĩa: 商店街 (しょうてんがい) là khu phố mua sắm.',
          'phan_tich_dong': {'B': 'B. 商: Đúng. Thương trong 商店街 (しょうてんがい - khu phố mua sắm)'}},
    # Đề viết lẫn Kanji + kana: ngoặc đánh dấu đúng phần kana đang hỏi
    63: {'furigana': '（じゅ）業（ぎょう）に 参加（さんか）したい。'},
    204: {'furigana': '紙（かみ）一（いち）（まい）ください。'},
    205: {'furigana': '（き）会（かい）が あれば 日本（にほん）へ 行（い）きたい。'},
    209: {'furigana': '未来（みらい）を（そう）像（ぞう）する。'},
    211: {'furigana': '母（はは）に（そう）談（だん）する。'},
    237: {'D': 'しょうせっか'},
    667: {'de': '人間は皆、平どうではない。', 'furigana': '人間（にんげん）は 皆（みな）、 平（びょう）（どう）ではない。'},
}

KJ = '㐀-鿿々〆ヶ'
RE_KANA = re.compile(r'^[ぁ-んァ-ヶー]+$')


def is_kana(s):
    return bool(RE_KANA.match(s or ''))


def hira(s):
    return ''.join(chr(ord(c) - 0x60) if 'ァ' <= c <= 'ヶ' else c for c in s)


def align(text, reading):
    """Gióng cách đọc với chữ: 洗わずに + あらわずに -> khớp. Trả về None nếu không gióng được."""
    reading = re.sub(r'[^ぁ-んー]', '', hira(reading))
    if not reading or re.search(r'[0-9０-９]', text):
        return None
    parts = []
    for m in re.finditer(f'[{KJ}]+|[ぁ-んァ-ヶー]', text):
        tok = m.group()
        if re.match(f'[{KJ}]', tok):
            if parts and parts[-1] == '(.+?)':
                return None
            parts.append('(.+?)')
        else:
            parts.append(re.escape(hira(tok)))
    return re.fullmatch(''.join(parts), reading) if parts else None


def reading_parens(furi):
    """Ngoặc là furigana (kana đứng ngay sau Kanji), khác ngoặc đánh dấu phần đang hỏi."""
    return [m for m in re.finditer(r'（([^（）]*)）', furi)
            if is_kana(m.group(1).strip()) and re.search(f'[{KJ}][ぁ-ん]*$', furi[:m.start()])]


def markers(furi):
    rp = {m.start() for m in reading_parens(furi)}
    return [m for m in re.finditer(r'（([^（）]*)）', furi) if m.start() not in rp]


def strip_readings(s):
    out, last = '', 0
    for m in reading_parens(s):
        out += s[last:m.start()]
        last = m.end()
    return re.sub(r'\s', '', out + s[last:])


def word_pairs(text):
    return [(w, hira(r)) for w, r in
            re.findall(rf'([{KJ}][{KJ}ぁ-んァ-ヶー]*)\s*[（(]\s*([ぁ-んァ-ヶー]+)', text or '')]


KNOWN = {}


def find_read_target(q, furi, correct, extra):
    """Phần chữ Kanji trong đề mà đáp án (kana) là cách đọc của nó."""
    for m in markers(furi):
        pre, suf = strip_readings(furi[:m.start()]), strip_readings(furi[m.end():])
        if q.startswith(pre) and q.endswith(suf) and len(pre) + len(suf) < len(q):
            t = q[len(pre):len(q) - len(suf)]
            if align(t, m.group(1)):
                return t
    # Nhiều cách cắt cùng hợp lệ (担任|先生 hay 担任先|生) thì ưu tiên phần còn lại là từ đã biết cách đọc
    for m in markers(furi):
        suf = re.sub(r'\s', '', hira(strip_readings(furi[m.end():])))
        cands = []
        for k in range(len(q), 0, -1):
            t, rest = q[:k], q[k:]
            if re.search(f'[{KJ}]', t) and align(t, m.group(1)) and \
                    ((align(rest, suf) or hira(rest) == suf) if suf else not rest):
                cands.append((t, rest))
        for t, rest in cands:
            if KNOWN.get(rest) == suf or (t, hira(correct)) in word_pairs(extra) or not re.search(f'[{KJ}]', rest):
                return t
        if cands:
            return cands[0][0]
    cands = [w for w, r in word_pairs(extra) if r == hira(correct) and w in q]
    return max(cands, key=len) if cands else None


def replace_analysis_line(text, letter, line):
    lines = (text or '').split('\n')
    for i, l in enumerate(lines):
        if re.match(rf'\s*{letter}\s*[.．:]', l):
            lines[i] = line
            return '\n'.join(lines)
    return '\n'.join(lines + [line])


wb = openpyxl.load_workbook(SRC)
ws = wb.worksheets[0]
rows = [list(r) for r in ws.iter_rows(min_row=2, values_only=True)]
for r in rows:
    for w, rd in word_pairs(f'{r[4]}\n{r[10]}\n{r[12]}'):
        KNOWN.setdefault(w, rd)

changes = {}
for r in rows:
    stt = r[0]
    before = list(r)
    opts = r[5:9]

    if stt in READ_LEAK:
        correct = opts['ABCD'.index(r[9])]
        q = READ_LEAK[stt]
        t = next(w for w, rd in word_pairs(f'{r[10]}\n{r[12]}') if w in q and hira(correct).startswith(rd)) \
            if any(w in q for w, _ in word_pairs(f'{r[10]}\n{r[12]}')) else None
        r[3] = q
        r[4] = q.replace(t, f'（{t}）', 1) if t else r[4]

    for key, val in FIXES.get(stt, {}).items():
        if key == 'phan_tich_dong':
            for letter, line in val.items():
                r[COLS['phan_tich']] = replace_analysis_line(r[COLS['phan_tich']], letter, line)
        else:
            r[COLS[key]] = val

    # Dạng ĐỌC: ngoặc đánh dấu phải chứa chữ Kanji đang hỏi (không phải cách đọc) để app gạch chân
    opts = r[5:9]
    correct = opts['ABCD'.index(r[9])]
    if all(is_kana(o) for o in opts):
        furi = r[4] or ''
        valid = [m for m in markers(furi) if m.group(1).strip() and m.group(1).strip() in r[3]
                 and re.search(f'[{KJ}]', m.group(1))]
        if not valid:
            t = find_read_target(r[3], furi, correct, f'{r[10]}\n{r[12]}')
            if t:
                ms = [m for m in markers(furi) if is_kana(m.group(1).strip())]
                r[4] = furi[:ms[0].start()] + f'（{t}）' + furi[ms[0].end():] if ms else r[3].replace(t, f'（{t}）', 1)

    if r != before:
        changes[stt] = [k for k, i in COLS.items() if r[i] != before[i]]

# --- Kiểm tra ---
problems = []
for r in rows:
    stt, q, furi, opts, key = r[0], r[3], r[4] or '', r[5:9], r[9]
    correct = opts['ABCD'.index(key)]
    if len(set(opts)) < 4 or any(not o or re.search(r'[A-Za-z]', o) for o in opts):
        problems.append(f'#{stt}: phương án trùng / lỗi {opts}')
    if correct in q:
        problems.append(f'#{stt}: đáp án "{correct}" nằm trong đề "{q}"')
    valid = [m.group(1).strip() for m in markers(furi) if m.group(1).strip() and m.group(1).strip() in q]
    if not valid:
        problems.append(f'#{stt}: furigana không đánh dấu phần đang hỏi: {q} | {furi}')

marker_only = [s for s, k in changes.items() if k == ['furigana']]
print(f'Đã sửa {len(changes)} câu: {len(changes) - len(marker_only)} câu sửa nội dung, {len(marker_only)} câu chỉ chuẩn hoá đánh dấu furigana.')
print('\n'.join(problems) if problems else 'Kiểm tra: không còn câu lộ đáp án / phương án lỗi / thiếu đánh dấu.')

for i, r in enumerate(rows, start=2):
    for j, v in enumerate(r, start=1):
        ws.cell(row=i, column=j, value=v)
wb.save(OUT_XLSX)

# --- JSON cho app (cùng định dạng với convert_kanji_quiz.py) ---
quizzes = []
for r in rows:
    stt, level, lesson, q, furi, a, b, c, d, key, expl, trans, analysis = r
    lesson = str(lesson).strip()
    m = re.search(r'\d+', lesson)
    parts = [str(expl or '').strip()]
    if trans:
        parts.append(f'Dịch: {str(trans).strip()}')
    if analysis:
        parts.append(f'Phân tích:\n{str(analysis).strip()}')
    quizzes.append({
        'question': str(q).strip(),
        'furigana': str(furi or '').strip(),
        'options': [str(o).strip() for o in (a, b, c, d)],
        'correctAnswerIndex': 'ABCD'.index(str(key).strip().upper()),
        'explanation': '\n\n'.join(p for p in parts if p),
        'jlptLevel': str(level or 'N3').strip().upper(),
        'lesson': lesson,
        'lessonNum': int(m.group()) if m else 0,
        'category': 'kanji',
        'tags': ['kanji', lesson],
        'createdAt': 0,
    })
OUT_JSON.write_text(json.dumps(quizzes, ensure_ascii=False, indent=2), encoding='utf-8')
print(f'-> {OUT_XLSX.name}\n-> {OUT_JSON.relative_to(ROOT)} ({len(quizzes)} câu)')
