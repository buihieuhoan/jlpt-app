import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of, shareReplay } from 'rxjs';

// Một đoạn chữ của câu: text thường, text có furigana, ô trống （　）, hoặc ô sắp xếp ★
export interface RubySegment {
  t?: string;
  r?: string;      // cách đọc (furigana)
  hl?: 1 | 2;      // 1 = phần ghép vào, 2 = đáp án / ô ★
  blank?: boolean;
  slot?: number;
  star?: boolean;
}

export interface GrammarOption {
  text: string;
  reading: string;
  meaning: string;
  ruby?: RubySegment[];
}

export type GrammarQuestionType = 'choice' | 'order' | 'sentence';

export interface GrammarQuestion {
  id: string;
  stt: number;
  level: string;
  lesson: string;
  lessonNum: number;
  topic: string;
  type: GrammarQuestionType;
  question: string;
  questionRuby: RubySegment[];
  options: GrammarOption[];
  answer: number;
  order?: number[];  // chỉ số đáp án theo thứ tự đúng trong câu (dạng sắp xếp)
  star?: number;     // vị trí ô ★ (1-4)
  sentence: string;
  sentenceRuby: RubySegment[];
  translation: string;
  pattern: string;
  meaning: string;
  usage: string;
  analysis: string;
  note?: string;     // ghi chú hiệu đính so với file gốc
}

export interface GrammarPoint {
  pattern: string;
  meaning: string;
  usage: string;
  examples: GrammarQuestion[];
}

export interface GrammarLesson {
  lesson: string;
  lessonNum: number;
  questions: GrammarQuestion[];
  points: GrammarPoint[];
  choiceCount: number;
  orderCount: number;
}

export interface GrammarProgress {
  best: number;      // % cao nhất
  last: number;      // % lần gần nhất
  attempts: number;
}

const PROGRESS_KEY = 'jlpt_grammar_progress';

@Injectable({
  providedIn: 'root'
})
export class GrammarService {
  private http = inject(HttpClient);

  private questions$ = this.http.get<GrammarQuestion[]>('assets/n3_grammar_quizzes.json').pipe(
    catchError(err => {
      console.error('Không tải được dữ liệu ngữ pháp:', err);
      return of([] as GrammarQuestion[]);
    }),
    shareReplay(1)
  );

  getLessons(level: string): Observable<GrammarLesson[]> {
    return this.questions$.pipe(
      map(questions => this.buildLessons(questions.filter(q => q.level === level)))
    );
  }

  private buildLessons(questions: GrammarQuestion[]): GrammarLesson[] {
    const lessonMap = new Map<number, GrammarQuestion[]>();
    for (const q of questions) {
      if (!lessonMap.has(q.lessonNum)) {
        lessonMap.set(q.lessonNum, []);
      }
      lessonMap.get(q.lessonNum)!.push(q);
    }

    return Array.from(lessonMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([lessonNum, qs]) => ({
        lesson: qs[0].lesson,
        lessonNum,
        questions: qs,
        points: this.buildPoints(qs),
        choiceCount: qs.filter(q => q.type !== 'order').length,
        orderCount: qs.filter(q => q.type === 'order').length
      }));
  }

  // Gom câu hỏi theo mẫu ngữ pháp; ý nghĩa lấy từ câu dạng "chọn đáp án" vì
  // ở câu sắp xếp, cột ý nghĩa thường là bản dịch của cả câu.
  private buildPoints(questions: GrammarQuestion[]): GrammarPoint[] {
    const pointMap = new Map<string, GrammarPoint>();
    for (const q of questions) {
      const key = q.pattern || q.topic;
      let point = pointMap.get(key);
      if (!point) {
        point = { pattern: key, meaning: '', usage: '', examples: [] };
        pointMap.set(key, point);
      }
      point.examples.push(q);
      if (q.type === 'choice' && !point.meaning) {
        point.meaning = q.meaning;
        point.usage = q.usage;
      }
    }
    pointMap.forEach(p => {
      if (!p.meaning) {
        p.meaning = p.examples[0].meaning;
      }
    });
    return Array.from(pointMap.values());
  }

  getProgress(): { [lesson: string]: GrammarProgress } {
    try {
      return JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}');
    } catch {
      return {};
    }
  }

  saveProgress(lesson: string, percent: number) {
    const all = this.getProgress();
    const prev = all[lesson];
    all[lesson] = {
      best: Math.max(prev?.best ?? 0, percent),
      last: percent,
      attempts: (prev?.attempts ?? 0) + 1
    };
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(all));
  }
}
