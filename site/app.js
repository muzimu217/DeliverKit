import { ecosystems, guides } from './content.js';

const iconMarkup = (name) => `<i data-lucide="${name}"></i>`;

function renderEcosystems(filter = 'all') {
  const grid = document.querySelector('#ecosystem-grid');
  if (!grid) return;
  grid.innerHTML = ecosystems.map((item) => `
    <article class="ecosystem-card" data-family="${item.family}" ${filter !== 'all' && filter !== item.family ? 'hidden' : ''}>
      <div class="card-top"><span class="card-icon ${item.accent}">${iconMarkup(item.icon)}</span><span class="card-status">${item.status}</span></div>
      <h3>${item.name}</h3><p>${item.summary}</p>
      <div class="card-meta">${item.tags.map((tag) => `<span class="meta-pill">${tag}</span>`).join('')}</div>
      <a class="card-link" href="${item.link}">读取交付知识 ${iconMarkup('arrow-up-right')}</a>
    </article>`).join('');
  window.lucide?.createIcons();
}

function renderGuides() {
  const list = document.querySelector('#guide-list');
  if (!list) return;
  list.innerHTML = guides.map((guide, index) => `
    <article class="guide-card ${index === 0 ? 'is-open' : ''}" id="${guide.id}">
      <button class="guide-summary" type="button" aria-expanded="${index === 0}" aria-controls="${guide.id}-details">
        <span class="guide-number">${guide.number}</span><span><strong>${guide.title}</strong><small>${guide.subtitle}</small></span>${iconMarkup('chevron-down')}
      </button>
      <div class="guide-details" id="${guide.id}-details"><ol>${guide.steps.map((step) => `<li>${step}</li>`).join('')}</ol><div class="guide-links">${guide.links.map((link) => `<a href="${link.url}" target="_blank" rel="noreferrer">${link.label} ${iconMarkup('arrow-up-right')}</a>`).join('')}</div></div>
    </article>`).join('');
  list.querySelectorAll('.guide-summary').forEach((button) => button.addEventListener('click', () => {
    const card = button.closest('.guide-card');
    const open = card.classList.toggle('is-open');
    button.setAttribute('aria-expanded', String(open));
  }));
  window.lucide?.createIcons();
}

function setupNavigation() {
  const menu = document.querySelector('.menu-button');
  const nav = document.querySelector('#site-nav');
  menu?.addEventListener('click', () => {
    const open = nav.classList.toggle('is-open');
    menu.setAttribute('aria-expanded', String(open));
  });
  nav?.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
    nav.classList.remove('is-open');
    menu?.setAttribute('aria-expanded', 'false');
  }));
}

function setupFilters() {
  document.querySelectorAll('.filter-button').forEach((button) => button.addEventListener('click', () => {
    document.querySelectorAll('.filter-button').forEach((item) => item.classList.remove('is-active'));
    button.classList.add('is-active');
    renderEcosystems(button.dataset.filter || 'all');
  }));
}

function setupLaunchForm() {
  const form = document.querySelector('#launch-form');
  const note = document.querySelector('#form-note');
  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    const email = new FormData(form).get('email');
    if (typeof email === 'string' && email.includes('@')) {
      localStorage.setItem('deliverkit-launch-email', email);
      note.textContent = '已登记本地预览邮箱。接入真实订阅服务前不会上传数据。';
      form.reset();
    }
  });
}

function setupCopy() {
  document.querySelectorAll('[data-copy]').forEach((button) => button.addEventListener('click', async () => {
    const value = button.dataset.copy;
    try {
      await navigator.clipboard.writeText(value);
      const label = button.querySelector('.sr-only');
      if (label) label.textContent = '已复制';
      window.setTimeout(() => { if (label) label.textContent = '复制仓库链接'; }, 1600);
    } catch { /* Clipboard is optional on static previews. */ }
  }));
}

renderEcosystems();
renderGuides();
setupNavigation();
setupFilters();
setupLaunchForm();
setupCopy();
window.lucide?.createIcons();
