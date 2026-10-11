(() => {
  const links = Array.from(document.querySelectorAll('.toc-link[href^="#"]'))
  const chapters = Array.from(document.querySelectorAll('.chapter[id]'))

  function markCurrent(id) {
    for (const link of links) {
      const isCurrent = link.getAttribute('href') === `#${id}`
      link.classList.toggle('active', isCurrent)
      if (isCurrent) link.setAttribute('aria-current', 'location')
      else link.removeAttribute('aria-current')
    }
  }

  for (const link of links) {
    link.addEventListener('click', () => markCurrent(link.hash.slice(1)))
  }
  markCurrent(location.hash.slice(1) || chapters[0]?.id)

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      const visible = entries.filter(entry => entry.isIntersecting)
        .sort((first, second) => first.boundingClientRect.top - second.boundingClientRect.top)
      if (visible.length) markCurrent(visible[0].target.id)
    }, { rootMargin: '-15% 0px -55% 0px' })
    for (const chapter of chapters) observer.observe(chapter)
  }
})()