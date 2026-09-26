import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { VocabItem, VocabService } from '../../core/services/vocab.service';
import { LevelService } from '../../core/services/level.service';
import { UserService } from '../../core/services/user.service';
import { QuizService, QuizQuestionDB } from '../../core/services/quiz.service';
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

@Component({
  selector: 'app-quiz',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './quiz.component.html',
  styleUrl: './quiz.component.scss'
})
export class QuizComponent implements OnInit, OnDestroy {
  private vocabService = inject(VocabService);
  private levelService = inject(LevelService);
  private userService = inject(UserService);
  private quizService = inject(QuizService); // NEW

  currentLevel = 'N4';
  
  // Auto Mode
  availableVocabs: VocabItem[] = [];
  availableLessons: string[] = [];
  selectedLessons: { [key: string]: boolean } = {};
  
  // Fixed Mode
  availableFixedQuizzes: QuizQuestionDB[] = [];

  // Settings
  quizMode: 'auto' | 'fixed' = 'fixed';
  questionCount: number = 10;
  timePerQuestion: number = 0; // 0 = no limit
  selectedTypes = {
    'kanji-hiragana': true,
    'hiragana-kanji': true,
    'word-meaning': true,
    'meaning-word': true
  };

  // State
  stage: 'setup' | 'playing' | 'result' = 'setup';
  questions: QuizQuestion[] = [];
  currentIndex: number = 0;
  score: number = 0;
  mistakes: QuizQuestion[] = [];
  selectedAnswer: QuizOption | null = null;
  isAnswerCorrect: boolean | null = null;
  showExplanation: boolean = false;
  expGained: number = 0;
  
  // Timer
  timeLeft: number = 0;
  timerInterval: any;

  ngOnInit() {
    combineLatest([
      this.vocabService.getVocabs(),
      this.quizService.getQuizzes(),
      this.levelService.currentLevel$
    ]).subscribe(([vocabs, fixedQuizzes, level]) => {
      this.currentLevel = level;
      this.availableVocabs = vocabs.filter(v => v.jlptLevel === level || (!v.jlptLevel && level === 'N4'));
      this.availableFixedQuizzes = fixedQuizzes.filter(q => q.jlptLevel === level || q.jlptLevel === 'N3'); // HACK for N3 testing
      
      const lessons = new Set<string>();
      this.availableVocabs.forEach(v => {
        lessons.add(v.lesson ? v.lesson.toString() : '0');
      });
      this.availableFixedQuizzes.forEach(q => {
        if (q.lesson) {
          const match = q.lesson.match(/\d+/);
          if (match) lessons.add(match[0]);
          else lessons.add('0');
        } else {
          lessons.add('0');
        }
      });
      this.availableLessons = Array.from(lessons).sort((a, b) => {
        const nA = parseInt(a), nB = parseInt(b);
        if (!isNaN(nA) && !isNaN(nB)) return nA - nB;
        return a.localeCompare(b);
      });
      this.availableLessons.forEach(l => this.selectedLessons[l] = true);
    });
  }

  ngOnDestroy() {
    this.clearTimer();
  }
  
  importFixedQuizzes() {
    if (confirm('Import N3 quizzes từ file JSON vào DB?')) {
      fetch('/assets/n3_quizzes.json')
        .then(res => res.json())
        .then((data: QuizQuestionDB[]) => {
          this.quizService.importQuizzesBatch(data);
          alert('Đang import ' + data.length + ' câu hỏi, vui lòng đợi trong console!');
        }).catch(err => alert('Lỗi import: ' + err));
    }
  }

  toggleAllLessons() {
    const currentState = Object.values(this.selectedLessons).some(v => v);
    this.availableLessons.forEach(l => this.selectedLessons[l] = !currentState);
  }

  startQuiz() {
    if (this.quizMode === 'auto') {
      this.startAutoQuiz();
    } else {
      this.startFixedQuiz();
    }
  }

  startFixedQuiz() {
    let filteredQuizzes = this.availableFixedQuizzes;
    
    // Filter by selected lessons
    const isAnySelected = Object.values(this.selectedLessons).some(v => v);
    if (!isAnySelected) {
      alert('Vui lòng chọn ít nhất 1 bài học!');
      return;
    }
    
    filteredQuizzes = filteredQuizzes.filter(q => {
      let lStr = '0';
      if (q.lesson) {
        const match = q.lesson.match(/\d+/);
        if (match) lStr = match[0];
      }
      return this.selectedLessons[lStr];
    });

    if (filteredQuizzes.length === 0) {
      alert('Không có câu hỏi cố định nào trong Database cho các bài học đã chọn!');
      return;
    }
    
    // Shuffle and pick
    const shuffled = [...filteredQuizzes].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, Math.min(this.questionCount, shuffled.length));
    
    this.questions = selected.map(q => {
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
    this.stage = 'playing';
    this.setupCurrentQuestion();
  }

  startAutoQuiz() {
    const filteredVocabs = this.availableVocabs.filter(v => {
      const lStr = v.lesson ? v.lesson.toString() : '0';
      return this.selectedLessons[lStr];
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

    // Shuffle and pick N vocabs from filtered pool
    const shuffled = [...filteredVocabs].sort(() => Math.random() - 0.5);
    const selectedVocabs = shuffled.slice(0, Math.min(this.questionCount, filteredVocabs.length));

    this.questions = selectedVocabs.map(vocab => {
      const type = types[Math.floor(Math.random() * types.length)];
      return this.generateQuestion(vocab, type, this.availableVocabs);
    });

    this.currentIndex = 0;
    this.score = 0;
    this.mistakes = [];
    this.stage = 'playing';
    this.setupCurrentQuestion();
  }

  private generateHiraganaDistractor(correct: string): string {
    let result = correct;
    if (!result) return result;

    const traps = [
      () => {
        const charMap: Record<string, string> = {
          'か':'が', 'き':'ぎ', 'く':'ぐ', 'け':'げ', 'こ':'ご',
          'が':'か', 'ぎ':'き', 'ぐ':'く', 'げ':'け', 'ご':'こ',
          'さ':'ざ', 'し':'じ', 'す':'ず', 'せ':'ぜ', 'そ':'ぞ',
          'ざ':'さ', 'じ':'し', 'ず':'す', 'ぜ':'せ', 'ぞ':'そ',
          'た':'だ', 'ち':'ぢ', 'つ':'づ', 'て':'で', 'と':'ど',
          'だ':'た', 'ぢ':'ち', 'づ':'つ', 'で':'て', 'ど':'と',
          'は':'ば', 'ひ':'び', 'ふ':'ぶ', 'へ':'べ', 'ほ':'ぼ',
          'ば':'は', 'び':'ひ', 'ぶ':'ふ', 'べ':'へ', 'ぼ':'ほ',
          'ぱ':'ば', 'ぴ':'び', 'ぷ':'ぶ', 'ぺ':'べ', 'ぽ':'ぼ',
        };
        for (let i = 0; i < result.length; i++) {
          if (charMap[result[i]]) {
            return result.substring(0, i) + charMap[result[i]] + result.substring(i + 1);
          }
        }
        return result;
      },
      () => {
        if (result.includes('う')) {
          return result.replace('う', '');
        } else if (result.includes('い')) {
          return result.replace('い', '');
        } else {
          if (result.length >= 2) {
            return result.substring(0, result.length - 1) + 'う' + result.substring(result.length - 1);
          }
        }
        return result;
      },
      () => {
        if (result.includes('っ')) {
          return result.replace('っ', '');
        } else if (result.length >= 2) {
          return result.substring(0, 1) + 'っ' + result.substring(1);
        }
        return result;
      },
      () => {
        const similar: Record<string, string> = {
          'ね':'れ', 'れ':'ね', 'め':'ぬ', 'ぬ':'め', 'わ':'ね', 'は':'ほ', 'ほ':'は'
        };
        for (let i = 0; i < result.length; i++) {
          if (similar[result[i]]) {
            return result.substring(0, i) + similar[result[i]] + result.substring(i + 1);
          }
        }
        return result;
      }
    ];

    const shuffledTraps = traps.sort(() => Math.random() - 0.5);
    for (const trap of shuffledTraps) {
      const modified = trap();
      if (modified !== correct) return modified;
    }
    return correct;
  }

  private getSimilarItems(item: VocabItem, allItems: VocabItem[]): VocabItem[] {
    const isVerbShi = item.front.endsWith('します') || item.hiragana?.endsWith('します');
    const isVerbMasu = item.front.endsWith('ます') || item.hiragana?.endsWith('ます');
    const isIAdj = item.front.endsWith('い') || item.hiragana?.endsWith('い');
    const isNaAdj = item.front.endsWith('な') || item.hiragana?.endsWith('な');

    const similar = allItems.filter(v => {
      if (v.id === item.id) return false;
      let match = false;
      
      if (isVerbShi) {
        match = v.front.endsWith('します') || v.hiragana?.endsWith('します') || false;
      } else if (isVerbMasu) {
        match = v.front.endsWith('ます') || v.hiragana?.endsWith('ます') || false;
      } else if (isIAdj) {
        match = v.front.endsWith('い') || v.hiragana?.endsWith('い') || false;
      } else if (isNaAdj) {
        match = v.front.endsWith('な') || v.hiragana?.endsWith('な') || false;
      }
      
      if (!match && item.partOfSpeech && v.partOfSpeech === item.partOfSpeech) {
        match = true;
      }
      return match;
    });

    if (similar.length < 3) {
      const remaining = allItems.filter(v => v.id !== item.id && !similar.find(s => s.id === v.id));
      similar.push(...remaining.sort(() => Math.random() - 0.5).slice(0, 3 - similar.length));
    }

    return similar;
  }

  generateQuestion(item: VocabItem, type: string, allItems: VocabItem[]): QuizQuestion {
    let questionText = '';
    let correctAnswer = '';
    const distractors: {text: string, explanation: string}[] = [];
    
    switch(type) {
      case 'kanji-hiragana':
        questionText = item.front;
        correctAnswer = item.hiragana || item.front;
        let attempts = 0;
        while(distractors.length < 3 && attempts < 20) {
          const fake = this.generateHiraganaDistractor(correctAnswer);
          if (fake !== correctAnswer && !distractors.find(d => d.text === fake)) {
            distractors.push({text: fake, explanation: 'Bẫy chính tả (Nhầm lẫn phát âm/trường âm)'});
          }
          attempts++;
        }
        break;

      case 'hiragana-kanji':
        questionText = item.hiragana || item.front;
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

    if (distractors.length < 3) {
      const similarItems = this.getSimilarItems(item, allItems).sort(() => Math.random() - 0.5);
      
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
          distractors.push({text: wrongAnswer, explanation});
        }
        if (distractors.length >= 3) break;
      }
    }

    if (distractors.length < 3) {
      distractors.push({text: correctAnswer + ' (Sai 1)', explanation: 'Đáp án nhiễu'});
      distractors.push({text: correctAnswer + ' (Sai 2)', explanation: 'Đáp án nhiễu'});
      distractors.push({text: correctAnswer + ' (Sai 3)', explanation: 'Đáp án nhiễu'});
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
    if (this.showExplanation) return; // Đã trả lời xong, khóa nút
    
    this.clearTimer();
    this.selectedAnswer = option;
    const currentQ = this.questions[this.currentIndex];
    
    if (option === null) {
      // Hết giờ
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
  }

  restart() {
    this.stage = 'setup';
  }
}
