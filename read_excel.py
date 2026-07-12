import pandas as pd
import json

df = pd.read_excel(r'd:\Tu_vung_N4_Kem_Nhom_Va_Bai.xlsx')
df = df.fillna('')
output = {
    'columns': df.columns.tolist(),
    'head': df.head(5).to_dict('records'),
    'total_rows': len(df)
}

with open(r'd:\JLPT\excel_info.json', 'w', encoding='utf-8') as f:
    json.dump(output, f, ensure_ascii=False, indent=2)
