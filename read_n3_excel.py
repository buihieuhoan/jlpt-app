import pandas as pd
import json

df = pd.read_excel(r'd:\Zalo Received Files\JLPT\N3\Tu_vung_N3_Full.xlsx')
df = df.fillna('')
output = {
    'columns': df.columns.tolist(),
    'head': df.head(5).to_dict('records'),
    'total_rows': len(df)
}

with open(r'd:\JLPT\n3_excel_info.json', 'w', encoding='utf-8') as f:
    json.dump(output, f, ensure_ascii=False, indent=2)
