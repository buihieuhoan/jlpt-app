const fs = require('fs');
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, doc, writeBatch, getDocs, query, where } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: 'AIzaSyBf17O557GEGjkEu8YuECoJUmVITDAuqGU',
  authDomain: 'jlpt-app-109ca.firebaseapp.com',
  projectId: 'jlpt-app-109ca',
  storageBucket: 'jlpt-app-109ca.firebasestorage.app',
  messagingSenderId: '344435672538',
  appId: '1:344435672538:web:09088f5bfc764e5a20ece3'
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function upload() {
  console.log("Reading n3_kanji_quizzes.json...");
  const raw = fs.readFileSync('src/assets/n3_kanji_quizzes.json', 'utf8');
  const quizzes = JSON.parse(raw);
  console.log(`Loaded ${quizzes.length} quizzes from JSON.`);

  // Check if any kanji quizzes exist first
  const existingQ = query(collection(db, 'quiz_questions'), where('tags', 'array-contains', 'kanji'));
  const existingSnap = await getDocs(existingQ);
  console.log(`Currently in Firestore: ${existingSnap.size} kanji questions.`);

  if (existingSnap.size > 0) {
    console.log(`Cleaning up ${existingSnap.size} old kanji questions before re-uploading...`);
    const docsToDelete = existingSnap.docs;
    const CHUNK_SIZE = 400;
    for (let i = 0; i < docsToDelete.length; i += CHUNK_SIZE) {
      const chunk = docsToDelete.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      chunk.forEach(d => batch.delete(d.ref));
      await batch.commit();
      console.log(`Deleted chunk ${Math.floor(i / CHUNK_SIZE) + 1}`);
    }
  }

  const quizCollection = collection(db, 'quiz_questions');
  const CHUNK_SIZE = 350;
  const now = Date.now();

  for (let i = 0; i < quizzes.length; i += CHUNK_SIZE) {
    const chunk = quizzes.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    
    for (const q of chunk) {
      const docRef = doc(quizCollection);
      batch.set(docRef, {
        ...q,
        createdAt: now
      });
    }

    await batch.commit();
    console.log(`Uploaded batch ${Math.floor(i / CHUNK_SIZE) + 1} of ${Math.ceil(quizzes.length / CHUNK_SIZE)} (${chunk.length} items)`);
  }

  // Verify
  const verifySnap = await getDocs(query(collection(db, 'quiz_questions'), where('tags', 'array-contains', 'kanji')));
  console.log(`SUCCESS: Total Kanji quizzes now in Firestore: ${verifySnap.size}`);
  process.exit(0);
}

upload().catch(err => {
  console.error("Upload error:", err);
  process.exit(1);
});
