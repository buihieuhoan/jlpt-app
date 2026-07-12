import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { getFirestore, provideFirestore } from '@angular/fire/firestore';
import { provideHttpClient } from '@angular/common/http';

const firebaseConfig = {
  apiKey: "AIzaSyBf17O557GEGjkEu8YuECoJUmVITDAuqGU",
  authDomain: "jlpt-app-109ca.firebaseapp.com",
  projectId: "jlpt-app-109ca",
  storageBucket: "jlpt-app-109ca.firebasestorage.app",
  messagingSenderId: "344435672538",
  appId: "1:344435672538:web:09088f5bfc764e5a20ece3"
};

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideHttpClient(),
    provideFirebaseApp(() => initializeApp(firebaseConfig)),
    provideFirestore(() => getFirestore())
  ]
};
