import json
import re

def is_kanji(c):
    return '\u4E00' <= c <= '\u9FFF' or c == '々'

def build_full_hiragana(front, extracted_hiragana):
    # Clean up extracted_hiragana
    extracted_hiragana = re.sub(r'[\d\.]+', '', extracted_hiragana).strip()
    
    if not extracted_hiragana:
        return front
        
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
        # Fallback
        m = re.search(r'([ぁ-ん]+)$', front)
        okurigana = m.group(1) if m else ""
        return "".join(furigana_chunks) + okurigana

with open(r'd:\JLPT\src\assets\data.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

for item in data:
    if item['hiragana']:
        new_hira = build_full_hiragana(item['front'], item['hiragana'])
        item['hiragana'] = new_hira.replace('  ', ' ').strip()

with open(r'd:\JLPT\src\assets\data.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print("Done fixing hiragana!")
