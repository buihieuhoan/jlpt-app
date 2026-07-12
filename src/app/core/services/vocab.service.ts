import { Injectable, inject } from '@angular/core';
import { Firestore, collection, collectionData, doc, addDoc, updateDoc, deleteDoc } from '@angular/fire/firestore';
import { Observable } from 'rxjs';

export interface VocabItem {
  id?: string;
  type: string;
  lesson?: number;
  partOfSpeech?: string;
  front: string;
  hiragana?: string;
  back: string;
  example?: string;
  jlptLevel?: string; // e.g., 'N5', 'N4', 'N3'
  level: number; // For SRS
  nextReviewDate: number; // Timestamp
}

@Injectable({
  providedIn: 'root'
})
export class VocabService {
  private firestore = inject(Firestore);
  private vocabCollection = collection(this.firestore, 'vocabularies');

  // Lấy toàn bộ danh sách từ vựng
  getVocabs(): Observable<VocabItem[]> {
    return collectionData(this.vocabCollection, { idField: 'id' }) as Observable<VocabItem[]>;
  }

  // Thêm từ mới
  addVocab(item: VocabItem) {
    return addDoc(this.vocabCollection, item);
  }

  // Cập nhật từ vựng (hoặc cập nhật kết quả học tập SRS)
  updateVocab(id: string, data: Partial<VocabItem>) {
    const docRef = doc(this.firestore, `vocabularies/${id}`);
    return updateDoc(docRef, data);
  }

  // Xóa từ vựng
  deleteVocab(id: string) {
    const docRef = doc(this.firestore, `vocabularies/${id}`);
    return deleteDoc(docRef);
  }
}
