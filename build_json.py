import fitz
import json
import re

pdf_path = r"d:\Zalo Received Files\JLPT\N4\1723004687-ebook-n4-tuvung-tonghop-v2.pdf"
doc = fitz.open(pdf_path)

vocab_list = []
current_lesson = 26
current_pos = "Động từ"

def is_vietnamese(text):
    vn_chars = "àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ"
    return any(c in text.lower() for c in vn_chars) or " " in text and not is_japanese(text)

def is_japanese(text):
    # Matches Hiragana, Katakana, Kanji
    return bool(re.search(r'[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]', text))

for page_num in range(len(doc)):
    page = doc[page_num]
    blocks = page.get_text("blocks")
    text_blocks = [b for b in blocks if b[6] == 0]
    
    # Sort primarily by Y, then by X
    text_blocks.sort(key=lambda b: (round(b[1] / 15), b[0]))
    
    # Parse lesson and POS from page
    for b in text_blocks:
        text = b[4].replace('\n', ' ').strip()
        m_lesson = re.search(r'BÀI\s+(\d+)', text, re.IGNORECASE)
        if m_lesson:
            current_lesson = int(m_lesson.group(1))
            
        m_pos = re.search(r'(Động từ|Danh từ|Tính từ|Phó từ|Câu hội thoại|Liên từ)', text, re.IGNORECASE)
        if m_pos:
            current_pos = m_pos.group(1)
            
    # Group blocks into "rows" by Y coordinate (tolerance 25)
    rows = []
    current_row = []
    last_y = -100
    for b in text_blocks:
        y = b[1]
        if abs(y - last_y) > 25 and current_row:
            rows.append(current_row)
            current_row = []
        current_row.append(b)
        last_y = y
    if current_row:
        rows.append(current_row)
        
    # We will process blocks independently based on X and Y to assemble VocabItems.
    # A vocab item starts with a number.
    # Let's collect all numbers on the left side (x0 < 150)
    items_on_page = []
    for b in text_blocks:
        x0 = b[0]
        y0 = b[1]
        text = b[4].replace('\n', ' ').strip()
        
        # Match "1. 診ます" or "10. 運動会"
        m_word = re.match(r'^(\d+)\.\s+(.*)', text)
        if x0 < 180 and m_word:
            items_on_page.append({
                "y0": y0,
                "id": int(m_word.group(1)),
                "word": m_word.group(2).strip(),
                "hiragana": "",
                "meaning": "",
                "example_jp": "",
                "example_vn": ""
            })
            
    if not items_on_page:
        continue
        
    # Assign other blocks to the nearest item by Y coordinate
    for b in text_blocks:
        x0 = b[0]
        y0 = b[1]
        text = b[4].replace('\n', ' ').strip()
        
        # Skip headers, page numbers
        if re.match(r'BÀI\s+\d+', text, re.IGNORECASE) or text.isdigit() or "riki.edu.vn" in text or "Nhật ngữ" in text:
            continue
        if re.match(r'^\d+\.\s+', text) and x0 < 180:
            continue # already processed
            
        # Find closest item
        nearest_item = min(items_on_page, key=lambda item: abs(item["y0"] - y0))
        
        if x0 < 180:
            # Left column: Hiragana or Meaning
            if is_japanese(text):
                nearest_item["hiragana"] += " " + text
            else:
                nearest_item["meaning"] += " " + text
        else:
            # Right column: Example JP or Example VN
            if is_japanese(text):
                nearest_item["example_jp"] += " " + text
            else:
                nearest_item["example_vn"] += " " + text

def is_kanji(c):
    return '\u4E00' <= c <= '\u9FFF' or c == '々'

def build_full_hiragana(front, extracted_hiragana):
    extracted_hiragana = re.sub(r'[\d\.]+', '', extracted_hiragana).strip()
    if not extracted_hiragana: return front
    blocks = []
    if not front: return extracted_hiragana
    current_is_kanji = is_kanji(front[0])
    current_str = front[0]
    for c in front[1:]:
        if is_kanji(c) == current_is_kanji:
            current_str += c
        else:
            blocks.append((current_is_kanji, current_str))
            current_is_kanji = is_kanji(c)
            current_str = c
    blocks.append((current_is_kanji, current_str))
    
    furigana_chunks = extracted_hiragana.split()
    kanji_blocks_count = sum(1 for b in blocks if b[0])
    
    if kanji_blocks_count == len(furigana_chunks) and kanji_blocks_count > 0:
        f_idx = 0
        result = ""
        for is_k, s in blocks:
            if is_k:
                result += furigana_chunks[f_idx]
                f_idx += 1
            else:
                result += s
        return result
    elif kanji_blocks_count == 1 and len(furigana_chunks) > 1:
        f_combined = "".join(furigana_chunks)
        result = ""
        for is_k, s in blocks:
            if is_k:
                result += f_combined
            else:
                result += s
        return result
    else:
        m = re.search(r'([ぁ-ん]+)$', front)
        okurigana = m.group(1) if m else ""
        return "".join(furigana_chunks) + okurigana

    for item in items_on_page:
        # Clean up
        word = item["word"].replace("「", "").replace("」", "").strip()
        raw_hiragana = item["hiragana"].strip()
        hiragana = build_full_hiragana(word, raw_hiragana).replace('  ', ' ').strip()
        meaning = item["meaning"].strip()
        example_jp = item["example_jp"].strip()
        example_vn = item["example_vn"].strip()
        
        # Determine type based on POS
        pos_lower = current_pos.lower()
        if "động từ" in pos_lower or "danh từ" in pos_lower or "phó từ" in pos_lower or "tính từ" in pos_lower:
            item_type = "vocab"
        else:
            item_type = "vocab"
            
        # Refine type based on the word itself
        if "tính từ" in pos_lower or "động từ" in pos_lower:
            item_type = "vocab"
            
        # Create output object
        vocab_item = {
            "type": item_type,
            "lesson": current_lesson,
            "partOfSpeech": current_pos,
            "front": word,
            "hiragana": hiragana,
            "back": meaning,
            "example": f"{example_jp}\n{example_vn}".strip(),
            "level": 0,
            "nextReviewDate": 0
        }
        vocab_list.append(vocab_item)

with open("data.json", "w", encoding="utf-8") as f:
    json.dump(vocab_list, f, ensure_ascii=False, indent=2)

print(f"Extracted {len(vocab_list)} items to data.json")
