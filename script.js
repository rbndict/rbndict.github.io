(function () {
  'use strict';

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ------------------------------------------------ 1. Theme (persisted) */
  const root = document.documentElement;
  const themeToggle = $('#themeToggle');
  const themeIcon = $('#themeIcon');
  const THEME_COLORS = { dark: '#0a192f', light: '#dbe9f8' };

  function applyThemeMeta() {
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.content = THEME_COLORS[root.dataset.theme] || THEME_COLORS.dark;
  }

  function applyThemeIcon() {
    if (themeIcon) themeIcon.className = root.dataset.theme === 'dark' ? 'bi bi-sun' : 'bi bi-moon-stars';
  }

  applyThemeIcon();
  applyThemeMeta();

  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem('theme', root.dataset.theme); } catch (e) { /* private mode */ }
      applyThemeIcon();
      applyThemeMeta();
    });
  }

  const navToggle = $('#navToggle');
  const navMenu = $('#navMenu');

  function closeNav() {
    document.body.classList.remove('nav-open');
    if (navToggle) navToggle.setAttribute('aria-expanded', 'false');
  }

  if (navToggle && navMenu) {
    navToggle.addEventListener('click', () => {
      const open = document.body.classList.toggle('nav-open');
      navToggle.setAttribute('aria-expanded', String(open));
    });

    $$('#navMenu .nav-link').forEach((link) => link.addEventListener('click', closeNav));

    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeNav(); });

    document.addEventListener('click', (e) => {
      if (document.body.classList.contains('nav-open') &&
          !navMenu.contains(e.target) && !navToggle.contains(e.target)) {
        closeNav();
      }
    });

    window.addEventListener('resize', () => { if (window.innerWidth > 860) closeNav(); }, { passive: true });
  }

  /* ------------------- 3. Scroll state: progress · navbar · back-to-top */
  const progressBar = $('#scrollProgressBar');
  const navbar = $('#navbar');
  const toTop = $('#toTop');
  let scrollTicking = false;

  function onScroll() {
    const y = window.scrollY;
    const max = document.documentElement.scrollHeight - window.innerHeight;

    if (progressBar) progressBar.style.transform = `scaleX(${max > 0 ? Math.min(y / max, 1) : 0})`;
    if (navbar) navbar.classList.toggle('scrolled', y > 30);
    if (toTop) toTop.classList.toggle('show', y > 600);
    scrollTicking = false;
  }

  window.addEventListener('scroll', () => {
    if (!scrollTicking) { scrollTicking = true; requestAnimationFrame(onScroll); }
  }, { passive: true });

  onScroll();

  if (toTop) {
    toTop.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
    });
  }

  /* @@P2@@ */
})();
