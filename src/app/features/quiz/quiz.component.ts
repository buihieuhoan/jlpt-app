import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { VocabItem, VocabService } from '../../core/services/vocab.service';
import { LevelService } from '../../core/services/level.service';
import { UserService } from '../../core/services/user.service';
import { QuizService, QuizQuestionDB, QuizHistory, QuizHistoryDetail } from '../../core/services/quiz.service';
import { TtsService } from '../../core/services/tts.service';
import { combineLatest } from 'rxjs';

export interface QuizOption {
  text: string;
  isCorrect: boolean;
  explanation: string;
}

export interface QuizQuestion {
  type: 'kanji-hiragana' | 'hiragana-kanji' | 'word-meaning' | 'meaning-word' | 'fixed';
  questionText: string;
  options: QuizOption[];
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
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './quiz.component.html',
  styleUrl: './quiz.component.scss'
})
export class QuizComponent implements OnInit, OnDestroy {
  private vocabService = inject(VocabService);
  private levelService = inject(LevelService);
  private userService = inject(UserService);
  private quizService = inject(QuizService);
  public ttsService = inject(TtsService);

  currentLevel = 'N3';
  
  // Category Tab: 'kanji' or 'vocab'
  activeCategory: 'kanji' | 'vocab' = 'kanji';
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
  }

  ngOnDestroy() {
    this.clearTimer();
    this.ttsService.stop();
  }

  setCategory(cat: 'kanji' | 'vocab') {
    this.activeCategory = cat;
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
    this.questions = quizzes.map(q => {
      return {
        type: 'fixed',
        questionText: q.question,
        options: q.options.map((optText, index) => ({
          text: optText,
          isCorrect: index === q.correctAnswerIndex,
          explanation: index === q.correctAnswerIndex ? q.explanation : 'Đáp án sai'
        })).sort(() => Math.random() - 0.5), // Xáo trộn 4 đáp án khi hiển thị
        dbItem: q
      };
    });

    this.currentIndex = 0;
    this.score = 0;
    this.mistakes = [];
    this.historyDetails = [];
    this.stage = 'playing';
    this.setupCurrentQuestion();
  }

  // --- Auto question generator ---
  private generateQuestion(item: VocabItem, type: string, allItems: VocabItem[]): QuizQuestion {
    let questionText = '';
    let correctAnswer = '';
    const distractors: { text: string; explanation: string }[] = [];

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

      switch(type) {
        case 'kanji-hiragana':
          wrongAnswer = randomItem.hiragana || randomItem.front;
          explanation = `Cách đọc của từ: ${randomItem.front} - ${randomItem.back}`;
          break;
        case 'hiragana-kanji':
          wrongAnswer = randomItem.front;
          explanation = `Từ này đọc là: ${randomItem.hiragana} - ${randomItem.back}`;
          break;
        case 'word-meaning':
          wrongAnswer = randomItem.back;
          explanation = `Nghĩa của từ: ${randomItem.front} (${randomItem.hiragana})`;
          break;
        case 'meaning-word':
          wrongAnswer = randomItem.front || randomItem.hiragana || '';
          explanation = `Từ này có nghĩa là: ${randomItem.back}`;
          break;
      }

      if (wrongAnswer && wrongAnswer !== correctAnswer && !distractors.find(d => d.text === wrongAnswer)) {
        distractors.push({ text: wrongAnswer, explanation });
      }
      if (distractors.length >= 3) break;
    }

    while (distractors.length < 3) {
      distractors.push({ text: correctAnswer + ` (${distractors.length + 1})`, explanation: 'Đáp án nhiễu' });
    }

    const correctExplanation = `Ý nghĩa: ${item.front} (${item.hiragana}) - ${item.back}`;
    const options: QuizOption[] = [
      { text: correctAnswer, isCorrect: true, explanation: correctExplanation },
      ...distractors.slice(0, 3).map(d => ({ text: d.text, isCorrect: false, explanation: d.explanation }))
    ].sort(() => Math.random() - 0.5);

    return {
      type: type as any,
      questionText,
      options,
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
