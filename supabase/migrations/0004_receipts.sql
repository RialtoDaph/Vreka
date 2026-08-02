-- Fase 1: lampiran struk foto per transaksi.
alter table public.transactions add column receipt_path text;

-- Bucket privat — akses cuma lewat signed URL yang di-generate server-side
-- buat user yang login, bukan URL publik permanen.
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false);

-- File disimpen dengan path "{user_id}/{...}", jadi folder pertama di path
-- itu yang jadi pemiliknya — sama pola dengan RLS tabel lain di app ini,
-- cuma di sini dicek dari nama file, bukan kolom user_id.
create policy "receipts_owner_select" on storage.objects for select
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "receipts_owner_insert" on storage.objects for insert
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "receipts_owner_update" on storage.objects for update
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "receipts_owner_delete" on storage.objects for delete
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);
