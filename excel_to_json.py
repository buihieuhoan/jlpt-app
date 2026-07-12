import pandas as pd
import json
import re

excel_path = r'd:\Tu_vung_N4_Kem_Nhom_Va_Bai.xlsx'
json_path = r'd:\JLPT\src\assets\data.json'

# Đọc excel, bỏ qua dòng đầu tiên (header gộp) và dùng dòng thứ 2 làm header
df = pd.read_excel(excel_path, header=1)

# Xóa các giá trị NaN, thay bằng chuỗi rỗng
df = df.fillna('')

vocab_list = []

for index, row in df.iterrows():
    # Các cột: Từ vựng (Kanji), Hiragana / Katakana, Nghĩa tiếng Việt, Nhóm từ, Bài
    front = str(row['Từ vựng (Kanji)']).strip()
    hiragana = str(row['Hiragana / Katakana']).strip()
    back = str(row['Nghĩa tiếng Việt']).strip()
    pos = str(row['Nhóm từ']).strip()
    lesson_str = str(row['Bài']).strip()
    
    # Bóc tách số bài từ chuỗi "Bài 26"
    lesson_num = 0
    m = re.search(r'\d+', lesson_str)
    if m:
        lesson_num = int(m.group())
        
    # Tạo object vocab
    vocab_item = {
        "type": "vocab",
        "lesson": lesson_num,
        "partOfSpeech": pos,
        "front": front,
        "hiragana": hiragana,
        "back": back,
        "example": "", # Xóa dữ liệu ví dụ
        "level": 0,
        "nextReviewDate": 0
    }
    
    # Chỉ thêm vào nếu có dữ liệu
    if front or hiragana or back:
        vocab_list.append(vocab_item)

with open(json_path, 'w', encoding='utf-8') as f:
    json.dump(vocab_list, f, ensure_ascii=False, indent=2)

print(f"Đã xuất thành công {len(vocab_list)} từ vựng ra file data.json!")
