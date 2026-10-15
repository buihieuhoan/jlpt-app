import pandas as pd
import json
import re

excel_path = r'd:\Zalo Received Files\JLPT\N3\Trac_nghiem_Kanji_N3_Bai_1_to_35.xlsx'
df = pd.read_excel(excel_path)
df = df.fillna('')

ans_map = {'A': 0, 'B': 1, 'C': 2, 'D': 3}
quizzes = []

for index, row in df.iterrows():
    ans = str(row['Đáp án đúng']).strip().upper()
    correct_index = ans_map.get(ans, 0)
    
    furigana = str(row['Furigana']).strip() if 'Furigana' in row else ''
    translation = str(row['Bản dịch']).strip() if 'Bản dịch' in row else ''
    analysis = str(row['Phân tích các đáp án']).strip() if 'Phân tích các đáp án' in row else ''
    
    explanation_parts = []
    giai_thich = str(row['Giải thích']).strip()
    if giai_thich:
        explanation_parts.append(giai_thich)
    if translation:
        explanation_parts.append(f"Dịch: {translation}")
    if analysis:
        explanation_parts.append(f"Phân tích:\n{analysis}")
        
    full_explanation = "\n\n".join(explanation_parts)
    lesson_str = str(row['Bài học']).strip()
    
    # Extract lesson number for reliable ordering
    m = re.search(r'\d+', lesson_str)
    lesson_num = int(m.group()) if m else 0

    quiz = {
        'question': str(row['Câu hỏi']).strip(),
        'furigana': furigana,
        'options': [
            str(row['Đáp án A']).strip(),
            str(row['Đáp án B']).strip(),
            str(row['Đáp án C']).strip(),
            str(row['Đáp án D']).strip()
        ],
        'correctAnswerIndex': correct_index,
        'explanation': full_explanation,
        'jlptLevel': str(row['Cấp độ']).strip().upper() or 'N3',
        'lesson': lesson_str,
        'lessonNum': lesson_num,
        'category': 'kanji',
        'tags': ['kanji', lesson_str],
        'createdAt': 0
    }
    quizzes.append(quiz)

output_path = r'd:\JLPT\src\assets\n3_kanji_quizzes.json'
with open(output_path, 'w', encoding='utf-8') as f:
    json.dump(quizzes, f, ensure_ascii=False, indent=2)

print(f"Successfully converted {len(quizzes)} Kanji quizzes to {output_path}")
