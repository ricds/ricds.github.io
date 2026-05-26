const menuBtn = document.querySelector('.menu-btn');
const nav = document.querySelector('.site-nav');
const panelTriggers = document.querySelectorAll('a[data-panel], button[data-panel]');
const navLinks = document.querySelectorAll('.site-nav a[data-panel]');
const panels = document.querySelectorAll('.panel');

const setPanel = (panelName) => {
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
