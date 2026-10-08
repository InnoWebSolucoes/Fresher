import type { ComponentType } from 'react'
import { SegmentsPage } from './segments/SegmentsPage'
import { SegmentEditPage } from './segments/SegmentEditPage'
import { SegmentCreatePage } from './segments/SegmentCreatePage'

/** Client segments pages (clients.md §5), keyed by page id from src/app/routeRegistry.ts. */
export const pages: Record<string, ComponentType> = {
  clientSegments: SegmentsPage,
  segmentEdit: SegmentEditPage,
  segmentCreate: SegmentCreatePage,
}
