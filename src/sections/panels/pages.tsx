import type { ComponentType } from 'react'
import { InboxPage } from './inbox/InboxPage'

/** Client Connect inbox (top-bar.md §5). */
export const pages: Record<string, ComponentType> = {
  connect: InboxPage,
  connectConversation: InboxPage,
}
