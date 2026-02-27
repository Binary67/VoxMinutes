(function initializeUiShared() {
  const escapeMap = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };

  const defaultTags = [
    { label: 'Important', color: '#f44336' },
    { label: 'Brainstorming', color: '#f59e0b' },
    { label: 'Product', color: '#22c55e' },
  ];

  const SCROLL_HIDE_DELAY_MS = 700;
  const scrollHideTimeouts = new WeakMap();

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => escapeMap[char]);
  }

  function renderDefaultTags(tagListElement) {
    if (!tagListElement) {
      return;
    }

    const tagMarkup = defaultTags
      .map(
        (tag) => `
          <li class="tag-item">
            <span class="tag-dot" style="--dot-color: ${escapeHtml(tag.color)}"></span>
            <span>${escapeHtml(tag.label)}</span>
          </li>
        `
      )
      .join('');

    tagListElement.innerHTML = tagMarkup;
  }

  function updateScrollableState(element) {
    const hasOverflow =
      element.scrollHeight > element.clientHeight || element.scrollWidth > element.clientWidth;
    element.classList.toggle('has-overflow', hasOverflow);
  }

  function refreshScrollableState() {
    document.querySelectorAll('.scroll-fade').forEach((element) => {
      updateScrollableState(element);
    });
  }

  function setScrollingClass(element) {
    element.classList.add('is-scrolling');

    const previousTimeout = scrollHideTimeouts.get(element);
    if (previousTimeout) {
      clearTimeout(previousTimeout);
    }

    const timeoutId = setTimeout(() => {
      element.classList.remove('is-scrolling');
      scrollHideTimeouts.delete(element);
    }, SCROLL_HIDE_DELAY_MS);

    scrollHideTimeouts.set(element, timeoutId);
  }

  function initializeSmartScrollbars() {
    const scrollableElements = document.querySelectorAll('.scroll-fade');

    scrollableElements.forEach((element) => {
      updateScrollableState(element);

      element.addEventListener(
        'scroll',
        () => {
          setScrollingClass(element);
        },
        { passive: true }
      );
    });

    window.addEventListener('resize', () => {
      refreshScrollableState();
    });
  }

  window.uiShared = {
    escapeHtml,
    renderDefaultTags,
    initializeSmartScrollbars,
    refreshScrollableState,
  };
})();
