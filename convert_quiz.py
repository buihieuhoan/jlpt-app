import pandas as pd
import json

excel_path = r'd:\Zalo Received Files\JLPT\N3\Từ vựng N3\Trắc_nghiệm_từ_vựng_N3_Master_Full_1_den_93.xlsx'
df = pd.read_excel(excel_path)
df = df.fillna('')

quizzes = []
# Map "A", "B", "C", "D" to 0, 1, 2, 3
ans_map = {'A': 0, 'B': 1, 'C': 2, 'D': 3}

for index, row in df.iterrows():
    # Trim strings just in case
    ans = str(row['Đáp án đúng']).strip().upper()
    correct_index = ans_map.get(ans, 0)
    
    # Optional fields
    furigana = str(row['Furigana']) if 'Furigana' in row else ''
    translation = str(row['Bản dịch']) if 'Bản dịch' in row else ''
    analysis = str(row['Phân tích các đáp án']) if 'Phân tích các đáp án' in row else ''
    
    full_explanation = f"{str(row['Giải thích'])}"
    if translation:
        full_explanation += f"\n\nDịch: {translation}"
    if analysis:
        full_explanation += f"\n\nPhân tích: {analysis}"
    
    quiz = {
        'question': str(row['Câu hỏi']).strip(),
        'furigana': furigana.strip(),
        'options': [
            str(row['Đáp án A']).strip(),
            str(row['Đáp án B']).strip(),
            str(row['Đáp án C']).strip(),
            str(row['Đáp án D']).strip()
        ],
        'correctAnswerIndex': correct_index,
        'explanation': full_explanation.strip(),
        'jlptLevel': str(row['Cấp độ']).strip().upper() or 'N3',
        'lesson': str(row['Bài học']).strip(),
        'tags': ['vocab', str(row['Bài học']).strip()],
        'createdAt': 0 # will be overwritten by firestore server timestamp or JS Date.now()
    }
    quizzes.append(quiz)

with open(r'd:\JLPT\src\assets\n3_quizzes.json', 'w', encoding='utf-8') as f:
    json.dump(quizzes, f, ensure_ascii=False, indent=2)

print(f"Extracted {len(quizzes)} quizzes to src/assets/n3_quizzes.json")
