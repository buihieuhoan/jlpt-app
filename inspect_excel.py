import pandas as pd
import json

df = pd.read_excel(r'd:\Zalo Received Files\JLPT\N3\Từ vựng N3\Trắc_nghiệm_từ_vựng_N3_Master_Full_1_den_93.xlsx')
df = df.fillna('')
output = {
    'columns': df.columns.tolist(),
    'head': df.head(3).to_dict('records'),
    'total_rows': len(df)
}

with open(r'd:\JLPT\quiz_n3_excel_info.json', 'w', encoding='utf-8') as f:
    json.dump(output, f, ensure_ascii=False, indent=2)
print("done")
