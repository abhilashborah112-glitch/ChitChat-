import { useEffect, useState } from 'react'

export default function useLocalStorage(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw !== null) return JSON.parse(raw)
    } catch {
      /* ignore corrupt or blocked storage */
    }
    return typeof initial === 'function' ? initial() : initial
  })

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      /* storage full or blocked */
    }
  }, [key, value])

  return [value, setValue]
}