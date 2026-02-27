const tags = [
  { label: 'Important', color: '#f44336' },
  { label: 'Brainstorming', color: '#f59e0b' },
  { label: 'Product', color: '#22c55e' },
];

const meetings = [
  {
    title: 'Weekly Product Sync',
    date: 'Oct 24, 2023',
    duration: '45 min',
    summary:
      'Discussed the Q4 roadmap, finalized the marketing budget for the holiday campaign, and assigned launch owners.',
    category: 'Product',
    accent: '#2d8cff',
    iconBg: '#eaf2ff',
    icon: 'bi-people-fill',
    participants: ['AM', 'SK'],
    extraParticipants: 2,
  },
  {
    title: 'Client Interview: Sarah J.',
    date: 'Oct 23, 2023',
    duration: '22 min',
    summary:
      'User highlighted pain points in onboarding flow, specifically regarding email verification and first-time setup.',
    category: 'UX Research',
    accent: '#ff8f3d',
    iconBg: '#fff2e9',
    icon: 'bi-person-fill',
    participants: ['AM'],
    extraParticipants: 0,
  },
  {
    title: 'Q3 Financial Review',
    date: 'Oct 20, 2023',
    duration: '1 hr 15 min',
    summary:
      'Revenue increased by 15% QoQ. Operating costs are stable, and approved hiring plan for 3 new roles.',
    category: 'Finance',
    accent: '#22c55e',
    iconBg: '#e8faee',
    icon: 'bi-graph-up-arrow',
    participants: ['DM', 'AL'],
    extraParticipants: 0,
  },
  {
    title: 'Marketing Brainstorm',
    date: 'Oct 18, 2023',
    duration: '30 min',
    summary:
      'Ideas for social media campaign: day in the life content, customer success stories, and influencer partnerships.',
    category: 'Marketing',
    accent: '#9ca3af',
    iconBg: '#f0f2f5',
    icon: 'bi-lightbulb-fill',
    participants: ['ME'],
    extraParticipants: 0,
  },
];

const navItems = document.querySelectorAll('.nav-item');
const tagList = document.getElementById('tag-list');
const meetingsGrid = document.getElementById('meetings-grid');
const emptyState = document.getElementById('empty-state');
const searchInput = document.getElementById('search-input');

const escapeMap = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => escapeMap[char]);
}

function renderTags() {
  const tagMarkup = tags
    .map(
      (tag) => `
        <li class="tag-item">
          <span class="tag-dot" style="--dot-color: ${escapeHtml(tag.color)}"></span>
          <span>${escapeHtml(tag.label)}</span>
        </li>
      `
    )
    .join('');

  tagList.innerHTML = tagMarkup;
}

function renderParticipants(participants, extraParticipants) {
  const avatarsMarkup = participants
    .map((participant) => `<span class="avatar">${escapeHtml(participant)}</span>`)
    .join('');

  if (extraParticipants > 0) {
    return `${avatarsMarkup}<span class="avatar-extra">+${extraParticipants}</span>`;
  }

  return avatarsMarkup;
}

function createMeetingCard(meeting) {
  const title = escapeHtml(meeting.title);
  const date = escapeHtml(meeting.date);
  const duration = escapeHtml(meeting.duration);
  const summary = escapeHtml(meeting.summary);
  const category = escapeHtml(meeting.category);

  return `
    <article class="meeting-card" style="--accent: ${escapeHtml(meeting.accent)}; --icon-bg: ${escapeHtml(meeting.iconBg)};">
      <div class="meeting-top">
        <div class="meeting-icon">
          <i class="bi ${escapeHtml(meeting.icon)}"></i>
        </div>
        <button type="button" class="icon-button" aria-label="Meeting options">
          <i class="bi bi-three-dots-vertical"></i>
        </button>
      </div>

      <div>
        <h3 class="meeting-title">${title}</h3>
        <p class="meeting-meta">${date} | ${duration}</p>
      </div>

      <div class="summary-box">
        <p class="summary-badge">
          <i class="bi bi-stars"></i>
          <span>AI SUMMARY</span>
        </p>
        <p class="summary-text">${summary}</p>
      </div>

      <div class="meeting-footer">
        <div class="participants">
          ${renderParticipants(meeting.participants, meeting.extraParticipants)}
        </div>
        <span class="category-pill">${category}</span>
      </div>
    </article>
  `;
}

function renderMeetings(list) {
  if (list.length === 0) {
    meetingsGrid.innerHTML = '';
    emptyState.hidden = false;
    return;
  }

  const cardsMarkup = list.map((meeting) => createMeetingCard(meeting)).join('');
  meetingsGrid.innerHTML = cardsMarkup;
  emptyState.hidden = true;
}

function filterMeetings(query) {
  if (!query) {
    return meetings;
  }

  const normalizedQuery = query.toLowerCase();
  return meetings.filter((meeting) => {
    const searchTarget =
      `${meeting.title} ${meeting.summary} ${meeting.category}`.toLowerCase();
    return searchTarget.includes(normalizedQuery);
  });
}

function initializeNavigation() {
  navItems.forEach((item) => {
    item.addEventListener('click', () => {
      navItems.forEach((navItem) => navItem.classList.remove('is-active'));
      item.classList.add('is-active');
    });
  });
}

function initializeSearch() {
  searchInput.addEventListener('input', () => {
    const filteredMeetings = filterMeetings(searchInput.value.trim());
    renderMeetings(filteredMeetings);
  });
}

function initializeDashboard() {
  renderTags();
  renderMeetings(meetings);
  initializeNavigation();
  initializeSearch();
}

initializeDashboard();
