import { Component, EventEmitter, Input, OnDestroy, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { KanjiCard, KanjiTheoryLesson } from '../../../core/services/kanji-theory.service';
import { RubySegment } from '../../../core/services/grammar.service';
import { TtsService } from '../../../core/services/tts.service';
import { RubyTextComponent } from '../../../shared/ruby-text/ruby-text.component';

const READING_KEY = 'jlpt_kanji_study_furigana';

@Component({
  selector: 'app-kanji-study',
  standalone: true,
  imports: [CommonModule, RubyTextComponent],
  templateUrl: './kanji-study.component.html'
})
export class KanjiStudyComponent implements OnDestroy {
  private ttsService = inject(TtsService);

  @Input({ required: true }) lesson!: KanjiTheoryLesson;
  @Input() questionCount = 0;
  @Output() back = new EventEmitter<void>();
  @Output() start = new EventEmitter<void>();

  // Mặc định hiện furigana vì đây là phần học cách đọc; tắt đi để tự kiểm tra
  showReading = localStorage.getItem(READING_KEY) !== '0';
  // Ẩn nghĩa Hán Việt + mẹo nhớ để tự kiểm tra
  quizMode = false;
  revealed: { [kanji: string]: boolean } = {};

  ngOnDestroy() {
    this.ttsService.stop();
  }

  toggleReading() {
    this.showReading = !this.showReading;
    localStorage.setItem(READING_KEY, this.showReading ? '1' : '0');
  }

  toggleQuizMode() {
    this.quizMode = !this.quizMode;
    this.revealed = {};
  }

  isHidden(card: KanjiCard): boolean {
    return this.quizMode && !this.revealed[card.kanji];
  }

  scrollTo(card: KanjiCard) {
    document.getElementById('kanji-' + card.no)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  plain(example: RubySegment[]): string {
    return example.map(s => s.t ?? '').join('');
  }

  // Ưu tiên đọc theo furigana để giọng đọc không đọc sai Kanji
  speak(example: RubySegment[]) {
    this.ttsService.stop();
    this.ttsService.speak(example.map(s => s.r ?? s.t ?? '').join(''), 'ja-JP');
  }
}
