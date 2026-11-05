import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RubySegment } from '../../core/services/grammar.service';

/**
 * Hiển thị câu tiếng Nhật đã tách đoạn: furigana (ruby), ô trống （　）
 * và ô sắp xếp ＿★＿. Có thể điền đáp án vào ô sau khi trả lời.
 */
@Component({
  selector: 'app-ruby-text',
  standalone: true,
  imports: [CommonModule],
  template: `<ng-container *ngFor="let s of segments">
    <span *ngIf="s.blank"
          class="mx-1 inline-block min-w-[4.5rem] border-b-2 px-2 text-center leading-tight"
          [ngClass]="blankFill ? 'border-emerald-500 font-bold text-emerald-700 dark:text-emerald-300' : 'border-slate-400 dark:border-slate-500'">{{ blankFill || nbsp }}</span>
    <span *ngIf="s.slot"
          class="mx-1 inline-block min-w-[3.5rem] border-b-2 px-1.5 text-center leading-tight"
          [ngClass]="slotClass(s)">{{ slotFill?.[s.slot - 1] || (s.star ? '★' : nbsp) }}</span>
    <span *ngIf="s.t !== undefined" [ngClass]="highlight(s)"><ruby *ngIf="s.r && furigana; else plain">{{ s.t }}<rt>{{ s.r }}</rt></ruby><ng-template #plain>{{ s.t }}</ng-template></span>
  </ng-container>`
})
export class RubyTextComponent {
  @Input() segments: RubySegment[] = [];
  @Input() furigana = true;
  @Input() blankFill = '';
  @Input() slotFill: string[] | null = null;
  @Input() emphasize = true;

  readonly nbsp = ' ';

  highlight(s: RubySegment): string {
    if (!this.emphasize || !s.hl) return '';
    return s.hl === 2
      ? 'rounded bg-amber-100 font-bold text-amber-900 dark:bg-amber-400/20 dark:text-amber-200'
      : 'font-semibold text-indigo-700 underline decoration-indigo-300 decoration-2 underline-offset-4 dark:text-indigo-300 dark:decoration-indigo-500/60';
  }

  slotClass(s: RubySegment): string {
    if (this.slotFill) {
      return s.star
        ? 'border-amber-500 bg-amber-100 font-bold text-amber-900 dark:bg-amber-400/20 dark:text-amber-200'
        : 'border-indigo-400 font-semibold text-indigo-700 dark:text-indigo-300';
    }
    return s.star
      ? 'border-amber-500 font-bold text-amber-600 dark:text-amber-400'
      : 'border-slate-400 dark:border-slate-500';
  }
}
