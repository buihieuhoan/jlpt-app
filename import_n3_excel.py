import pandas as pd
import json
import re

excel_path = r'd:\Zalo Received Files\JLPT\N3\Tu_vung_N3_Full.xlsx'
json_path = r'd:\JLPT\src\assets\data.json'

df = pd.read_excel(excel_path, header=1)
df = df.fillna('')

vocab_list = []

for index, row in df.iterrows():
    front = str(row['Từ vựng (Kanji)']).strip()
    hiragana = str(row['Hiragana / Katakana']).strip()
    back = str(row['Nghĩa tiếng Việt']).strip()
    pos = str(row['Nhóm từ']).strip()
    lesson_str = str(row['Bài']).strip()
    
    # Bỏ qua các dòng tiêu đề phụ
    if front.startswith('---'): continue
    if not front and not hiragana and not back: continue
    
    lesson_num = 0
    m = re.search(r'\d+', lesson_str)
    if m:
        lesson_num = int(m.group())
        
    vocab_item = {
        "type": "vocab",
        "lesson": lesson_num,
        "partOfSpeech": pos,
        "front": front,
        "hiragana": hiragana,
        "back": back,
        "example": "",
        "level": 0,
        "nextReviewDate": 0
    }
    
    vocab_list.append(vocab_item)

with open(json_path, 'w', encoding='utf-8') as f:
    json.dump(vocab_list, f, ensure_ascii=False, indent=2)

print(f"DONE: {len(vocab_list)}")
