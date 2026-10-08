import { X } from 'lucide-react'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import type { DrawerProps } from '@/app/sectionRegistry'
import { CheckoutProvider, cartKey, useCheckout, useCheckoutState } from './context'
import { CartStep } from './CartStep'
import { TipStep } from './TipStep'
import { PaymentStep } from './PaymentStep'
import { ClientPicker } from './ClientPicker'
import { Summary } from './Summary'
import { EditLineModal, GiftCardModal, QuickPaymentModal, QuickSaleEditor, SellCustomModal } from './LineModals'
import { CustomTipModal, SplitTipModal } from './TipModals'
import { CashModal, OtherAmountModal, RedeemFindModal, RedeemModal, SplitSelectModal } from './PaymentModals'
import { ManualCardModal, QrModal, SelfCheckoutModal, TerminalModal } from './CardFlows'
import { CartDiscountModal, OpenRegisterModal, ReceiptNoteModal, ServiceChargeModal } from './OptionModals'
import { OffersModal } from './OffersModal'

/**
 * Checkout drawer (1249px): Cart › Tip › Payment on the left, summary on the
 * right (calendar.md §10, §15, §16). A new cart starts whenever the drawer is
 * opened with different d_* params.
 */
export function CheckoutDrawer(props: DrawerProps) {
  return <CheckoutRoot key={cartKey(props.params)} {...props} />
}

function CheckoutRoot({ params, close }: DrawerProps) {
  const { t } = useTranslation()
  const state = useCheckoutState(params, close)
  return (
    <CheckoutProvider value={state}>
      <div className="flex h-full min-h-0" data-testid="checkout">
        <div className="relative min-w-0 flex-1 overflow-y-auto px-10 pb-16 pt-9">
          {/* The floating close button sits outside the drawer; on narrower screens it would be cut off, so the drawer shows its own. */}
          <button type="button" onClick={close} aria-label={t('checkout.common.closeCheckout')} className="icon-btn absolute left-1 top-1 z-10 h-9 w-9 min-[1320px]:hidden">
            <X size={20} aria-hidden />
          </button>
          <MainArea />
        </div>
        <Summary />
      </div>
      <ModalHost />
    </CheckoutProvider>
  )
}

function MainArea() {
  const c = useCheckout()
  if (c.view === 'client') return <ClientPicker />
  if (c.step === 'tip') return <TipStep />
  if (c.step === 'payment') return <PaymentStep />
  return <CartStep />
}

function ModalHost() {
  const c = useCheckout()
  const m = c.modal
  const { setModal } = c
  const close = useCallback(() => setModal(null), [setModal])
  if (!m) return null
  switch (m.kind) {
    case 'editLine':
      return <EditLineModal key={m.key} lineKey={m.key} onClose={close} />
    case 'giftCard':
      return <GiftCardModal key={m.key ?? 'new'} lineKey={m.key} onClose={close} />
    case 'sellCustom':
      return <SellCustomModal type={m.type} onClose={close} />
    case 'quickPayment':
      return <QuickPaymentModal onClose={close} />
    case 'quickSale':
      return <QuickSaleEditor onClose={close} />
    case 'customTip':
      return <CustomTipModal onClose={close} />
    case 'splitTip':
      return <SplitTipModal onClose={close} />
    case 'cash':
      return <CashModal split={m.split} onClose={close} />
    case 'redeemFind':
      return <RedeemFindModal split={m.split} onClose={close} />
    case 'redeem':
      return <RedeemModal card={m.card} split={m.split} onClose={close} />
    case 'splitSelect':
      return <SplitSelectModal onClose={close} />
    case 'otherAmount':
      return <OtherAmountModal method={m.method} customMethodId={m.customMethodId} label={m.label} onClose={close} />
    case 'terminal':
      return <TerminalModal onClose={close} />
    case 'selfCheckout':
      return <SelfCheckoutModal onClose={close} />
    case 'qr':
      return <QrModal onClose={close} />
    case 'manualCard':
      return <ManualCardModal onClose={close} />
    case 'cartDiscount':
      return <CartDiscountModal onClose={close} />
    case 'receiptNote':
      return <ReceiptNoteModal onClose={close} />
    case 'serviceCharge':
      return <ServiceChargeModal onClose={close} />
    case 'openRegister':
      return <OpenRegisterModal onClose={close} />
    case 'offers':
      return <OffersModal onClose={close} />
    default:
      return null
  }
}
