(function () {
  'use strict';

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const root = document.documentElement;
  const themeToggle = $('#themeToggle');
  const themeIcon = $('#themeIcon');
  const THEME_COLORS = { dark: '#0a192f', light: '#dbe9f8' };

  function syncTheme() {
    const theme = root.getAttribute('data-bs-theme');
    if (themeIcon) themeIcon.className = theme === 'dark' ? 'bi bi-sun' : 'bi bi-moon-stars';
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.content = THEME_COLORS[theme] || THEME_COLORS.dark;
  }

  syncTheme();

  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const next = root.getAttribute('data-bs-theme') === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-bs-theme', next);
      try { localStorage.setItem('theme', next); } catch (e) { }
      syncTheme();
    });
  }

  const navMenu = $('#navMenu');
  if (navMenu) {
    $$('.nav-link', navMenu).forEach((link) => {
      link.addEventListener('click', () => {
        if (window.innerWidth < 992 && navMenu.classList.contains('show')) {
          bootstrap.Collapse.getOrCreateInstance(navMenu).hide();
        }
      });
    });
  }

  const progressBar = $('#scrollProgressBar');
  const navbar = $('#mainNav');
  const toTop = $('#toTop');
  let ticking = false;

  function onScroll() {
    const y = window.scrollY;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    if (progressBar) progressBar.style.transform = 'scaleX(' + (max > 0 ? Math.min(y / max, 1) : 0) + ')';
    if (navbar) navbar.classList.toggle('scrolled', y > 30);
    if (toTop) toTop.classList.toggle('show', y > 600);
    ticking = false;
  }

  window.addEventListener('scroll', () => {
    if (!ticking) { ticking = true; requestAnimationFrame(onScroll); }
  }, { passive: true });

  onScroll();

  if (toTop) {
    toTop.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
    });
  }

  const typedEl = $('#typed');
  const ROLES = ['IT Professional', 'Web Developer', 'Problem Solver', 'Lifelong Learner'];

  if (typedEl) {
    if (reducedMotion) {
      typedEl.textContent = ROLES[0];
    } else {
      let roleIndex = 0;
      let charIndex = 0;
      let deleting = false;

      (function typeStep() {
        const word = ROLES[roleIndex];
        charIndex += deleting ? -1 : 1;
        typedEl.textContent = word.slice(0, charIndex);
        let delay = deleting ? 38 : 72;
        if (!deleting && charIndex === word.length) {
          delay = 1700;
          deleting = true;
        } else if (deleting && charIndex === 0) {
          deleting = false;
          roleIndex = (roleIndex + 1) % ROLES.length;
          delay = 420;
        }
        setTimeout(typeStep, delay);
      })();
    }
  }

  const revealEls = $$('.reveal');

  if ('IntersectionObserver' in window && !reducedMotion) {
    const io = new IntersectionObserver((entries, obs) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        obs.unobserve(entry.target);
      });
    }, { threshold: 0.14, rootMargin: '0px 0px -8% 0px' });
    revealEls.forEach((el) => io.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add('is-visible'));
  }

  const barFills = $$('.bar-fill');

  function setBar(fill, level) {
    fill.style.width = level + '%';
    const bar = fill.closest('.bar');
    const label = bar ? bar.querySelector('.bar-num') : null;
    if (!label) return;
    if (reducedMotion) {
      label.textContent = level + '%';
      return;
    }
    const start = performance.now();
    (function tick(now) {
      const p = Math.min((now - start) / 1000, 1);
      label.textContent = Math.round(level * (1 - Math.pow(1 - p, 3))) + '%';
      if (p < 1) requestAnimationFrame(tick);
    })(start);
  }

  if ('IntersectionObserver' in window) {
    const barIO = new IntersectionObserver((entries, obs) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        setBar(entry.target, Number(entry.target.getAttribute('data-level')) || 0);
        obs.unobserve(entry.target);
      });
    }, { threshold: 0.4 });
    barFills.forEach((fill) => barIO.observe(fill));
  } else {
    barFills.forEach((fill) => setBar(fill, Number(fill.getAttribute('data-level')) || 0));
  }

  function fallbackCopy(value) {
    const area = document.createElement('textarea');
    area.value = value;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    try { document.execCommand('copy'); } catch (e) { }
    area.remove();
  }

  const copyBtn = $('#copyEmail');
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      const value = copyBtn.getAttribute('data-copy') || '';
      try { await navigator.clipboard.writeText(value); } catch (e) { fallbackCopy(value); }
      const toastEl = $('#toast');
      if (toastEl && window.bootstrap) bootstrap.Toast.getOrCreateInstance(toastEl).show();
    });
  }

  const yearEl = $('#year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  const canvas = $('#bg-canvas');

  if (canvas && !reducedMotion && canvas.getContext) {
    const ctx = canvas.getContext('2d');

    if (ctx) {
      let W = 0;
      let H = 0;
      let dots = [];
      let rafId = null;
      const pointer = { x: null, y: null };
      const LINK_DIST = 110;
      const colors = { dot: '125, 188, 255', line: '100, 149, 237' };

      const readColors = () => {
        const cs = getComputedStyle(root);
        colors.dot = (cs.getPropertyValue('--particle-dot') || colors.dot).trim();
        colors.line = (cs.getPropertyValue('--particle-line') || colors.line).trim();
      };

      readColors();
      new MutationObserver(readColors).observe(root, { attributes: true, attributeFilter: ['data-bs-theme'] });

      function buildDots() {
        const count = Math.min(110, Math.round((W * H) / 16000));
        dots = Array.from({ length: count }, () => ({
          x: Math.random() * W,
          y: Math.random() * H,
          vx: (Math.random() - 0.5) * 0.35,
          vy: (Math.random() - 0.5) * 0.35,
          r: Math.random() * 1.6 + 0.7
        }));
      }

      function resize() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        W = window.innerWidth;
        H = window.innerHeight;
        canvas.width = W * dpr;
        canvas.height = H * dpr;
        canvas.style.width = W + 'px';
        canvas.style.height = H + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        buildDots();
      }

      window.addEventListener('resize', resize);
      resize();

      window.addEventListener('pointermove', (e) => {
        pointer.x = e.clientX;
        pointer.y = e.clientY;
      }, { passive: true });

      window.addEventListener('pointerout', (e) => {
        if (!e.relatedTarget) { pointer.x = null; pointer.y = null; }
      });

      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          cancelAnimationFrame(rafId);
          rafId = null;
        } else if (rafId === null) {
          rafId = requestAnimationFrame(frame);
        }
      });

      function frame() {
        ctx.clearRect(0, 0, W, H);

        for (const d of dots) {
          d.x += d.vx;
          d.y += d.vy;
          if (d.x < 0 || d.x > W) d.vx *= -1;
          if (d.y < 0 || d.y > H) d.vy *= -1;
          if (pointer.x !== null) {
            const dx = d.x - pointer.x;
            const dy = d.y - pointer.y;
            const dist = Math.hypot(dx, dy);
            if (dist < 120 && dist > 0.01) {
              d.x += (dx / dist) * (120 - dist) * 0.012;
              d.y += (dy / dist) * (120 - dist) * 0.012;
            }
          }
        }

        for (let i = 0; i < dots.length; i++) {
          const a = dots[i];
          for (let j = i + 1; j < dots.length; j++) {
            const b = dots[j];
            const dist = Math.hypot(a.x - b.x, a.y - b.y);
            if (dist < LINK_DIST) {
              ctx.strokeStyle = 'rgba(' + colors.line + ',' + ((1 - dist / LINK_DIST) * 0.28).toFixed(3) + ')';
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo(a.x, a.y);
              ctx.lineTo(b.x, b.y);
              ctx.stroke();
            }
          }
        }

        ctx.fillStyle = 'rgba(' + colors.dot + ', 0.65)';
        for (const d of dots) {
          ctx.beginPath();
          ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
          ctx.fill();
        }

        rafId = requestAnimationFrame(frame);
      }

      rafId = requestAnimationFrame(frame);
    }
  }
})();
