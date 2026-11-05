import { Component, EventEmitter, HostListener, Input, OnChanges, OnDestroy, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { GrammarLesson, GrammarPoint, GrammarProgress, GrammarQuestion, GrammarService } from '../../../core/services/grammar.service';
import { QuizHistory, QuizHistoryDetail, QuizService } from '../../../core/services/quiz.service';
import { UserService } from '../../../core/services/user.service';
import { TtsService } from '../../../core/services/tts.service';
import { RubyTextComponent } from '../../../shared/ruby-text/ruby-text.component';

type GrammarView = 'lessons' | 'study' | 'playing' | 'result';
type QuestionFilter = 'all' | 'choice' | 'order';
type PracticeMode = 'practice' | 'exam';

const FURIGANA_KEY = 'jlpt_grammar_furigana';

@Component({
  selector: 'app-grammar-practice',
  standalone: true,
  imports: [CommonModule, FormsModule, RubyTextComponent],
  templateUrl: './grammar-practice.component.html'
})
export class GrammarPracticeComponent implements OnChanges, OnDestroy {
  private grammarService = inject(GrammarService);
  private quizService = inject(QuizService);
  private userService = inject(UserService);
  public ttsService = inject(TtsService);

  @Input() level = 'N3';
  // true khi đang học/làm bài, để trang cha ẩn thanh chọn danh mục
  @Output() sessionChange = new EventEmitter<boolean>();
  @Output() openHistory = new EventEmitter<void>();

  readonly letters = ['A', 'B', 'C', 'D'];
  get Math() { return Math; }

  view: GrammarView = 'lessons';
  loading = true;
  lessons: GrammarLesson[] = [];
  selectedLessons: { [lesson: string]: boolean } = {};
  progress: { [lesson: string]: GrammarProgress } = {};

  // --- Settings ---
  filter: QuestionFilter = 'all';
  mode: PracticeMode = 'practice';
  questionCount = 0; // 0 = tất cả
  showFurigana = localStorage.getItem(FURIGANA_KEY) === '1';

  // --- Study ---
  studyLesson: GrammarLesson | null = null;
  expandedPoints: { [pattern: string]: boolean } = {};

  // --- Playing ---
  title = '';
  questions: GrammarQuestion[] = [];
  answers: (number | null)[] = [];
  currentIndex = 0;
  revealed = false;
  private sourceLessons: GrammarLesson[] = [];
  private sourceQuestions: GrammarQuestion[] | null = null;

  // --- Result ---
  score = 0;
  expGained = 0;
  expandedReview: { [i: number]: boolean } = {};
  reviewWrongOnly = false;

  private sub?: Subscription;

  ngOnChanges() {
    this.sub?.unsubscribe();
    this.loading = true;
    this.sub = this.grammarService.getLessons(this.level).subscribe(lessons => {
      this.lessons = lessons;
      this.lessons.forEach(l => {
        if (this.selectedLessons[l.lesson] === undefined) {
          this.selectedLessons[l.lesson] = true;
        }
      });
      this.progress = this.grammarService.getProgress();
      this.loading = false;
    });
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
    this.ttsService.stop();
  }

  // --- Lesson list ---
  get totalQuestions(): number {
    return this.lessons.reduce((sum, l) => sum + l.questions.length, 0);
  }

  get totalPoints(): number {
    return this.lessons.reduce((sum, l) => sum + l.points.length, 0);
  }

  get selectedCount(): number {
    return this.lessons.filter(l => this.selectedLessons[l.lesson]).length;
  }

  toggleAll(select: boolean) {
    this.lessons.forEach(l => this.selectedLessons[l.lesson] = select);
  }

  filteredCount(lesson: GrammarLesson): number {
    return this.applyFilter(lesson.questions).length;
  }

  // --- Study view ---
  openStudy(lesson: GrammarLesson) {
    this.studyLesson = lesson;
    this.expandedPoints = {};
    this.setView('study');
    window.scrollTo({ top: 0 });
  }

  visibleExamples(point: GrammarPoint): GrammarQuestion[] {
    return this.expandedPoints[point.pattern] ? point.examples : point.examples.slice(0, 2);
  }

  speak(text: string) {
    this.ttsService.stop();
    this.ttsService.speak(text, 'ja-JP');
  }

  // --- Start quiz ---
  startLesson(lesson: GrammarLesson | null) {
    if (!lesson) return;
    this.sourceLessons = [lesson];
    this.sourceQuestions = null;
    this.begin(lesson.questions, `Ngữ pháp ${this.level} • ${lesson.lesson}`);
  }

  startSelected() {
    const lessons = this.lessons.filter(l => this.selectedLessons[l.lesson]);
    if (lessons.length === 0) {
      alert('Vui lòng chọn ít nhất 1 buổi học!');
      return;
    }
    this.sourceLessons = lessons;
    this.sourceQuestions = null;
    const all = lessons.reduce<GrammarQuestion[]>((acc, l) => acc.concat(l.questions), []);
    this.begin(all, `Ngữ pháp ${this.level} • Tổng hợp ${lessons.length} buổi`);
  }

  retry() {
    if (this.sourceQuestions) {
      this.begin(this.sourceQuestions, this.title, false);
    } else if (this.sourceLessons.length === 1) {
      this.startLesson(this.sourceLessons[0]);
    } else {
      this.startSelected();
    }
  }

  retryWrong() {
    const wrong = this.questions.filter((q, i) => this.answers[i] !== q.answer);
    if (wrong.length === 0) return;
    this.sourceQuestions = wrong;
    this.begin(wrong, `${this.title.replace(/ • Ôn câu sai$/, '')} • Ôn câu sai`, false);
  }

  private applyFilter(questions: GrammarQuestion[]): GrammarQuestion[] {
    if (this.filter === 'all') return questions;
    return questions.filter(q => this.filter === 'order' ? q.type === 'order' : q.type !== 'order');
  }

  private begin(pool: GrammarQuestion[], title: string, useFilter = true) {
    const filtered = useFilter ? this.applyFilter(pool) : pool;
    if (filtered.length === 0) {
      alert('Không có câu hỏi nào phù hợp với dạng bài đã chọn!');
      return;
    }
    // Không xáo trộn đáp án: phần phân tích trong dữ liệu gọi đáp án theo A/B/C/D
    const shuffled = [...filtered].sort(() => Math.random() - 0.5);
    const limit = this.questionCount > 0 ? Math.min(this.questionCount, shuffled.length) : shuffled.length;
    this.questions = shuffled.slice(0, limit);
    this.answers = this.questions.map(() => null);
    this.currentIndex = 0;
    this.revealed = false;
    this.title = title;
    this.expandedReview = {};
    this.setView('playing');
    window.scrollTo({ top: 0 });
  }

  // --- Playing ---
  get current(): GrammarQuestion {
    return this.questions[this.currentIndex];
  }

  get answeredCount(): number {
    return this.answers.filter(a => a !== null).length;
  }

  get canGoNext(): boolean {
    return this.mode === 'exam' ? true : this.revealed;
  }

  select(index: number) {
    if (index >= this.current.options.length) return;
    if (this.mode === 'practice') {
      if (this.revealed) return;
      this.answers[this.currentIndex] = index;
      this.revealed = true;
    } else {
      this.answers[this.currentIndex] = index;
    }
  }

  next() {
    if (!this.canGoNext) return;
    if (this.currentIndex < this.questions.length - 1) {
      this.goTo(this.currentIndex + 1);
    } else {
      this.finish();
    }
  }

  prev() {
    if (this.mode === 'exam' && this.currentIndex > 0) {
      this.goTo(this.currentIndex - 1);
    }
  }

  goTo(index: number) {
    this.ttsService.stop();
    this.currentIndex = index;
    this.revealed = this.mode === 'practice' && this.answers[index] !== null;
  }

  submitExam() {
    const unanswered = this.questions.length - this.answeredCount;
    if (unanswered > 0 && !confirm(`Còn ${unanswered} câu chưa trả lời. Bạn vẫn muốn nộp bài?`)) {
      return;
    }
    this.finish();
  }

  quit() {
    if (this.answeredCount > 0 && !confirm('Thoát bài làm? Kết quả của lần này sẽ không được lưu.')) {
      return;
    }
    this.ttsService.stop();
    this.setView(this.studyLesson && this.sourceLessons[0] === this.studyLesson ? 'study' : 'lessons');
  }

  backToLessons() {
    this.ttsService.stop();
    this.progress = this.grammarService.getProgress();
    this.setView('lessons');
  }

  toggleFurigana() {
    this.showFurigana = !this.showFurigana;
    localStorage.setItem(FURIGANA_KEY, this.showFurigana ? '1' : '0');
  }

  optionState(q: GrammarQuestion, qIndex: number, optIndex: number): 'idle' | 'chosen' | 'correct' | 'wrong' | 'dim' {
    const chosen = this.answers[qIndex];
    const reveal = this.view === 'result' || (this.revealed && qIndex === this.currentIndex);
    if (!reveal) return chosen === optIndex ? 'chosen' : 'idle';
    if (optIndex === q.answer) return 'correct';
    if (optIndex === chosen) return 'wrong';
    return 'dim';
  }

  optionClass(state: string): string {
    switch (state) {
      case 'chosen':
        return 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10';
      case 'correct':
        return 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10';
      case 'wrong':
        return 'border-rose-500 bg-rose-50 dark:bg-rose-500/10';
      case 'dim':
        return 'border-slate-200 bg-white opacity-60 dark:border-slate-800 dark:bg-slate-900';
      default:
        return 'border-slate-200 bg-white hover:border-indigo-400 hover:bg-indigo-50/40 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-500/60 dark:hover:bg-indigo-500/5';
    }
  }

  letterClass(state: string): string {
    switch (state) {
      case 'chosen':
        return 'bg-indigo-600 text-white';
      case 'correct':
        return 'bg-emerald-600 text-white';
      case 'wrong':
        return 'bg-rose-600 text-white';
      default:
        return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
    }
  }

  // Tên phần thi và lời dẫn giống đề JLPT để quen mắt
  sectionLabel(q: GrammarQuestion): string {
    if (q.type === 'order') return '問題２　文の組み立て';
    if (q.type === 'sentence') return '用法';
    return '問題１　文法形式の判断';
  }

  instruction(q: GrammarQuestion): string {
    if (q.type === 'order') return 'つぎの文の ★ に入る最もよいものを、A・B・C・Dから一つえらびなさい。';
    if (q.type === 'sentence') return '正しい使い方の文を、A・B・C・Dから一つえらびなさい。';
    return 'つぎの文の（　　　）に入れるのに最もよいものを、A・B・C・Dから一つえらびなさい。';
  }

  orderedPieces(q: GrammarQuestion): string[] | null {
    return q.order ? q.order.map(i => q.options[i].text) : null;
  }

  chosenText(i: number): string {
    const chosen = this.answers[i];
    return chosen === null ? 'Chưa trả lời' : `${this.letters[chosen]}. ${this.questions[i].options[chosen].text}`;
  }

  trackReview = (_: number, item: { i: number }) => item.i;

  get reviewItems(): { q: GrammarQuestion; i: number }[] {
    const items = this.questions.map((q, i) => ({ q, i }));
    return this.reviewWrongOnly ? items.filter(({ q, i }) => this.answers[i] !== q.answer) : items;
  }

  // --- Result ---
  private finish() {
    this.ttsService.stop();
    this.score = this.questions.filter((q, i) => this.answers[i] === q.answer).length;
    this.expGained = this.score * 10;
    this.userService.addExp(this.expGained);

    const percent = Math.round((this.score / this.questions.length) * 100);
    if (this.sourceLessons.length === 1 && !this.sourceQuestions) {
      this.grammarService.saveProgress(this.sourceLessons[0].lesson, percent);
    }

    const details: QuizHistoryDetail[] = this.questions.map((q, i) => {
      const chosen = this.answers[i];
      return {
        questionText: q.question,
        furigana: q.sentence,
        options: q.options.map((o, oi) => ({ text: o.text, isCorrect: oi === q.answer, explanation: o.meaning })),
        selectedAnswer: chosen !== null ? q.options[chosen].text : null,
        isCorrect: chosen === q.answer,
        explanation: [
          `【${q.pattern}】${q.meaning}`,
          q.translation ? `Dịch: ${q.translation}` : '',
          q.analysis ? `Phân tích:\n${q.analysis}` : ''
        ].filter(Boolean).join('\n\n')
      };
    });

    const history: QuizHistory = {
      id: Date.now().toString(),
      date: Date.now(),
      mode: 'fixed',
      category: 'grammar',
      lessonTitle: this.title,
      level: this.level,
      score: this.score,
      totalQuestions: this.questions.length,
      details
    };
    this.quizService.saveQuizHistory(history);
    this.reviewWrongOnly = this.wrongCount > 0;
    this.setView('result');
    window.scrollTo({ top: 0 });
  }

  typeStats(type: 'choice' | 'order'): { correct: number; total: number } {
    const idx = this.questions
      .map((q, i) => ({ q, i }))
      .filter(({ q }) => type === 'order' ? q.type === 'order' : q.type !== 'order');
    return {
      correct: idx.filter(({ q, i }) => this.answers[i] === q.answer).length,
      total: idx.length
    };
  }

  get wrongCount(): number {
    return this.questions.length - this.score;
  }

  get scorePercent(): number {
    return this.questions.length ? Math.round((this.score / this.questions.length) * 100) : 0;
  }

  get resultMessage(): string {
    const p = this.scorePercent;
    if (p === 100) return 'Xuất sắc! Bạn đã nắm vững toàn bộ.';
    if (p >= 80) return 'Rất tốt! Chỉ cần ôn lại vài điểm nhỏ.';
    if (p >= 60) return 'Khá ổn. Hãy xem lại các câu sai bên dưới.';
    return 'Cần ôn thêm. Hãy đọc lại phần lý thuyết rồi làm lại nhé.';
  }

  private setView(view: GrammarView) {
    this.view = view;
    this.sessionChange.emit(view !== 'lessons');
  }

  // --- Keyboard: 1-4 / A-D chọn đáp án, Enter sang câu, F bật furigana ---
  @HostListener('window:keydown', ['$event'])
  onKeydown(e: KeyboardEvent) {
    if (this.view !== 'playing' || e.ctrlKey || e.metaKey || e.altKey) return;
    const target = e.target as HTMLElement;
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(target?.tagName)) return;

    const key = e.key.toLowerCase();
    const numeric = ['1', '2', '3', '4'].indexOf(key);
    const letter = ['a', 'b', 'c', 'd'].indexOf(key);
    if (numeric >= 0 || letter >= 0) {
      this.select(numeric >= 0 ? numeric : letter);
      e.preventDefault();
    } else if (key === 'enter' || key === 'arrowright') {
      if (this.mode === 'exam' && this.currentIndex === this.questions.length - 1) return;
      this.next();
      e.preventDefault();
    } else if (key === 'arrowleft') {
      this.prev();
    } else if (key === 'f') {
      this.toggleFurigana();
    }
  }
}
