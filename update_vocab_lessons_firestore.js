// Cập nhật nhãn bài (lesson / lessonNum / tags / jlptLevel) cho câu hỏi Từ vựng trên Firestore
// theo src/assets/n3_quizzes.json (đã gộp về 44 bài bằng regroup_vocab_quiz.py).
// Sửa tại chỗ từng tài liệu, khớp theo nội dung câu hỏi + đáp án; không xoá / tạo mới.
const fs = require('fs');
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, writeBatch } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: 'AIzaSyBf17O557GEGjkEu8YuECoJUmVITDAuqGU',
  authDomain: 'jlpt-app-109ca.firebaseapp.com',
  projectId: 'jlpt-app-109ca',
  storageBucket: 'jlpt-app-109ca.firebasestorage.app',
  messagingSenderId: '344435672538',
  appId: '1:344435672538:web:09088f5bfc764e5a20ece3'
};

const db = getFirestore(initializeApp(firebaseConfig));
const key = q => q.question + '|' + q.options.join(',');

async function run() {
  const local = JSON.parse(fs.readFileSync('src/assets/n3_quizzes.json', 'utf8'));
  const target = new Map(local.map(q => [key(q), q]));
  console.log(`File JSON: ${local.length} câu, ${new Set(local.map(q => q.lesson)).size} bài.`);

  const snap = await getDocs(collection(db, 'quiz_questions'));
  const vocabDocs = snap.docs.filter(d => {
    const q = d.data();
    return !(q.category === 'kanji' || (q.tags || []).includes('kanji')) && q.category !== 'grammar';
  });
  const updates = [];
  const unknown = [];
  for (const d of vocabDocs) {
    const t = target.get(key(d.data()));
    if (!t) { unknown.push(d.data().question); continue; }
    const q = d.data();
    if (q.lesson !== t.lesson || q.lessonNum !== t.lessonNum || q.jlptLevel !== t.jlptLevel || (q.tags || []).join() !== t.tags.join()) {
      updates.push({ ref: d.ref, data: { lesson: t.lesson, lessonNum: t.lessonNum, tags: t.tags, jlptLevel: t.jlptLevel } });
    }
  }
  console.log(`Firestore: ${vocabDocs.length} câu Từ vựng, cần cập nhật ${updates.length}, không khớp file ${unknown.length}.`);
  if (unknown.length) {
    console.log('Dừng: có câu trên DB không có trong file JSON, không cập nhật gì.', unknown.slice(0, 5));
    process.exit(1);
  }

  for (let i = 0; i < updates.length; i += 400) {
    const batch = writeBatch(db);
    updates.slice(i, i + 400).forEach(u => batch.update(u.ref, u.data));
    await batch.commit();
    console.log(`Đã cập nhật ${Math.min(i + 400, updates.length)}/${updates.length}`);
  }

  const after = (await getDocs(collection(db, 'quiz_questions'))).docs.map(d => d.data())
    .filter(q => !(q.category === 'kanji' || (q.tags || []).includes('kanji')) && q.category !== 'grammar');
  const lessons = new Set(after.filter(q => q.jlptLevel === 'N3').map(q => q.lesson));
  console.log(`XONG: ${after.length} câu Từ vựng, cấp N3: ${after.filter(q => q.jlptLevel === 'N3').length} câu, ${lessons.size} bài.`);
  process.exit(0);
}

run().catch(err => { console.error('Lỗi:', err); process.exit(1); });
