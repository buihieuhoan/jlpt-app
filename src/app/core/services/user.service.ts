import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface UserStats {
  exp: number;
  level: number;
  streak: number;
  lastStudyDate: string; // ISO date string YYYY-MM-DD
}

@Injectable({
  providedIn: 'root'
})
export class UserService {
  private statsSubject = new BehaviorSubject<UserStats>(this.loadStats());
  stats$ = this.statsSubject.asObservable();

  get stats(): UserStats {
    return this.statsSubject.value;
  }

  private loadStats(): UserStats {
    const saved = localStorage.getItem('jlpt_user_stats');
    if (saved) {
      const stats = JSON.parse(saved) as UserStats;
      // Check streak
      this.checkAndUpdateStreak(stats);
      return stats;
    }
    return {
      exp: 0,
      level: 1,
      streak: 0,
      lastStudyDate: ''
    };
  }

  private checkAndUpdateStreak(stats: UserStats) {
    if (!stats.lastStudyDate) return;
    
    const today = new Date();
    const lastDate = new Date(stats.lastStudyDate);
    
    // Đặt giờ về 0 để so sánh ngày
    today.setHours(0, 0, 0, 0);
    lastDate.setHours(0, 0, 0, 0);
    
    const diffTime = Math.abs(today.getTime() - lastDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
    
    if (diffDays > 1) {
      // Đã bỏ lỡ hơn 1 ngày -> Mất streak
      stats.streak = 0;
    }
  }

  addExp(amount: number) {
    const s = { ...this.stats };
    s.exp += amount;
    
    // Mỗi 1000 EXP lên 1 cấp
    s.level = Math.floor(s.exp / 1000) + 1;
    
    this.updateStudyDate(s);
    this.saveStats(s);
  }

  private updateStudyDate(s: UserStats) {
    const todayStr = new Date().toISOString().split('T')[0];
    if (s.lastStudyDate !== todayStr) {
      if (s.lastStudyDate) {
        const today = new Date();
        const lastDate = new Date(s.lastStudyDate);
        today.setHours(0, 0, 0, 0);
        lastDate.setHours(0, 0, 0, 0);
        const diffTime = Math.abs(today.getTime() - lastDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
        
        if (diffDays === 1) {
          s.streak += 1;
        } else if (diffDays > 1) {
          s.streak = 1; // Bắt đầu lại
        }
      } else {
        s.streak = 1; // Ngày đầu tiên
      }
      s.lastStudyDate = todayStr;
    }
  }

  private saveStats(stats: UserStats) {
    localStorage.setItem('jlpt_user_stats', JSON.stringify(stats));
    this.statsSubject.next(stats);
  }
}
