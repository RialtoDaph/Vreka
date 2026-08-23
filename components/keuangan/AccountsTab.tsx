"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Account } from "@/lib/types";
import { buildAccountBalances } from "@/lib/accountBalances";
import { formatCurrency, parseAmount } from "@/lib/format";
import HudPanel from "@/components/HudPanel";
import { useConfirm } from "@/lib/useConfirm";
import {
  inputClass,
  labelClass,
  primaryBtnClass,
  ghostBtnClass,
  dangerBtnClass,
  errorBannerClass,
} from "@/lib/ui";

type BalanceTx = {
  account_id: string | null;
  to_account_id: string | null;
  type: "income" | "expense" | "transfer";
  amount: number;
};

export default function AccountsTab() {
  const supabase = createClient();
  const [items, setItems] = useState<Account[]>([]);
  const [txs, setTxs] = useState<BalanceTx[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { confirm, confirmDialog } = useConfirm();

  const [name, setName] = useState("");
  const [startingBalance, setStartingBalance] = useState("");
  const [isPrimary, setIsPrimary] = useState(false);

  function resetForm() {
    setEditingId(null);
    setName("");
    setStartingBalance("");
    setIsPrimary(items.length === 0);
  }

  function toggleForm() {
    resetForm();
    setShowForm((s) => !s);
  }

  function startEdit(account: Account) {
    setEditingId(account.id);
    setName(account.name);
    setStartingBalance(String(account.starting_balance).replace(".", ","));
    setIsPrimary(account.is_primary);
    setShowForm(true);
  }

  async function load() {
    setLoading(true);
    const [{ data: accountRows }, { data: txRows }] = await Promise.all([
      supabase.from("accounts").select("*").order("created_at", { ascending: true }),
      supabase.from("transactions").select("account_id, to_account_id, type, amount"),
    ]);
    setItems(accountRows ?? []);
    setTxs((txRows ?? []) as BalanceTx[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsedStarting = startingBalance ? parseAmount(startingBalance) : 0;
    if (!name.trim() || !Number.isFinite(parsedStarting)) {
      setError("Nama atau saldo awal nggak valid.");
      return;
    }
    setSaving(true);
    setError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      return;
    }

    const payload = { name: name.trim(), starting_balance: parsedStarting };

    let targetId = editingId;
    if (editingId) {
      const { error: saveError } = await supabase.from("accounts").update(payload).eq("id", editingId);
      if (saveError) {
        setError("Gagal simpan rekening. Coba lagi.");
        setSaving(false);
        return;
      }
    } else {
      const { data: inserted, error: saveError } = await supabase
        .from("accounts")
        .insert({ user_id: user.id, ...payload, is_primary: false })
        .select("id")
        .single();
      if (saveError || !inserted) {
        setError("Gagal simpan rekening. Coba lagi.");
        setSaving(false);
        return;
      }
      targetId = inserted.id;
    }

    // The unique partial index only allows one is_primary=true row per user,
    // so the old primary has to be unset *before* this one is set -- doing
    // it the other way around would collide with that constraint.
    if (isPrimary) {
      await supabase.from("accounts").update({ is_primary: false }).eq("user_id", user.id).neq("id", targetId!);
      await supabase.from("accounts").update({ is_primary: true }).eq("id", targetId!);
    } else {
      await supabase.from("accounts").update({ is_primary: false }).eq("id", targetId!);
    }

    resetForm();
    setSaving(false);
    setShowForm(false);
    load();
  }

  async function handleDelete(id: string) {
    if (
      !(await confirm(
        "Yakin mau hapus rekening ini? Transaksi yang udah ditandain ke sini nggak akan ikut kehapus, cuma nggak ditandain lagi."
      ))
    )
      return;
    setError(null);
    const previous = items;
    setItems((prev) => prev.filter((i) => i.id !== id));
    const { error: deleteError } = await supabase.from("accounts").delete().eq("id", id);
    if (deleteError) {
      setItems(previous);
      setError("Gagal hapus rekening. Coba lagi.");
    }
  }

  const { perAccount, unassigned } = buildAccountBalances(items, txs);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={toggleForm} className={primaryBtnClass}>
          {showForm ? "Batal" : "+ Rekening Baru"}
        </button>
      </div>

      {error && <p className={errorBannerClass}>{error}</p>}

      {showForm && (
        <HudPanel>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="account-name" className={labelClass}>Nama Rekening</label>
                <input
                  id="account-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputClass}
                  placeholder="BCA, Cash, Revolut, dst"
                />
              </div>
              <div>
                <label htmlFor="account-starting" className={labelClass}>Saldo Awal (€)</label>
                <input
                  id="account-starting"
                  type="text"
                  inputMode="decimal"
                  value={startingBalance}
                  onChange={(e) => setStartingBalance(e.target.value)}
                  className={inputClass}
                  placeholder="0,00"
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-fg-muted">
              <input
                type="checkbox"
                checked={isPrimary}
                onChange={(e) => setIsPrimary(e.target.checked)}
              />
              Jadikan rekening utama (dipakai Aslan kalau nyatet transaksi tanpa nyebut rekening)
            </label>
            <button type="submit" disabled={saving} className={primaryBtnClass}>
              {saving ? "Menyimpan..." : editingId ? "Update Rekening" : "Simpan Rekening"}
            </button>
          </form>
        </HudPanel>
      )}

      {loading ? (
        <HudPanel>
          <p className="text-sm text-fg-subtle">Memuat...</p>
        </HudPanel>
      ) : items.length === 0 ? (
        <HudPanel>
          <p className="text-sm text-fg-subtle">Belum ada rekening. Tambah dulu biar transaksi bisa ditandain sumbernya.</p>
        </HudPanel>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {perAccount.map(({ account, balance }) => (
            <HudPanel key={account.id}>
              <div className="flex justify-between items-start mb-2">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-fg truncate">
                    {account.name}
                    {account.is_primary && (
                      <span className="ml-2 font-mono text-[9.5px] uppercase tracking-wider text-cyan-glow border border-cyan-glow/30 rounded-full px-1.5 py-0.5">
                        Utama
                      </span>
                    )}
                  </h3>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <button onClick={() => startEdit(account)} className={ghostBtnClass}>
                    Edit
                  </button>
                  <button onClick={() => handleDelete(account.id)} className={dangerBtnClass}>
                    Hapus
                  </button>
                </div>
              </div>
              <p className="font-mono text-lg font-bold text-mint-glow">{formatCurrency(balance)}</p>
            </HudPanel>
          ))}
        </div>
      )}

      {!loading && unassigned !== 0 && (
        <p className="text-xs text-fg-subtle">
          {formatCurrency(unassigned)} dari transaksi yang belum ditandain rekeningnya (tetap keitung di
          Kekayaan Total, tandain di tab Transaksi kalau mau lebih rapi).
        </p>
      )}

      {confirmDialog}
    </div>
  );
}
