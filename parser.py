import fitz # PyMuPDF
import json
import re

pdf_path = r"d:\Zalo Received Files\JLPT\N4\1723004687-ebook-n4-tuvung-tonghop-v2.pdf"
doc = fitz.open(pdf_path)

extracted_text = ""
for page in doc:
    # Get blocks of text to somewhat preserve order, or just raw text
    extracted_text += page.get_text("text") + "\n---PAGE---\n"

with open("pdf_raw_extracted.txt", "w", encoding="utf-8") as f:
    f.write(extracted_text)

print("Extracted to pdf_raw_extracted.txt")
