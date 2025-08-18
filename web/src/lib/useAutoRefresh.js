import { useEffect } from 'react'

export default function useAutoRefresh(callback, delayMs, deps=[]) {
  useEffect(() => {
    let cancelled = false
    const tick = async () => {
      try { await callback() } catch {}
      if (!cancelled) timer = setTimeout(tick, delayMs)
    }
    let timer = setTimeout(tick, delayMs)
    return () => { cancelled = true; clearTimeout(timer) }
  }, deps) // eslint-disable-line
}
