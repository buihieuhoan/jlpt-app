import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: '/manage', pathMatch: 'full' },
  { path: 'study', loadComponent: () => import('./features/study/study.component').then(m => m.StudyComponent) },
  { path: 'quiz', loadComponent: () => import('./features/quiz/quiz.component').then(m => m.QuizComponent) },
  { path: 'manage', loadComponent: () => import('./features/manage/manage.component').then(m => m.ManageComponent) }
];
