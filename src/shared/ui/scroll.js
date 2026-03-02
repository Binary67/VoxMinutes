(function initializeUiScroll() {
  const SCROLL_HIDE_DELAY_MS = 700;
  const scrollHideTimeouts = new WeakMap();

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

  window.uiScroll = {
    initializeSmartScrollbars,
    refreshScrollableState,
  };
})();
