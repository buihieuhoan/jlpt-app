import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of, shareReplay } from 'rxjs';
import { RubySegment } from './grammar.service';

// Một thẻ Kanji trong giáo trình (trích từ PDF bằng convert_kanji_theory.py)
export interface KanjiCard {
  no: number;
  kanji: string;
  hanViet: string;
  on: string[];
  kun: string[];
  mnemonic: string;
  examples: RubySegment[][];
  translations?: string[]; // bản dịch tiếng Việt, cùng thứ tự với examples
}

export interface KanjiTheoryLesson {
  lesson: string;
  lessonNum: number;
  level: string;
  kanji: KanjiCard[];
}

@Injectable({
  providedIn: 'root'
})
export class KanjiTheoryService {
  private http = inject(HttpClient);

  private lessons$ = this.http.get<KanjiTheoryLesson[]>('assets/n3_kanji_theory.json').pipe(
    catchError(err => {
      console.error('Không tải được lý thuyết Kanji:', err);
      return of([] as KanjiTheoryLesson[]);
    }),
    shareReplay(1)
  );

  // Lý thuyết theo số bài, chỉ của cấp độ đang chọn
  getLessonMap(level: string): Observable<Map<number, KanjiTheoryLesson>> {
    return this.lessons$.pipe(
      map(lessons => new Map(lessons.filter(l => l.level === level).map(l => [l.lessonNum, l])))
    );
  }
}
