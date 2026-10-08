import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Client profile photos. The shared Client type has no photo field, so the
 * Clients section keeps small (96px) JPEG data URLs in its own persisted
 * store, keyed by client id.
 */
interface AvatarState {
  photos: Record<string, string>
  set: (clientId: string, dataUrl: string | null) => void
}

export const useClientAvatars = create<AvatarState>()(
  persist(
    (set) => ({
      photos: {},
      set: (clientId, dataUrl) =>
        set((s) => {
          const photos = { ...s.photos }
          if (dataUrl) photos[clientId] = dataUrl
          else delete photos[clientId]
          return { photos }
        }),
    }),
    { name: 'ib-client-avatars', version: 1 },
  ),
)

/** Resize an image file to a square JPEG data URL. */
export function resizeImage(file: File, size = 96): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('read'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('image'))
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d')
        if (!ctx) return reject(new Error('canvas'))
        const side = Math.min(img.width, img.height)
        ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size)
        resolve(canvas.toDataURL('image/jpeg', 0.82))
      }
      img.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  })
}
