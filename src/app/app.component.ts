import { Component, inject } from '@angular/core';
import { RouterOutlet, RouterLink, Router, RouterLinkActive } from '@angular/router';
import { CommonModule } from '@angular/common';
import { LevelService } from './core/services/level.service';
import { UserService } from './core/services/user.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  router = inject(Router);
  levelService = inject(LevelService);
  userService = inject(UserService);
  title = 'jlpt-app';

  levels = ['N5', 'N4', 'N3', 'N2', 'N1'];

  // Icon: đường path SVG (Heroicons outline)
  navItems = [
    {
      path: '/study', label: 'Học thẻ', shortLabel: 'Học thẻ',
      icon: 'M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25'
    },
    {
      path: '/quiz', label: 'Trắc nghiệm', shortLabel: 'Trắc nghiệm',
      icon: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
    },
    {
      path: '/manage', label: 'Quản lý từ vựng', shortLabel: 'Quản lý',
      icon: 'M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z'
    }
  ];
}
