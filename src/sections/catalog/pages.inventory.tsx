import type { ComponentType } from 'react'
import { StocktakesPage } from './inventory/StocktakesPage'
import { StocktakeNewPage } from './inventory/StocktakeNewPage'
import { StocktakeCountPage } from './inventory/StocktakeCountPage'
import { StocktakeReviewPage } from './inventory/StocktakeReviewPage'
import { StocktakeSummaryPage } from './inventory/StocktakeSummaryPage'
import { StockOrdersPage } from './inventory/StockOrdersPage'
import { StockOrderNewPage } from './inventory/StockOrderNewPage'
import { StockOrderReceivePage } from './inventory/StockOrderReceivePage'
import { SuppliersPage } from './inventory/SuppliersPage'
import { SupplierEditorPage } from './inventory/SupplierEditorPage'

/** Inventory pages (catalog.md §5–§7): stocktakes, stock orders and suppliers. */
export const pages: Record<string, ComponentType> = {
  stocktakes: StocktakesPage,
  stocktakeNew: StocktakeNewPage,
  stocktakeCount: StocktakeCountPage,
  stocktakeReview: StocktakeReviewPage,
  stocktakeSummary: StocktakeSummaryPage,
  stockOrders: StockOrdersPage,
  stockOrderNew: StockOrderNewPage,
  stockOrderReceive: StockOrderReceivePage,
  suppliers: SuppliersPage,
  supplierAdd: SupplierEditorPage,
  supplierEdit: SupplierEditorPage,
}
