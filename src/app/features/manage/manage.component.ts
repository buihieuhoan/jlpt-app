import { Component, inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { VocabItem, VocabService } from '../../core/services/vocab.service';
import { LevelService } from '../../core/services/level.service';
import { Observable, combineLatest, BehaviorSubject } from 'rxjs';
import { writeBatch, doc, Firestore } from '@angular/fire/firestore';
import { map, startWith } from 'rxjs/operators';

@Component({
  selector: 'app-manage',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './manage.component.html',
  styleUrl: './manage.component.scss'
})
export class ManageComponent implements OnInit {
  private fb = inject(FormBuilder);
  private vocabService = inject(VocabService);
  private http = inject(HttpClient);
  private firestore = inject(Firestore);
  private cdr = inject(ChangeDetectorRef);
  private levelService = inject(LevelService);

  currentLevel = 'N4';

  vocabForm!: FormGroup;
  filterForm!: FormGroup;
  
  vocabs$!: Observable<VocabItem[]>;
  filteredVocabs$!: Observable<VocabItem[]>;
  paginatedVocabs$!: Observable<VocabItem[]>;
  
  activeTab: 'vocab' | 'kanji' | 'grammar' = 'vocab';
  isImporting = false;
  editModeId: string | null = null;
  
  // Pagination
  currentPage$ = new BehaviorSubject<number>(1);
  pageSize = 10;
  totalItems = 0;

  ngOnInit() {
    this.levelService.currentLevel$.subscribe(level => {
      this.currentLevel = level;
      if (!this.editModeId && this.vocabForm) {
        this.vocabForm.patchValue({ jlptLevel: level });
      }
      if (this.filterForm) {
        this.filterForm.patchValue({ search: this.filterForm.value.search });
      }
    });

    this.initForm();
    this.initFilterForm();
    
    // Get raw data from Firestore, sorted by lesson descending
    this.vocabs$ = this.vocabService.getVocabs().pipe(
      map(vocabs => vocabs.sort((a, b) => (b.lesson || 0) - (a.lesson || 0)))
    );

    // Filter logic
    const filterChanges$ = this.filterForm.valueChanges.pipe(startWith(this.filterForm.value));
    
    this.filteredVocabs$ = combineLatest([this.vocabs$, filterChanges$]).pipe(
      map(([vocabs, filters]) => {
        let result = vocabs.filter(v => 
          (v.type === this.activeTab || (!v.type && this.activeTab === 'vocab')) &&
          (v.jlptLevel === this.currentLevel || (!v.jlptLevel && this.currentLevel === 'N4'))
        );
        
        if (filters.search) {
          const s = filters.search.toLowerCase();
          result = result.filter(v => 
            v.front?.toLowerCase().includes(s) || 
            v.hiragana?.toLowerCase().includes(s) || 
            v.back?.toLowerCase().includes(s)
          );
        }
        if (filters.partOfSpeech) {
          result = result.filter(v => v.partOfSpeech?.toLowerCase().includes(filters.partOfSpeech.toLowerCase()));
        }
        if (filters.lesson) {
          result = result.filter(v => v.lesson === filters.lesson);
        }
        
        this.totalItems = result.length;
        // Reset to page 1 when filter changes
        if (this.currentPage$.value !== 1) {
          // Use setTimeout to avoid ExpressionChangedAfterItHasBeenCheckedError
          setTimeout(() => this.currentPage$.next(1));
        }
        
        return result;
      })
    );

    // Pagination logic
    this.paginatedVocabs$ = combineLatest([this.filteredVocabs$, this.currentPage$]).pipe(
      map(([vocabs, page]) => {
        const startIndex = (page - 1) * this.pageSize;
        return vocabs.slice(startIndex, startIndex + this.pageSize);
      })
    );
  }

  initForm() {
    this.vocabForm = this.fb.group({
      jlptLevel: [this.currentLevel],
      lesson: [null],
      partOfSpeech: [''],
      front: ['', Validators.required],
      hiragana: [''],
      back: ['', Validators.required]
    });
  }

  initFilterForm() {
    this.filterForm = this.fb.group({
      search: [''],
      partOfSpeech: [''],
      lesson: [null]
    });
  }

  setTab(tab: 'vocab' | 'kanji' | 'grammar') {
    this.activeTab = tab;
    this.cancelEdit();
    this.filterForm.reset({ search: '', partOfSpeech: '', lesson: null });
    this.currentPage$.next(1);
  }

  editItem(item: VocabItem) {
    this.editModeId = item.id || null;
    this.vocabForm.patchValue({
      jlptLevel: item.jlptLevel || this.currentLevel,
      lesson: item.lesson || null,
      partOfSpeech: item.partOfSpeech || '',
      front: item.front || '',
      hiragana: item.hiragana || '',
      back: item.back || ''
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  cancelEdit() {
    this.editModeId = null;
    this.initForm();
  }

  onSubmit() {
    if (this.vocabForm.valid) {
      if (this.editModeId) {
        this.vocabService.updateVocab(this.editModeId, this.vocabForm.value).then(() => {
          this.cancelEdit();
        });
      } else {
        const newItem: VocabItem = {
          ...this.vocabForm.value,
          type: this.activeTab,
          level: 0,
          nextReviewDate: Date.now()
        };
        this.vocabService.addVocab(newItem).then(() => {
          this.initForm();
        });
      }
    }
  }

  deleteItem(id: string | undefined) {
    if (id && confirm('Bạn có chắc chắn muốn xóa?')) {
      this.vocabService.deleteVocab(id);
    }
  }

  // Pagination controls
  nextPage() {
    if (this.currentPage$.value * this.pageSize < this.totalItems) {
      this.currentPage$.next(this.currentPage$.value + 1);
    }
  }

  prevPage() {
    if (this.currentPage$.value > 1) {
      this.currentPage$.next(this.currentPage$.value - 1);
    }
  }

  get totalPages(): number {
    return Math.ceil(this.totalItems / this.pageSize) || 1;
  }

  get Math() {
    return Math;
  }

  async deleteAllData() {
    if (confirm('Bạn có CỰC KỲ CHẮC CHẮN muốn xóa TOÀN BỘ dữ liệu không? Hành động này không thể hoàn tác!')) {
      try {
        this.vocabs$.subscribe(async (vocabs) => {
          if (vocabs.length === 0) {
            alert('Không có dữ liệu để xóa!');
            return;
          }
          const batchArray = [];
          let batch = writeBatch(this.firestore);
          let count = 0;

          for (const v of vocabs) {
            if (v.id) {
              const docRef = doc(this.firestore, `vocabularies/${v.id}`);
              batch.delete(docRef);
              count++;

              if (count === 490) {
                batchArray.push(batch.commit());
                batch = writeBatch(this.firestore);
                count = 0;
              }
            }
          }
          if (count > 0) {
            batchArray.push(batch.commit());
          }

          await Promise.all(batchArray);
          alert('Đã xóa sạch toàn bộ dữ liệu!');
          // Tải lại trang để cập nhật UI ngay lập tức
          window.location.reload();
        });
      } catch (e) {
        console.error(e);
        alert('Lỗi khi xóa dữ liệu');
      }
    }
  }

  async importData() {
    if(this.isImporting) return;
    this.isImporting = true;
    this.cdr.detectChanges(); // Force UI update
    
    this.http.get<VocabItem[]>('/assets/data.json').subscribe(async (data) => {
      try {
        const batchArray = [];
        let batch = writeBatch(this.firestore);
        let count = 0;
        
        for (const item of data) {
          // Append current level to imported items
          const itemWithLevel = { ...item, jlptLevel: this.currentLevel };
          const docRef = doc(this.firestore, 'vocabularies', 'import_' + Date.now() + count);
          batch.set(docRef, itemWithLevel);
          count++;
          
          if (count === 490) {
            batchArray.push(batch.commit());
            batch = writeBatch(this.firestore);
            count = 0;
          }
        }
        
        if (count > 0) {
          batchArray.push(batch.commit());
        }
        
        await Promise.all(batchArray);
        alert("Import thành công " + data.length + " từ vựng!");
      } catch (e) {
        console.error("Import error", e);
        alert("Có lỗi xảy ra khi import!");
      } finally {
        this.isImporting = false;
        this.cdr.detectChanges(); // Force UI update for button state
      }
    });
  }
}
