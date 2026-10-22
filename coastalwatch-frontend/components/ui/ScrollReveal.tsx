'use client'

import { useEffect } from 'react'

/**
 * Activates IntersectionObserver on all `.reveal` elements so they
 * fade+slide in as they scroll into the viewport.
 */
export default function ScrollReveal() {
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible')
            observer.unobserve(entry.target) // animate once
          }
        })
      },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' },
    )

    // Observe all current .reveal elements
    const observe = () => {
      document.querySelectorAll('.reveal:not(.visible)').forEach((el) => {
        observer.observe(el)
      })
    }

    observe()

    // Re-observe on route changes (Next.js SPA navigation)
    const mutationObserver = new MutationObserver(observe)
    mutationObserver.observe(document.body, { childList: true, subtree: true })

    return () => {
      observer.disconnect()
      mutationObserver.disconnect()
    }
  }, [])

  return null
}
