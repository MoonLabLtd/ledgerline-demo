export const SALE_STATUSES = ["completed", "pending", "cancelled", "refunded"] as const;
export type SaleStatus = (typeof SALE_STATUSES)[number];
export const STATUS_LABELS: Record<SaleStatus, string> = {
  completed: "Completed",
  pending: "Pending",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

export const PAYMENT_METHODS = ["card", "cash", "bank_transfer", "e_wallet", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  card: "Card",
  cash: "Cash",
  bank_transfer: "Bank transfer",
  e_wallet: "E-wallet",
  other: "Other",
};

export const DATE_FORMATS = ["MMM d, yyyy", "d MMM yyyy", "yyyy-MM-dd", "MM/dd/yyyy", "dd/MM/yyyy"] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];

export const LOCALES = ["en-US", "en-GB", "en-AU", "de-DE", "fr-FR", "es-ES", "id-ID", "ja-JP"] as const;

export const PAGE_SIZES = [10, 25, 50, 100] as const;
