import type { ComponentType } from 'react'
import { ProductsPage } from './products/ProductsPage'
import { ProductEditorPage } from './products/ProductEditorPage'
import { MembershipsPage } from './products/MembershipsPage'
import { MembershipEditorPage } from './products/MembershipEditorPage'

/** Products and memberships pages (catalog.md §3, §4). */
export const pages: Record<string, ComponentType> = {
  products: ProductsPage,
  productAdd: ProductEditorPage,
  productEdit: ProductEditorPage,
  memberships: MembershipsPage,
  membershipAdd: MembershipEditorPage,
  membershipEdit: MembershipEditorPage,
}
