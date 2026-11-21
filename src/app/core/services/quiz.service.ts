import { Injectable, inject } from '@angular/core';
import { Firestore, collection, collectionData, doc, addDoc, writeBatch } from '@angular/fire/firestore';
import { Observable } from 'rxjs';

export interface QuizQuestionDB {
  id?: string;
  question: string;
  furigana?: string;
  options: string[];
  correctAnswerIndex: number;
  explanation: string;
  jlptLevel: string;
  lesson?: string;
  lessonNum?: number;
  category?: 'vocab' | 'kanji' | 'grammar';
  tags?: string[];
  createdAt: number;
}

export interface QuizHistoryDetail {
  questionText: string;
  furigana?: string;
  options: { text: string; isCorrect: boolean; explanation?: string }[];
  selectedAnswer: string | null;
  isCorrect: boolean;
  explanation: string;
}

export interface QuizHistory {
  id: string;
  date: number;
  mode: 'auto' | 'fixed';
  category?: 'vocab' | 'kanji' | 'grammar';
  lessonTitle?: string;
  level: string;
  score: number;
  totalQuestions: number;
  details: QuizHistoryDetail[];
}

export interface QuizProgress {
  best: number;       // % cao nhất
  bestScore: number;
  bestTotal: number;
  last: number;       // % lần gần nhất
  attempts: number;
  updatedAt: number;
}

export interface QuizProgressResult extends QuizProgress {
  previousBest: number | null; // null = lần đầu làm đề này
  isRecord: boolean;
}

const PROGRESS_KEY = 'jlpt_quiz_progress';

@Injectable({
  providedIn: 'root'
})
export class QuizService {
  private firestore = inject(Firestore);
  private quizCollection = collection(this.firestore, 'quiz_questions');

  getQuizzes(): Observable<QuizQuestionDB[]> {
    return collectionData(this.quizCollection, { idField: 'id' }) as Observable<QuizQuestionDB[]>;
  }

  addQuiz(item: QuizQuestionDB) {
    return addDoc(this.quizCollection, item);
  }

  async importQuizzesBatch(quizzes: QuizQuestionDB[]) {
    const CHUNK_SIZE = 400;
    
    for (let i = 0; i < quizzes.length; i += CHUNK_SIZE) {
      const chunk = quizzes.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(this.firestore);
      
      for (const q of chunk) {
        const docRef = doc(this.quizCollection);
        batch.set(docRef, { ...q, createdAt: Date.now() });
      }
      
      await batch.commit();
      console.log(`Imported batch ${Math.floor(i / CHUNK_SIZE) + 1} of ${Math.ceil(quizzes.length / CHUNK_SIZE)}`);
    }
    console.log("Import completed!");
  }

  getQuizHistory(): QuizHistory[] {
    const saved = localStorage.getItem('jlpt_quiz_history');
    if (saved) {
      return JSON.parse(saved) as QuizHistory[];
    }
    return [];
  }

  // --- Thành tích tốt nhất theo từng đề (Kanji: theo bài; Từ vựng: theo chế độ + các bài đã chọn) ---
  getProgress(): { [key: string]: QuizProgress } {
    try {
      return JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}');
    } catch {
      return {};
    }
  }

  saveProgress(key: string, score: number, total: number): QuizProgressResult {
    const all = this.getProgress();
    const prev = all[key];
    const percent = total ? Math.round((score / total) * 100) : 0;
    const isRecord = !prev || percent > prev.best;
    all[key] = {
      best: isRecord ? percent : prev.best,
      bestScore: isRecord ? score : prev.bestScore,
      bestTotal: isRecord ? total : prev.bestTotal,
      last: percent,
      attempts: (prev?.attempts ?? 0) + 1,
      updatedAt: Date.now()
    };
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(all));
    return { ...all[key], previousBest: prev?.best ?? null, isRecord };
  }

  saveQuizHistory(history: QuizHistory) {
    const histories = this.getQuizHistory();
    histories.unshift(history); // Thêm vào đầu để hiển thị mới nhất trước
    localStorage.setItem('jlpt_quiz_history', JSON.stringify(histories));
  }
}
