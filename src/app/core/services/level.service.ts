import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class LevelService {
  // Lấy cấp độ đã lưu từ localStorage hoặc mặc định là N4
  private currentLevelSubject = new BehaviorSubject<string>(localStorage.getItem('jlpt_level') || 'N4');
  currentLevel$ = this.currentLevelSubject.asObservable();

  get currentLevel(): string {
    return this.currentLevelSubject.value;
  }

  setLevel(level: string) {
    localStorage.setItem('jlpt_level', level);
    this.currentLevelSubject.next(level);
  }
}
