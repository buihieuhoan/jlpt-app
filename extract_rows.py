import fitz
import json
import os

pdf_path = r"d:\Zalo Received Files\JLPT\N4\1723004687-ebook-n4-tuvung-tonghop-v2.pdf"
doc = fitz.open(pdf_path)

output = []

for page_num in range(len(doc)):
    page = doc[page_num]
    # get_text("blocks") returns list of tuples: (x0, y0, x1, y1, text, block_no, block_type)
    blocks = page.get_text("blocks")
    
    # Filter text blocks only (block_type == 0)
    text_blocks = [b for b in blocks if b[6] == 0]
    
    # Sort blocks by y0 (vertical position) then x0 (horizontal position)
    # Give a tolerance for y0 to group items in the same row
    text_blocks.sort(key=lambda b: (round(b[1] / 10), b[0]))
    
    output.append(f"--- PAGE {page_num + 1} ---")
    for b in text_blocks:
        text = b[4].replace('\n', ' ').strip()
        output.append(f"[{b[0]:.1f}, {b[1]:.1f}] {text}")

with open("pdf_rows_extracted.txt", "w", encoding="utf-8") as f:
    f.write("\n".join(output))

print("Extracted to pdf_rows_extracted.txt")
