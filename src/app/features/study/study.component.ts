import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { VocabItem, VocabService } from '../../core/services/vocab.service';
import { LevelService } from '../../core/services/level.service';
import { combineLatest } from 'rxjs';

@Component({
  selector: 'app-study',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './study.component.html',
  styleUrl: './study.component.scss'
})
export class StudyComponent implements OnInit {
  private vocabService = inject(VocabService);
  private levelService = inject(LevelService);
  
  vocabs: VocabItem[] = [];
  currentIndex: number = 0;
  isFlipped: boolean = false;
  isFinished: boolean = false;

  ngOnInit() {
    combineLatest([
      this.vocabService.getVocabs(),
      this.levelService.currentLevel$
    ]).subscribe(([data, level]) => {
      const filteredData = data.filter(v => v.jlptLevel === level || (!v.jlptLevel && level === 'N4'));
      this.vocabs = filteredData.sort(() => Math.random() - 0.5); // Trộn thẻ ngẫu nhiên
      this.resetStudy();
    });
  }

  resetStudy() {
    this.currentIndex = 0;
    this.isFlipped = false;
    this.isFinished = this.vocabs.length === 0;
  }

  flipCard() {
    if (!this.isFlipped) {
      this.isFlipped = true;
    }
  }

  markAnswer(quality: number) {
    const currentItem = this.vocabs[this.currentIndex];
    
    let newLevel = currentItem.level || 0;
    let intervalDays = 1;

    // Logic SRS cơ bản
    if (quality === 0) {
      newLevel = 0;
      intervalDays = 0;
    } else {
      newLevel += 1;
      if (newLevel === 1) intervalDays = 1;
      else if (newLevel === 2) intervalDays = 3;
      else if (newLevel === 3) intervalDays = 7;
      else intervalDays = 14;
    }

    const nextReviewDate = Date.now() + intervalDays * 24 * 60 * 60 * 1000;

    // Cập nhật thẻ lên DB
    if (currentItem.id) {
      this.vocabService.updateVocab(currentItem.id, {
        level: newLevel,
        nextReviewDate: nextReviewDate
      });
    }

    // Chuyển thẻ tiếp theo
    this.isFlipped = false;
    this.currentIndex++;
    if (this.currentIndex >= this.vocabs.length) {
      this.isFinished = true;
    }
  }
}
