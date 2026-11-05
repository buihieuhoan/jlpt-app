import { Component, HostListener, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { VocabItem, VocabService } from '../../core/services/vocab.service';
import { LevelService } from '../../core/services/level.service';
import { UserService } from '../../core/services/user.service';
import { QuizService, QuizQuestionDB, QuizHistory, QuizHistoryDetail } from '../../core/services/quiz.service';
import { TtsService } from '../../core/services/tts.service';
import { GrammarService, RubySegment } from '../../core/services/grammar.service';
import { FuriganaService } from '../../core/services/furigana.service';
import { buildQuestionRuby, hasKanji, markedTargets, readingsFromText, toRuby, wordRuby } from '../../core/utils/furigana';
import { GrammarPracticeComponent } from './grammar/grammar-practice.component';
import { RubyTextComponent } from '../../shared/ruby-text/ruby-text.component';
import { combineLatest, switchMap } from 'rxjs';

export interface QuizOption {
  text: string;
  isCorrect: boolean;
  explanation: string;
  ruby?: RubySegment[];
}

export interface QuizQuestion {
  type: 'kanji-hiragana' | 'hiragana-kanji' | 'word-meaning' | 'meaning-word' | 'fixed';
  questionText: string;
  questionRuby?: RubySegment[];
  options: QuizOption[];
  optionRubyBeforeAnswer?: boolean; // false: chỉ hiện furigana đáp án sau khi trả lời (tránh lộ đáp án)
  originalItem?: VocabItem; // only for auto generated
  dbItem?: QuizQuestionDB; // for fixed from db
}

export interface KanjiLessonGroup {
  lesson: string;
  lessonNum: number;
  count: number;
  quizzes: QuizQuestionDB[];
  sampleQuestion: string;
}

@Component({
  selector: 'app-quiz',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, GrammarPracticeComponent, RubyTextComponent],
  templateUrl: './quiz.component.html',
  styleUrl: './quiz.component.scss'
})
export class QuizComponent implements OnInit, OnDestroy {
  private vocabService = inject(VocabService);
  private levelService = inject(LevelService);
  private userService = inject(UserService);
  private quizService = inject(QuizService);
  public ttsService = inject(TtsService);
  private grammarService = inject(GrammarService);
  public furigana = inject(FuriganaService);

  currentLevel = 'N3';
  
  // Category Tab: 'kanji', 'vocab' or 'grammar' (nhớ lựa chọn gần nhất)
  activeCategory: 'kanji' | 'vocab' | 'grammar' =
    (localStorage.getItem('jlpt_quiz_category') as 'kanji' | 'vocab' | 'grammar') || 'kanji';
  get Math() { return Math; }

  // --- Kanji State ---
  allFixedQuizzes: QuizQuestionDB[] = [];
  kanjiQuizzes: QuizQuestionDB[] = [];
  kanjiLessons: KanjiLessonGroup[] = [];
  filteredKanjiLessons: KanjiLessonGroup[] = [];
  selectedKanjiLessons: { [lesson: string]: boolean } = {};
  kanjiSearchQuery: string = '';

  // --- Vocab State ---
  availableVocabs: VocabItem[] = [];
  vocabFixedQuizzes: QuizQuestionDB[] = [];
  availableVocabLessons: string[] = [];
  selectedVocabLessons: { [key: string]: boolean } = {};
  vocabQuizMode: 'auto' | 'fixed' = 'fixed';
  selectedTypes = {
    'kanji-hiragana': true,
    'hiragana-kanji': true,
    'word-meaning': true,
    'meaning-word': true
  };

  // --- Grammar State (logic nằm trong GrammarPracticeComponent) ---
  grammarQuestionCount = 0;
  grammarLessonCount = 0;
  grammarInSession = false;

  // --- Global Settings ---
  questionCount: number = 0; // 0 = all questions in lesson, or 10, 20, 50
  timePerQuestion: number = 0; // 0 = no limit

  // --- Playing State ---
  stage: 'setup' | 'playing' | 'result' | 'history' | 'history-detail' = 'setup';
  currentQuizTitle: string = '';
  questions: QuizQuestion[] = [];
  currentIndex: number = 0;
  score: number = 0;
  mistakes: QuizQuestion[] = [];
  selectedAnswer: QuizOption | null = null;
  isAnswerCorrect: boolean | null = null;
  showExplanation: boolean = false;
  expGained: number = 0;
  lastPlayedLessonGroup: KanjiLessonGroup | null = null;
  
  // --- History State ---
  historyDetails: QuizHistoryDetail[] = [];
  histories: QuizHistory[] = [];
  selectedHistory: QuizHistory | null = null;
  
  // --- Timer ---
  timeLeft: number = 0;
  timerInterval: any;

  ngOnInit() {
    combineLatest([
      this.vocabService.getVocabs(),
      this.quizService.getQuizzes(),
      this.levelService.currentLevel$
    ]).subscribe(([vocabs, quizzes, level]) => {
      this.currentLevel = level;
      this.allFixedQuizzes = quizzes;

      // Filter vocabs for current level
      this.availableVocabs = vocabs.filter(v => v.jlptLevel === level || (!v.jlptLevel && level === 'N4'));

      // Filter quizzes into Kanji vs Vocab
      // If quiz has category === 'kanji' or tags contain 'kanji'
      this.kanjiQuizzes = quizzes.filter(q => {
        const isKanji = q.category === 'kanji' || (q.tags && q.tags.includes('kanji'));
        const matchesLevel = q.jlptLevel === level || (!q.jlptLevel && level === 'N3');
        return isKanji && matchesLevel;
      });

      this.vocabFixedQuizzes = quizzes.filter(q => {
        const isKanji = q.category === 'kanji' || (q.tags && q.tags.includes('kanji'));
        const matchesLevel = q.jlptLevel === level || (!q.jlptLevel && level === 'N3');
        return !isKanji && matchesLevel;
      });

      // Group Kanji Quizzes by Lesson
      this.buildKanjiLessons();

      // Build Vocab Lessons
      this.buildVocabLessons();
    });

    this.levelService.currentLevel$
      .pipe(switchMap(level => this.grammarService.getLessons(level)))
      .subscribe(lessons => {
        this.grammarLessonCount = lessons.length;
        this.grammarQuestionCount = lessons.reduce((sum, l) => sum + l.questions.length, 0);
      });
  }

  ngOnDestroy() {
    this.clearTimer();
    this.ttsService.stop();
  }

  setCategory(cat: 'kanji' | 'vocab' | 'grammar') {
    this.activeCategory = cat;
    localStorage.setItem('jlpt_quiz_category', cat);
  }

  // --- Kanji Lesson Grouping ---
  buildKanjiLessons() {
    const lessonMap = new Map<string, QuizQuestionDB[]>();
    for (const q of this.kanjiQuizzes) {
      const lessonName = q.lesson ? q.lesson.trim() : 'Chưa phân loại';
      if (!lessonMap.has(lessonName)) {
        lessonMap.set(lessonName, []);
      }
      lessonMap.get(lessonName)!.push(q);
    }

    const groups: KanjiLessonGroup[] = [];
    lessonMap.forEach((quizzesInLesson, lessonName) => {
      const match = lessonName.match(/\d+/);
      const lessonNum = match ? parseInt(match[0]) : 999;
      groups.push({
        lesson: lessonName,
        lessonNum: lessonNum,
        count: quizzesInLesson.length,
        quizzes: quizzesInLesson,
        sampleQuestion: quizzesInLesson[0]?.question || ''
      });
    });

    // Sort ascending by lesson number (Bài 1, Bài 2, ... Bài 35)
    groups.sort((a, b) => a.lessonNum - b.lessonNum);
    this.kanjiLessons = groups;

    // Default select all lessons for multi-quiz
    this.kanjiLessons.forEach(l => {
      if (this.selectedKanjiLessons[l.lesson] === undefined) {
        this.selectedKanjiLessons[l.lesson] = true;
      }
    });

    this.filterKanjiLessons();
  }

  filterKanjiLessons() {
    if (!this.kanjiSearchQuery.trim()) {
      this.filteredKanjiLessons = [...this.kanjiLessons];
      return;
    }
    const q = this.kanjiSearchQuery.toLowerCase().trim();
    this.filteredKanjiLessons = this.kanjiLessons.filter(l => 
      l.lesson.toLowerCase().includes(q) || 
      l.lessonNum.toString() === q ||
      l.sampleQuestion.toLowerCase().includes(q)
    );
  }

  toggleAllKanjiLessons(select: boolean) {
    this.kanjiLessons.forEach(l => this.selectedKanjiLessons[l.lesson] = select);
  }

  get selectedKanjiCount(): number {
    return Object.values(this.selectedKanjiLessons).filter(v => v).length;
  }

  // --- Vocab Lessons Grouping ---
  buildVocabLessons() {
    const lessons = new Set<string>();
    this.availableVocabs.forEach(v => {
      lessons.add(v.lesson ? v.lesson.toString() : '0');
    });
    this.vocabFixedQuizzes.forEach(q => {
      if (q.lesson) {
        const match = q.lesson.match(/\d+/);
        if (match) lessons.add(match[0]);
        else lessons.add('0');
      } else {
        lessons.add('0');
      }
    });

    this.availableVocabLessons = Array.from(lessons).sort((a, b) => {
      const nA = parseInt(a), nB = parseInt(b);
      if (!isNaN(nA) && !isNaN(nB)) return nA - nB;
      return a.localeCompare(b);
    });

    this.availableVocabLessons.forEach(l => {
      if (this.selectedVocabLessons[l] === undefined) {
        this.selectedVocabLessons[l] = true;
      }
    });
  }

  toggleAllVocabLessons() {
    const currentState = Object.values(this.selectedVocabLessons).some(v => v);
    this.availableVocabLessons.forEach(l => this.selectedVocabLessons[l] = !currentState);
  }

  // --- Start Quiz Methods ---

  // 1. Start a Single Kanji Lesson (e.g. Bài 1 with 20 questions)
  startSingleKanjiLesson(group: KanjiLessonGroup) {
    this.lastPlayedLessonGroup = group;
    this.currentQuizTitle = `Kanji ${this.currentLevel} • ${group.lesson}`;
    
    // Shuffle the questions in this lesson
    const shuffled = [...group.quizzes].sort(() => Math.random() - 0.5);
    const limit = this.questionCount > 0 ? Math.min(this.questionCount, shuffled.length) : shuffled.length;
    const selected = shuffled.slice(0, limit);

    this.initQuizQuestionsFromFixed(selected);
  }

  // 2. Start Multi-lesson Kanji Quiz
  startMultiKanjiQuiz() {
    this.lastPlayedLessonGroup = null;
    const selectedLessons = this.kanjiLessons.filter(l => this.selectedKanjiLessons[l.lesson]);
    if (selectedLessons.length === 0) {
      alert('Vui lòng chọn ít nhất 1 bài học!');
      return;
    }

    let allQuestions: QuizQuestionDB[] = [];
    selectedLessons.forEach(l => {
      allQuestions = allQuestions.concat(l.quizzes);
    });

    if (allQuestions.length === 0) {
      alert('Không có câu hỏi nào trong các bài đã chọn!');
      return;
    }

    const shuffled = [...allQuestions].sort(() => Math.random() - 0.5);
    const limit = this.questionCount > 0 ? Math.min(this.questionCount, shuffled.length) : shuffled.length;
    const selected = shuffled.slice(0, limit);

    this.currentQuizTitle = `Kanji ${this.currentLevel} • ${selectedLessons.length} bài (${selected.length} câu)`;
    this.initQuizQuestionsFromFixed(selected);
  }

  // 3. Start Vocab Quiz
  startVocabQuiz() {
    this.lastPlayedLessonGroup = null;
    if (this.vocabQuizMode === 'auto') {
      this.startAutoQuiz();
    } else {
      this.startVocabFixedQuiz();
    }
  }

  startVocabFixedQuiz() {
    let filteredQuizzes = this.vocabFixedQuizzes.filter(q => {
      let lStr = '0';
      if (q.lesson) {
        const match = q.lesson.match(/\d+/);
        if (match) lStr = match[0];
      }
      return this.selectedVocabLessons[lStr];
    });

    if (filteredQuizzes.length === 0) {
      alert('Không có câu hỏi từ vựng nào trong Database cho các bài học đã chọn!');
      return;
    }

    const shuffled = [...filteredQuizzes].sort(() => Math.random() - 0.5);
    const limit = this.questionCount > 0 ? Math.min(this.questionCount, shuffled.length) : 10;
    const selected = shuffled.slice(0, limit);

    this.currentQuizTitle = `Từ vựng ${this.currentLevel} • Đề cố định (${selected.length} câu)`;
    this.initQuizQuestionsFromFixed(selected);
  }

  startAutoQuiz() {
    const filteredVocabs = this.availableVocabs.filter(v => {
      const lStr = v.lesson ? v.lesson.toString() : '0';
      return this.selectedVocabLessons[lStr];
    });

    if (filteredVocabs.length < 4) {
      alert('Không đủ từ vựng trong các bài đã chọn để tạo bài thi (cần ít nhất 4 từ)!');
      return;
    }

    const types: any[] = Object.keys(this.selectedTypes).filter(k => (this.selectedTypes as any)[k]);
    if (types.length === 0) {
      alert('Vui lòng chọn ít nhất 1 dạng câu hỏi!');
      return;
    }

    const count = this.questionCount > 0 ? this.questionCount : 10;
    const shuffled = [...filteredVocabs].sort(() => Math.random() - 0.5);
    const selectedVocabs = shuffled.slice(0, Math.min(count, filteredVocabs.length));

    this.currentQuizTitle = `Từ vựng ${this.currentLevel} • Tạo tự động (${selectedVocabs.length} câu)`;
    this.questions = selectedVocabs.map(vocab => {
      const type = types[Math.floor(Math.random() * types.length)];
      return this.generateQuestion(vocab, type, this.availableVocabs);
    });

    this.currentIndex = 0;
    this.score = 0;
    this.mistakes = [];
    this.historyDetails = [];
    this.stage = 'playing';
    this.setupCurrentQuestion();
  }

  // --- Helper to initialize fixed questions ---
  private initQuizQuestionsFromFixed(quizzes: QuizQuestionDB[]) {
    this.questions = quizzes.map(q => this.buildFixedQuestion(q));

    this.currentIndex = 0;
    this.score = 0;
    this.mistakes = [];
    this.historyDetails = [];
    this.stage = 'playing';
    this.setupCurrentQuestion();
  }

  // Furigana cho đề và đáp án, bỏ mọi cách đọc có thể làm lộ đáp án
  private buildFixedQuestion(q: QuizQuestionDB): QuizQuestion {
    const isKanji = q.category === 'kanji' || !!q.tags?.includes('kanji');
    const correct = q.options[q.correctAnswerIndex] ?? '';
    const readings = readingsFromText(`${q.explanation}
${q.furigana ?? ''}`);

    const options: QuizOption[] = q.options.map((optText, index) => ({
      text: optText,
      isCorrect: index === q.correctAnswerIndex,
      explanation: index === q.correctAnswerIndex ? q.explanation : 'Đáp án sai',
      ruby: hasKanji(optText) ? toRuby(optText, readings) : undefined
    }));

    return {
      type: 'fixed',
      questionText: q.question,
      questionRuby: buildQuestionRuby(q.question, q.furigana, [correct], isKanji ? markedTargets(q.furigana ?? '') : []),
      options: options.sort(() => Math.random() - 0.5), // Xáo trộn 4 đáp án khi hiển thị
      // Kanji: cách đọc của đáp án chính là thứ đang hỏi. Từ vựng: chỉ hiện khi mọi đáp án đều có
      // cách đọc, nếu không thì đáp án duy nhất có furigana sẽ thành gợi ý.
      optionRubyBeforeAnswer: !isKanji && options.every(o => !o.ruby || o.ruby.some(seg => seg.r)),
      dbItem: q
    };
  }

  // --- Auto question generator ---
  private generateQuestion(item: VocabItem, type: string, allItems: VocabItem[]): QuizQuestion {
    let questionText = '';
    let correctAnswer = '';
    const distractors: { text: string; explanation: string; reading?: string }[] = [];

    switch(type) {
      case 'kanji-hiragana':
        questionText = item.front;
        correctAnswer = item.hiragana || '';
        break;
      case 'hiragana-kanji':
        questionText = item.hiragana || '';
        correctAnswer = item.front;
        break;
      case 'word-meaning':
        questionText = item.front || item.hiragana || '';
        correctAnswer = item.back;
        break;
      case 'meaning-word':
        questionText = item.back;
        correctAnswer = item.front || item.hiragana || '';
        break;
    }

    const similarItems = allItems.filter(v => v.id !== item.id).sort(() => Math.random() - 0.5);
    for (const randomItem of similarItems) {
      let wrongAnswer = '';
      let explanation = '';
      let reading: string | undefined;

      switch(type) {
        case 'kanji-hiragana':
          wrongAnswer = randomItem.hiragana || randomItem.front;
          explanation = `Cách đọc của từ: ${randomItem.front} - ${randomItem.back}`;
          break;
        case 'hiragana-kanji':
          wrongAnswer = randomItem.front;
          explanation = `Từ này đọc là: ${randomItem.hiragana} - ${randomItem.back}`;
          reading = randomItem.hiragana;
          break;
        case 'word-meaning':
          wrongAnswer = randomItem.back;
          explanation = `Nghĩa của từ: ${randomItem.front} (${randomItem.hiragana})`;
          break;
        case 'meaning-word':
          wrongAnswer = randomItem.front || randomItem.hiragana || '';
          explanation = `Từ này có nghĩa là: ${randomItem.back}`;
          reading = randomItem.hiragana;
          break;
      }

      if (wrongAnswer && wrongAnswer !== correctAnswer && !distractors.find(d => d.text === wrongAnswer)) {
        distractors.push({ text: wrongAnswer, explanation, reading });
      }
      if (distractors.length >= 3) break;
    }

    while (distractors.length < 3) {
      distractors.push({ text: correctAnswer + ` (${distractors.length + 1})`, explanation: 'Đáp án nhiễu' });
    }

    const correctExplanation = `Ý nghĩa: ${item.front} (${item.hiragana}) - ${item.back}`;
    // Đáp án là từ tiếng Nhật thì có furigana; với dạng Hiragana -> Kanji chỉ hiện sau khi trả lời
    const withRuby = type === 'hiragana-kanji' || type === 'meaning-word';
    const options: QuizOption[] = [
      { text: correctAnswer, isCorrect: true, explanation: correctExplanation, reading: item.hiragana },
      ...distractors.slice(0, 3).map(d => ({ text: d.text, isCorrect: false, explanation: d.explanation, reading: d.reading }))
    ].map(({ reading, ...o }) => ({ ...o, ruby: withRuby ? wordRuby(o.text, reading) : undefined }))
      .sort(() => Math.random() - 0.5);

    return {
      type: type as any,
      questionText,
      // Dạng Kanji -> Hiragana đang hỏi chính cách đọc nên không gắn furigana cho đề
      questionRuby: type === 'word-meaning' ? wordRuby(questionText, item.hiragana) : undefined,
      options,
      optionRubyBeforeAnswer: type === 'meaning-word',
      originalItem: item
    };
  }

  // --- Question gameplay flow ---
  setupCurrentQuestion() {
    this.selectedAnswer = null;
    this.isAnswerCorrect = null;
    this.showExplanation = false;
    
    if (this.timePerQuestion > 0) {
      this.timeLeft = this.timePerQuestion;
      this.startTimer();
    }
  }

  startTimer() {
    this.clearTimer();
    this.timerInterval = setInterval(() => {
      this.timeLeft--;
      if (this.timeLeft <= 0) {
        this.clearTimer();
        this.handleTimeout();
      }
    }, 1000);
  }

  clearTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
  }

  handleTimeout() {
    this.selectAnswer(null); // Timeout -> wrong
  }

  selectAnswer(option: QuizOption | null) {
    if (this.showExplanation) return;
    
    this.clearTimer();
    this.selectedAnswer = option;
    const currentQ = this.questions[this.currentIndex];
    
    if (option === null) {
      this.isAnswerCorrect = false;
      this.mistakes.push(currentQ);
    } else {
      this.isAnswerCorrect = option.isCorrect;
      if (this.isAnswerCorrect) {
        this.score++;
      } else {
        this.mistakes.push(currentQ);
      }
    }

    const detail: QuizHistoryDetail = {
      questionText: currentQ.questionText,
      furigana: currentQ.dbItem?.furigana,
      options: currentQ.options.map(o => ({ text: o.text, isCorrect: o.isCorrect, explanation: o.explanation })),
      selectedAnswer: option ? option.text : null,
      isCorrect: !!this.isAnswerCorrect,
      explanation: currentQ.type === 'fixed' ? (currentQ.dbItem?.explanation || '') : ''
    };
    this.historyDetails.push(detail);

    this.showExplanation = true;
  }

  nextQuestion() {
    this.currentIndex++;
    if (this.currentIndex >= this.questions.length) {
      this.finishQuiz();
    } else {
      this.setupCurrentQuestion();
    }
  }

  finishQuiz() {
    this.stage = 'result';
    this.expGained = this.score * 10;
    this.userService.addExp(this.expGained);
    
    const history: QuizHistory = {
      id: Date.now().toString(),
      date: Date.now(),
      mode: this.activeCategory === 'kanji' ? 'fixed' : (this.vocabQuizMode === 'auto' ? 'auto' : 'fixed'),
      category: this.activeCategory,
      lessonTitle: this.currentQuizTitle,
      level: this.currentLevel,
      score: this.score,
      totalQuestions: this.questions.length,
      details: this.historyDetails
    };
    this.quizService.saveQuizHistory(history);
  }

  retryCurrentQuiz() {
    if (this.lastPlayedLessonGroup) {
      this.startSingleKanjiLesson(this.lastPlayedLessonGroup);
    } else if (this.activeCategory === 'kanji') {
      this.startMultiKanjiQuiz();
    } else {
      this.startVocabQuiz();
    }
  }

  restart() {
    this.clearTimer();
    this.ttsService.stop();
    this.stage = 'setup';
  }

  speakCurrentQuestion() {
    const q = this.questions[this.currentIndex];
    if (!q) return;
    const textToSpeak = q.questionText || q.dbItem?.furigana || '';
    if (textToSpeak) {
      this.ttsService.speak(textToSpeak, 'ja-JP');
    }
  }

  // --- History Navigation ---
  viewHistory() {
    this.grammarInSession = false;
    this.histories = this.quizService.getQuizHistory();
    this.stage = 'history';
  }

  viewHistoryDetail(history: QuizHistory) {
    this.selectedHistory = history;
    this.stage = 'history-detail';
  }

  backToHistory() {
    this.selectedHistory = null;
    this.stage = 'history';
  }

  correctText(q: QuizQuestion): string {
    return q.options.find(o => o.isCorrect)?.text ?? '';
  }

  // Furigana đáp án: theo nút bật/tắt trước khi trả lời (nếu không làm lộ đáp án), luôn hiện sau khi trả lời
  showOptionRuby(q: QuizQuestion, revealed: boolean): boolean {
    return revealed || (this.furigana.show && !!q.optionRubyBeforeAnswer);
  }

  categoryLabel(category?: string): string {
    if (category === 'kanji') return 'Kanji';
    if (category === 'grammar') return 'Ngữ pháp';
    return 'Từ vựng';
  }

  // --- Keyboard: 1-4 chọn đáp án, Enter sang câu tiếp, F bật/tắt furigana ---
  @HostListener('window:keydown', ['$event'])
  onKeydown(e: KeyboardEvent) {
    if (this.stage !== 'playing' || e.ctrlKey || e.metaKey || e.altKey) return;
    const target = e.target as HTMLElement;
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(target?.tagName)) return;

    const index = ['1', '2', '3', '4'].indexOf(e.key);
    const options = this.questions[this.currentIndex]?.options;
    if (index >= 0 && options && index < options.length && !this.showExplanation) {
      this.selectAnswer(options[index]);
      e.preventDefault();
    } else if ((e.key === 'Enter' || e.key === 'ArrowRight') && this.showExplanation) {
      this.nextQuestion();
      e.preventDefault();
    } else if (e.key.toLowerCase() === 'f') {
      this.furigana.toggle();
    }
  }

  // --- Import Actions ---
  importKanjiQuizzes() {
    if (confirm('Import lại toàn bộ 706 câu trắc nghiệm Kanji N3 từ file JSON vào DB?')) {
      fetch('/assets/n3_kanji_quizzes.json')
        .then(res => res.json())
        .then((data: QuizQuestionDB[]) => {
          this.quizService.importQuizzesBatch(data);
          alert('Đang import ' + data.length + ' câu hỏi Kanji vào DB, vui lòng chờ trong giây lát!');
        }).catch(err => alert('Lỗi import Kanji: ' + err));
    }
  }

  importVocabQuizzes() {
    if (confirm('Import N3 quizzes Từ vựng từ file JSON vào DB?')) {
      fetch('/assets/n3_quizzes.json')
        .then(res => res.json())
        .then((data: QuizQuestionDB[]) => {
          this.quizService.importQuizzesBatch(data);
          alert('Đang import ' + data.length + ' câu hỏi Từ vựng vào DB!');
        }).catch(err => alert('Lỗi import Từ vựng: ' + err));
    }
  }
}
