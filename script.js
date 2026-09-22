(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  const themeToggle = $('themeToggle');
  const themeIcon = $('themeIcon');
  const toTop = $('toTop');
  const copyBtn = $('copyEmail');
  const progressBar = $('scrollProgressBar');
  const nav = $('mainNav');
  const typedEl = $('typed');
  const yearEl = $('year');

  function currentTheme() {
    return document.documentElement.getAttribute('data-bs-theme');
  }

  function syncTheme() {
    if (themeIcon) themeIcon.className = 'bi ' + (currentTheme() === 'dark' ? 'bi-sun' : 'bi-moon-stars');
  }

  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const next = currentTheme() === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-bs-theme', next);
      try { localStorage.setItem('theme', next); } catch (e) { /* storage unavailable */ }
      syncTheme();
    });
    syncTheme();
  }

  window.addEventListener('scroll', () => {
    const doc = document.documentElement;
    const max = doc.scrollHeight - window.innerHeight;
    const pct = max > 0 ? (window.scrollY / max) * 100 : 0;
    if (progressBar) progressBar.style.width = pct + '%';
    if (nav) nav.classList.toggle('nav-scrolled', window.scrollY > 24);
    if (toTop) toTop.classList.toggle('show', window.scrollY > 480);
  }, { passive: true });

  if (toTop) {
    toTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }

  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      const value = copyBtn.dataset.copy || '';
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(value);
        } else {
          const ta = document.createElement('textarea');
          ta.value = value;
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
        }
        const toastEl = $('toast');
        if (toastEl && window.bootstrap && window.bootstrap.Toast) {
          window.bootstrap.Toast.getOrCreateInstance(toastEl).show();
        }
      } catch (e) { /* clipboard blocked */ }
    });
  }

  const revealEls = Array.prototype.slice.call(document.querySelectorAll('.reveal'));
  if ('IntersectionObserver' in window && revealEls.length) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    revealEls.forEach((el) => io.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add('in'));
  }

  const bars = document.querySelectorAll('.progress-bar[data-level]');
  if ('IntersectionObserver' in window && bars.length) {
    const barIO = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.style.width = entry.target.dataset.level + '%';
        barIO.unobserve(entry.target);
      });
    }, { threshold: 0.4 });
    bars.forEach((el) => barIO.observe(el));
  } else {
    bars.forEach((el) => { el.style.width = el.dataset.level + '%'; });
  }

  const typedWords = ['IT Professional', 'Front-End Developer', 'Problem Solver', 'Lifelong Learner'];
  if (typedEl && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    let w = 0, i = 0, deleting = false;
    (function tick() {
      const word = typedWords[w];
      i = deleting ? i - 1 : i + 1;
      typedEl.textContent = word.slice(0, i);
      let delay = deleting ? 45 : 85;
      if (!deleting && i === word.length) { delay = 1700; deleting = true; }
      else if (deleting && i === 0) { deleting = false; w = (w + 1) % typedWords.length; delay = 350; }
      setTimeout(tick, delay);
    })();
  }

  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  const GITHUB_USER = "rbndict";
  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
    );
  const fmt = (n) =>
    n >= 1000 ? (n / 1000).toFixed(n % 1000 >= 100 ? 1 : 0) + "k" : String(n);

  async function ghJson(url) {
    const res = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });
    if (!res.ok) throw new Error(res.status);
    return res.json();
  }

  (async () => {
    const set = (id, v) => {
      const el = $(id);
      if (el) el.textContent = v;
    };
    try {
      const u = await ghJson("https://api.github.com/users/" + GITHUB_USER);
      set("statRepos", fmt(u.public_repos));
      set("statFollowers", fmt(u.followers));
      let stars = 0,
        forks = 0;
      const repos = await ghJson(
        "https://api.github.com/users/" + GITHUB_USER + "/repos?per_page=100&sort=updated",
      );
      repos.forEach((r) => {
        stars += r.stargazers_count;
        forks += r.forks_count;
      });
      set("statStars", fmt(stars));
      set("statForks", fmt(forks));
    } catch (e) {
      ["statRepos", "statStars", "statFollowers", "statForks"].forEach((id) => set(id, "–"));
    }
  })();

  (async () => {
    const langList = $("langList");
    try {
      const repos = await ghJson(
        "https://api.github.com/users/" + GITHUB_USER + "/repos?per_page=100",
      );
      const langs = {};
      repos.forEach((r) => {
        if (r.language && !r.fork) langs[r.language] = (langs[r.language] || 0) + 1;
      });
      const total = Object.values(langs).reduce((a, b) => a + b, 0) || 1;
      const palette = ["#64ffda", "#4a9eff", "#ff7ab0", "#ffd166", "#a78bfa", "#4ade80", "#fb923c"];
      const sorted = Object.entries(langs).sort((a, b) => b[1] - a[1]).slice(0, 6);
      if (!sorted.length) {
        langList.innerHTML = '<span class="stat-loading">No language data yet</span>';
        return;
      }
      langList.innerHTML = sorted
        .map(
          ([name, count], i) =>
            '<div class="lang-row"><span class="lang-name">' +
            esc(name) +
            '</span><span class="lang-track"><span class="lang-fill" style="width:' +
            Math.round((count / total) * 100) +
            '%;background:' +
            palette[i % palette.length] +
            '"></span></span><span class="lang-pct">' +
            Math.round((count / total) * 100) +
            "%</span></div>",
        )
        .join("");
    } catch (e) {
      if (langList) langList.innerHTML = '<span class="stat-loading">Couldn\u2019t load data</span>';
    }
  })();

  (async () => {
    const list = $("activityList");
    try {
      const events = await ghJson(
        "https://api.github.com/users/" + GITHUB_USER + "/events/public?per_page=6",
      );
      const icons = {
        PushEvent: "bi-arrow-up-circle",
        PullRequestEvent: "bi-file-earmark-code",
        CreateEvent: "bi-plus-circle",
        WatchEvent: "bi-star",
        ForkEvent: "bi-fork",
        IssuesEvent: "bi-bug",
        IssueCommentEvent: "bi-chat-left-text",
        PublicEvent: "bi-broadcast",
        DeleteEvent: "bi-dash-circle",
      };
      const titles = {
        PushEvent: "Pushed to",
        PullRequestEvent: "Pull request in",
        CreateEvent: "Created",
        WatchEvent: "Starred",
        ForkEvent: "Forked",
        IssuesEvent: "Issue in",
        IssueCommentEvent: "Commented in",
        PublicEvent: "Made public",
        DeleteEvent: "Deleted in",
      };
      if (!events.length) {
        list.innerHTML = '<li class="stat-loading">No recent public activity</li>';
        return;
      }
      list.innerHTML = events
        .map((ev) => {
          const repo = (ev.repo && ev.repo.name) || "";
          const when = new Date(ev.created_at).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          });
          return (
            '<li><i class="bi ' +
            (icons[ev.type] || "bi-activity") +
            '" aria-hidden="true"></i><span class="act-text"><span class="act-verb">' +
            (titles[ev.type] || "Activity in") +
            '</span> <a href="https://github.com/' +
            esc(repo) +
            '" target="_blank" rel="noopener">' +
            esc(repo) +
            '</a></span><span class="act-date">' +
            esc(when) +
            "</span></li>"
          );
        })
        .join("");
    } catch (e) {
      if (list) list.innerHTML = '<li class="stat-loading">Couldn\u2019t load data</li>';
    }
  })();

  const navLinks = Array.prototype.slice.call(document.querySelectorAll('#navMenu .nav-link[href^="#"]'));
  if ('IntersectionObserver' in window && navLinks.length) {
    const sections = navLinks
      .map((a) => document.querySelector(a.getAttribute('href')))
      .filter(Boolean);
    const spy = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        navLinks.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#' + entry.target.id));
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    sections.forEach((s) => spy.observe(s));
  }

  document.querySelectorAll('#navMenu a[href^="#"]').forEach((a) => {
    a.addEventListener('click', () => {
      const menu = $('navMenu');
      if (menu && menu.classList.contains('show') && window.bootstrap) {
        window.bootstrap.Collapse.getOrCreateInstance(menu).hide();
      }
    });
  });
})();
