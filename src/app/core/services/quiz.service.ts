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
  level: string;
  score: number;
  totalQuestions: number;
  details: QuizHistoryDetail[];
}

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

  saveQuizHistory(history: QuizHistory) {
    const histories = this.getQuizHistory();
    histories.unshift(history); // Thêm vào đầu để hiển thị mới nhất trước
    localStorage.setItem('jlpt_quiz_history', JSON.stringify(histories));
  }
}
