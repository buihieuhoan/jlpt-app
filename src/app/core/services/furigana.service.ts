import { Injectable } from '@angular/core';

const KEY = 'jlpt_show_furigana';
const LEGACY_GRAMMAR_KEY = 'jlpt_grammar_furigana';

// Bật/tắt furigana dùng chung cho trắc nghiệm Kanji, Từ vựng và Ngữ pháp (mặc định tắt như đề thi thật)
@Injectable({
  providedIn: 'root'
})
export class FuriganaService {
  show = (localStorage.getItem(KEY) ?? localStorage.getItem(LEGACY_GRAMMAR_KEY)) === '1';

  toggle() {
    this.show = !this.show;
    localStorage.setItem(KEY, this.show ? '1' : '0');
  }
}
