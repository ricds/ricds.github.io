const menuBtn = document.querySelector('.menu-btn');
const nav = document.querySelector('.site-nav');
const panelTriggers = document.querySelectorAll('a[data-panel], button[data-panel]');
const navLinks = document.querySelectorAll('.site-nav a[data-panel]');
const panels = document.querySelectorAll('.panel');
const defaultTitle = document.title;
const panelTitles = {
  home: defaultTitle,
  about: `About | ${defaultTitle}`,
  research: `Research & Development | ${defaultTitle}`,
  teaching: `Teaching & Supervision | ${defaultTitle}`,
  media: `Media & Outreach | ${defaultTitle}`,
  resources: `Resources | ${defaultTitle}`,
  contact: `Contact | ${defaultTitle}`,
};

const setPanel = (panelName, updateHash = true) => {
  const targetPanel = document.querySelector(`.panel[data-panel="${panelName}"]`);
  if (!targetPanel) {
    panelName = 'home';
  }

  panels.forEach((panel) => {
    panel.classList.toggle('active', panel.dataset.panel === panelName);
  });

  navLinks.forEach((link) => {
    link.classList.toggle('active', link.dataset.panel === panelName);
  });

  const activePanel = document.querySelector(`.panel[data-panel="${panelName}"]`);
  if (activePanel) {
    activePanel.querySelectorAll('.reveal').forEach((el) => {
      el.classList.remove('in-view');
    });
    requestAnimationFrame(() => {
      activePanel.querySelectorAll('.reveal').forEach((el) => {
        el.classList.add('in-view');
      });
    });
  }

  if (nav) {
    nav.classList.remove('open');
  }

  document.title = panelTitles[panelName] || defaultTitle;
  if (updateHash && window.location.hash !== `#${panelName}`) {
    window.history.pushState(null, '', `#${panelName}`);
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
};

if (menuBtn && nav) {
  menuBtn.addEventListener('click', () => {
    nav.classList.toggle('open');
  });
}

panelTriggers.forEach((link) => {
  link.addEventListener('click', (event) => {
    event.preventDefault();
    const panelName = link.dataset.panel;
    if (panelName) {
      setPanel(panelName);
    }
  });
});

const initialPanelName = window.location.hash.replace('#', '') || 'home';
setPanel(initialPanelName, false);

window.addEventListener('popstate', () => {
  setPanel(window.location.hash.replace('#', '') || 'home', false);
});

const initialPanel = document.querySelector('.panel.active');
if (initialPanel) {
  initialPanel.querySelectorAll('.reveal').forEach((el) => {
    el.classList.add('in-view');
  });
}

const yearEl = document.getElementById('year');
if (yearEl) {
  yearEl.textContent = new Date().getFullYear();
}

const heroSlider = document.querySelector('[data-slider]');
if (heroSlider) {
  const slides = Array.from(heroSlider.querySelectorAll('img'));
  const caption = heroSlider.querySelector('.image-caption');
  const previousButton = heroSlider.querySelector('[data-slide-prev]');
  const nextButton = heroSlider.querySelector('[data-slide-next]');
  let activeSlide = 0;
  let sliderTimer = null;

  if (slides.length > 1) {
    const showSlide = (nextIndex) => {
      slides[activeSlide].classList.remove('active');
      activeSlide = (nextIndex + slides.length) % slides.length;
      slides[activeSlide].classList.add('active');
      if (caption) {
        caption.textContent = slides[activeSlide].dataset.caption || '';
      }
    };

    const scheduleNextSlide = () => {
      window.clearTimeout(sliderTimer);
      sliderTimer = window.setTimeout(() => {
        showSlide(activeSlide + 1);
        scheduleNextSlide();
      }, Number(slides[activeSlide].dataset.duration) || 5000);
    };

    previousButton?.addEventListener('click', () => {
      showSlide(activeSlide - 1);
      scheduleNextSlide();
    });

    nextButton?.addEventListener('click', () => {
      showSlide(activeSlide + 1);
      scheduleNextSlide();
    });

    scheduleNextSlide();
  }
}

const pubSearch = document.getElementById('pub-search');
const pubYearFilter = document.getElementById('pub-year-filter');
const pubCount = document.getElementById('pub-count');
const pubYears = Array.from(document.querySelectorAll('.pub-year'));

if (pubSearch && pubYearFilter && pubYears.length) {
  const years = pubYears
    .map((yearBlock) => yearBlock.querySelector('h3')?.textContent.trim())
    .filter(Boolean);

  years.forEach((year) => {
    const option = document.createElement('option');
    option.value = year;
    option.textContent = year;
    pubYearFilter.appendChild(option);
  });

  const filterPublications = () => {
    const query = pubSearch.value.trim().toLowerCase();
    const selectedYear = pubYearFilter.value;
    let visibleCount = 0;

    pubYears.forEach((yearBlock) => {
      const year = yearBlock.querySelector('h3')?.textContent.trim() || '';
      const yearMatches = !selectedYear || year === selectedYear;
      let visibleInYear = 0;

      yearBlock.querySelectorAll('li').forEach((item) => {
        const textMatches = !query || item.textContent.toLowerCase().includes(query);
        const isVisible = yearMatches && textMatches;
        item.hidden = !isVisible;
        if (isVisible) {
          visibleCount += 1;
          visibleInYear += 1;
        }
      });

      yearBlock.hidden = visibleInYear === 0;
    });

    if (pubCount) {
      pubCount.textContent = `${visibleCount} publication${visibleCount === 1 ? '' : 's'} shown`;
    }
  };

  pubSearch.addEventListener('input', filterPublications);
  pubYearFilter.addEventListener('change', filterPublications);
  filterPublications();
}
