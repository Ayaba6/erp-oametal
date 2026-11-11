// Application installable (PWA) : enregistrement du service worker, installation et mises à jour
import { useEffect, useState } from 'react'

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

let deferred: InstallEvent | null = null
let waiting: ServiceWorker | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((f) => f())

export function registerPwa() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as InstallEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    notify()
  })
  // En développement (npm run dev), pas de service worker : il gênerait le rechargement à chaud
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js')
      const track = (w: ServiceWorker | null) => {
        if (!w) return
        w.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) {
            waiting = w
            notify()
          }
        })
      }
      if (reg.waiting && navigator.serviceWorker.controller) {
        waiting = reg.waiting
        notify()
      }
      reg.addEventListener('updatefound', () => track(reg.installing))
      // vérifie les mises à jour toutes les 30 minutes
      setInterval(() => reg.update().catch(() => undefined), 30 * 60 * 1000)
      let reloaded = false
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloaded) return
        reloaded = true
        window.location.reload()
      })
    } catch {
      /* le site reste utilisable sans service worker */
    }
  })
}

const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent)

export function usePwa() {
  const [, setTick] = useState(0)
  useEffect(() => {
    const f = () => setTick((t) => t + 1)
    listeners.add(f)
    return () => {
      listeners.delete(f)
    }
  }, [])
  return {
    installed: isStandalone(),
    canInstall: !!deferred && !isStandalone(),
    iosHint: isIos() && !isStandalone(),
    updateReady: !!waiting,
    install: async () => {
      if (!deferred) return
      await deferred.prompt()
      await deferred.userChoice
      deferred = null
      notify()
    },
    update: () => waiting?.postMessage('skipWaiting'),
  }
}
