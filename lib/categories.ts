export type CategoryGroup = { group: string; items: string[] };

export const INCOME_CATEGORIES = [
  "Gaji",
  "Bonus",
  "Freelance",
  "Tips",
  "Investasi",
  "Piutang Diterima",
  "Refund/Cashback",
  "Hadiah",
  "Lainnya",
];

export const EXPENSE_CATEGORIES = [
  "Makanan",
  "Transportasi",
  "Rumah/Sewa/KPR",
  "Tagihan",
  "Langganan",
  "Cicilan/Utang",
  "Asuransi",
  "Pajak",
  "Kirim Istri/Keluarga",
  "Belanja",
  "Hiburan",
  "Liburan",
  "Perawatan Diri",
  "Kesehatan",
  "Pendidikan",
  "Donasi/Sedekah",
  "Hadiah/Kado",
  "Lainnya",
];

// Purely a UI grouping for CategorySelect's dropdown -- the flat lists
// above stay the source of truth (used as a plain string enum everywhere
// else: Claude's structured-output schema, budget/transaction storage).
// categories.test.ts asserts these cover the flat lists exactly, so the
// two can't silently drift apart when one gets a new category and not
// the other.
export const INCOME_CATEGORY_GROUPS: CategoryGroup[] = [
  { group: "Kerjaan", items: ["Gaji", "Bonus", "Freelance", "Tips"] },
  { group: "Investasi & Piutang", items: ["Investasi", "Piutang Diterima", "Refund/Cashback"] },
  { group: "Lainnya", items: ["Hadiah", "Lainnya"] },
];

export const EXPENSE_CATEGORY_GROUPS: CategoryGroup[] = [
  { group: "Rumah Tangga", items: ["Makanan", "Transportasi", "Rumah/Sewa/KPR", "Tagihan", "Langganan"] },
  { group: "Keuangan", items: ["Cicilan/Utang", "Asuransi", "Pajak", "Kirim Istri/Keluarga"] },
  { group: "Gaya Hidup", items: ["Belanja", "Hiburan", "Liburan", "Perawatan Diri"] },
  { group: "Kesehatan & Pendidikan", items: ["Kesehatan", "Pendidikan"] },
  { group: "Sosial", items: ["Donasi/Sedekah", "Hadiah/Kado"] },
  { group: "Lainnya", items: ["Lainnya"] },
];
