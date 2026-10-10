-- =====================================================================
-- triggers.sql
-- Logika otomatis: stok, harga rata-rata, kartu stok, utang, dan jurnal.
--
-- Isi file ini:
--   A. Fungsi bantu (format rupiah, cari akun, nomor bukti, buat jurnal)
--   B. Trigger  -> efek per baris: stok, harga rata-rata, kartu stok,
--                  sisa utang, validasi, pengunci data
--   C. Fungsi RPC simpan_...  -> dipanggil frontend lewat supabase.rpc();
--                  membungkus SATU transaksi utuh + membuat SATU jurnal
--   D. Hak akses fungsi
--
-- KENAPA PAKAI FUNGSI RPC?
--   Satu transaksi pembelian terdiri dari header + beberapa detail +
--   perubahan stok + kartu stok + jurnal. Kalau frontend menyimpan satu
--   per satu (insert header, lalu insert detail, dst.) dan di tengah jalan
--   gagal (internet putus / stok kurang), data jadi setengah jadi.
--   Di PostgreSQL, SATU pemanggilan fungsi berjalan dalam SATU transaksi:
--   jika ada satu saja error (raise exception), SEMUA perubahan dibatalkan
--   otomatis (rollback). Frontend cukup memanggil:
--       supabase.rpc('simpan_pembelian', { ...data... })
--   Ini cara paling sederhana: tidak perlu mengatur transaksi di JavaScript.
--
-- KENAPA JURNAL DIBUAT DI FUNGSI RPC, BUKAN DI TRIGGER DETAIL?
--   Trigger "for each row" di tabel detail berjalan SEKALI PER BARIS.
--   Kalau jurnal dibuat di situ, faktur berisi 3 material menghasilkan
--   3 jurnal. Padahal aturannya: 1 transaksi = 1 jurnal. Maka:
--     - trigger  : mengurus hal yang memang per baris (stok, kartu stok)
--     - fungsi RPC: setelah semua detail masuk, menjumlah total, lalu
--                   membuat satu jurnal.
--
-- Jalankan SETELAH schema.sql dan SEBELUM seed.sql.
-- =====================================================================


-- =====================================================================
-- A. FUNGSI BANTU
-- =====================================================================

-- A.1 Format angka menjadi "Rp 1.250.000" (untuk pesan error yang ramah)
create or replace function format_rp(p_nilai numeric)
returns text
language sql immutable
as $$
  select 'Rp ' || replace(to_char(round(coalesce(p_nilai, 0)), 'FM999,999,999,999,990'), ',', '.');
$$;

-- A.2 Format jumlah barang: 12.50 -> "12,5"
create or replace function format_jumlah(p_nilai numeric)
returns text
language sql immutable
as $$
  select replace(trim_scale(coalesce(p_nilai, 0))::text, '.', ',');
$$;

-- A.3 Cari id akun berdasarkan kodenya (mis. '1101' -> id akun Kas)
create or replace function cari_akun(p_kode text)
returns bigint
language plpgsql stable
as $$
declare
  v_id bigint;
begin
  select id into v_id from akun where kode = p_kode;
  if v_id is null then
    raise exception 'Akun dengan kode % belum ada. Jalankan seed.sql terlebih dahulu.', p_kode;
  end if;
  return v_id;
end;
$$;

-- A.4 Buat nomor bukti otomatis, contoh: PK-20261010-0001
create or replace function buat_no_bukti(p_prefix text, p_urutan regclass, p_tanggal date)
returns text
language sql volatile
as $$
  select p_prefix || '-' || to_char(p_tanggal, 'YYYYMMDD') || '-'
         || lpad(nextval(p_urutan)::text, 4, '0');
$$;

-- A.5 Buat SATU jurnal berisi 2 baris: akun debit dan akun kredit.
-- Karena nilai debit dan kredit memakai angka yang sama (p_jumlah),
-- jurnal PASTI seimbang. Semua jurnal di sistem ini memang 2 baris.
create or replace function buat_jurnal(
  p_tanggal      date,
  p_no_bukti     text,
  p_keterangan   text,
  p_sumber       text,
  p_sumber_id    bigint,
  p_akun_debit   text,     -- kode akun yang didebit
  p_akun_kredit  text,     -- kode akun yang dikredit
  p_jumlah       numeric
)
returns bigint
language plpgsql
as $$
declare
  v_jurnal_id bigint;
begin
  if p_jumlah is null or p_jumlah <= 0 then
    raise exception 'Nilai jurnal harus lebih dari 0.';
  end if;

  insert into jurnal (tanggal, no_bukti, keterangan, sumber, sumber_id)
  values (p_tanggal, p_no_bukti, p_keterangan, p_sumber, p_sumber_id)
  returning id into v_jurnal_id;

  insert into jurnal_detail (jurnal_id, akun_id, debit, kredit) values
    (v_jurnal_id, cari_akun(p_akun_debit),  p_jumlah, 0),
    (v_jurnal_id, cari_akun(p_akun_kredit), 0,        p_jumlah);

  return v_jurnal_id;
end;
$$;

-- A.6 Cek urutan tanggal.
-- Metode rata-rata bergerak (moving average) menghitung harga dari
-- urutan transaksi. Kalau transaksi boleh dicatat "mundur" ke tanggal
-- sebelum transaksi terakhir, harga rata-rata dan kartu stok jadi kacau.
-- Jadi transaksi material tidak boleh bertanggal lebih awal dari
-- transaksi terakhir material tersebut.
create or replace function cek_urutan_tanggal(p_material_id bigint, p_tanggal date)
returns void
language plpgsql
as $$
declare
  v_terakhir date;
  v_nama     text;
begin
  select max(tanggal) into v_terakhir from kartu_stok where material_id = p_material_id;

  if v_terakhir is not null and p_tanggal < v_terakhir then
    select nama into v_nama from material where id = p_material_id;
    raise exception 'Tanggal % lebih awal dari transaksi terakhir material "%" (%). Transaksi harus dicatat berurutan.',
      to_char(p_tanggal, 'DD-MM-YYYY'), v_nama, to_char(v_terakhir, 'DD-MM-YYYY');
  end if;
end;
$$;


-- =====================================================================
-- B. TRIGGER
-- "before insert" = berjalan SEBELUM baris disimpan, sehingga trigger
-- bisa mengisi kolom hitungan (subtotal, harga_pokok, dll.) lewat NEW.
-- Jika trigger melempar "raise exception", penyimpanan dibatalkan.
-- =====================================================================

-- B.1 PEMBELIAN DETAIL: stok bertambah, harga rata-rata dihitung ulang,
--     kartu stok bertambah satu baris "masuk".
create or replace function fn_pembelian_detail()
returns trigger
language plpgsql
as $$
declare
  v_beli        record;
  v_mat         material%rowtype;
  v_stok_baru   numeric;
  v_nilai_baru  numeric;
begin
  if new.jumlah is null or new.jumlah <= 0 then
    raise exception 'Jumlah pembelian harus lebih dari 0.';
  end if;
  if new.harga_satuan is null or new.harga_satuan <= 0 then
    raise exception 'Harga satuan harus lebih dari 0.';
  end if;

  -- Ambil data header (tanggal, no faktur, nama supplier)
  select b.tanggal, b.no_faktur, s.nama as nama_supplier
    into v_beli
  from pembelian b
  join supplier s on s.id = b.supplier_id
  where b.id = new.pembelian_id;

  -- Ambil material dan KUNCI barisnya ("for update") supaya tidak ada
  -- dua transaksi yang mengubah stok material yang sama bersamaan.
  select * into v_mat from material where id = new.material_id for update;
  if not found then
    raise exception 'Material dengan id % tidak ditemukan.', new.material_id;
  end if;

  perform cek_urutan_tanggal(new.material_id, v_beli.tanggal);

  -- Hitung subtotal baris ini
  new.subtotal := round(new.jumlah * new.harga_satuan, 2);

  -- Rumus rata-rata bergerak:
  -- harga baru = (nilai stok lama + nilai pembelian) / (stok lama + jumlah beli)
  v_stok_baru  := v_mat.stok + new.jumlah;
  v_nilai_baru := v_mat.nilai_stok + new.subtotal;

  update material
     set stok            = v_stok_baru,
         nilai_stok      = v_nilai_baru,
         harga_rata_rata = round(v_nilai_baru / v_stok_baru, 4)
   where id = new.material_id;

  insert into kartu_stok (material_id, tanggal, jenis_transaksi, no_bukti, keterangan,
                          masuk, keluar, harga, nilai_masuk, nilai_keluar,
                          saldo_jumlah, saldo_nilai)
  values (new.material_id, v_beli.tanggal, 'PEMBELIAN', v_beli.no_faktur,
          'Pembelian dari ' || v_beli.nama_supplier,
          new.jumlah, 0, new.harga_satuan, new.subtotal, 0,
          v_stok_baru, v_nilai_baru);

  return new;
end;
$$;

drop trigger if exists trg_pembelian_detail on pembelian_detail;
create trigger trg_pembelian_detail
  before insert on pembelian_detail
  for each row execute function fn_pembelian_detail();


-- B.2 PEMAKAIAN DETAIL: tolak jika stok kurang, isi harga pokok dengan
--     harga rata-rata saat ini, stok berkurang, kartu stok "keluar".
create or replace function fn_pemakaian_detail()
returns trigger
language plpgsql
as $$
declare
  v_pakai       record;
  v_mat         material%rowtype;
  v_stok_baru   numeric;
  v_nilai_baru  numeric;
begin
  if new.jumlah is null or new.jumlah <= 0 then
    raise exception 'Jumlah pemakaian harus lebih dari 0.';
  end if;

  select h.tanggal, h.no_bukti, p.nama as nama_proyek
    into v_pakai
  from pemakaian h
  join proyek p on p.id = h.proyek_id
  where h.id = new.pemakaian_id;

  select * into v_mat from material where id = new.material_id for update;
  if not found then
    raise exception 'Material dengan id % tidak ditemukan.', new.material_id;
  end if;

  perform cek_urutan_tanggal(new.material_id, v_pakai.tanggal);

  -- Aturan: pemakaian tidak boleh melebihi stok yang tersedia
  if new.jumlah > v_mat.stok then
    raise exception 'Stok "%" tidak cukup. Tersedia % %, diminta % %.',
      v_mat.nama, format_jumlah(v_mat.stok), v_mat.satuan,
      format_jumlah(new.jumlah), v_mat.satuan;
  end if;

  -- Harga pokok = harga rata-rata saat ini
  new.harga_pokok := v_mat.harga_rata_rata;

  if new.jumlah = v_mat.stok then
    -- Stok habis: ambil seluruh sisa nilai supaya tidak tersisa
    -- receh akibat pembulatan
    new.subtotal := v_mat.nilai_stok;
  else
    new.subtotal := least(round(new.jumlah * v_mat.harga_rata_rata, 2), v_mat.nilai_stok);
  end if;

  v_stok_baru  := v_mat.stok - new.jumlah;
  v_nilai_baru := v_mat.nilai_stok - new.subtotal;

  -- Harga rata-rata TIDAK berubah saat barang keluar
  update material
     set stok       = v_stok_baru,
         nilai_stok = v_nilai_baru
   where id = new.material_id;

  insert into kartu_stok (material_id, tanggal, jenis_transaksi, no_bukti, keterangan,
                          masuk, keluar, harga, nilai_masuk, nilai_keluar,
                          saldo_jumlah, saldo_nilai)
  values (new.material_id, v_pakai.tanggal, 'PEMAKAIAN', v_pakai.no_bukti,
          'Pemakaian proyek ' || v_pakai.nama_proyek,
          0, new.jumlah, new.harga_pokok, 0, new.subtotal,
          v_stok_baru, v_nilai_baru);

  return new;
end;
$$;

drop trigger if exists trg_pemakaian_detail on pemakaian_detail;
create trigger trg_pemakaian_detail
  before insert on pemakaian_detail
  for each row execute function fn_pemakaian_detail();


-- B.3 PEMBAYARAN UTANG: tolak jika melebihi sisa utang, lalu kurangi
--     sisa utang di tabel pembelian.
create or replace function fn_pembayaran_utang()
returns trigger
language plpgsql
as $$
declare
  v_beli pembelian%rowtype;
begin
  if new.jumlah_bayar is null or new.jumlah_bayar <= 0 then
    raise exception 'Jumlah bayar harus lebih dari 0.';
  end if;

  select * into v_beli from pembelian where id = new.pembelian_id for update;
  if not found then
    raise exception 'Data pembelian tidak ditemukan.';
  end if;

  if v_beli.cara_bayar = 'tunai' then
    raise exception 'Faktur % dibayar tunai, jadi tidak memiliki utang.', v_beli.no_faktur;
  end if;

  if v_beli.sisa_utang = 0 then
    raise exception 'Utang faktur % sudah lunas.', v_beli.no_faktur;
  end if;

  if new.tanggal < v_beli.tanggal then
    raise exception 'Tanggal pembayaran tidak boleh sebelum tanggal faktur (%).',
      to_char(v_beli.tanggal, 'DD-MM-YYYY');
  end if;

  -- Aturan: pembayaran tidak boleh melebihi sisa utang
  if new.jumlah_bayar > v_beli.sisa_utang then
    raise exception 'Pembayaran % melebihi sisa utang faktur % (%).',
      format_rp(new.jumlah_bayar), v_beli.no_faktur, format_rp(v_beli.sisa_utang);
  end if;

  update pembelian
     set sisa_utang = sisa_utang - new.jumlah_bayar
   where id = new.pembelian_id;

  return new;
end;
$$;

drop trigger if exists trg_pembayaran_utang on pembayaran_utang;
create trigger trg_pembayaran_utang
  before insert on pembayaran_utang
  for each row execute function fn_pembayaran_utang();


-- B.4 STOK OPNAME: catat stok sistem, hitung selisih & nilainya,
--     samakan stok sistem dengan stok fisik, catat ke kartu stok.
create or replace function fn_stok_opname()
returns trigger
language plpgsql
as $$
declare
  v_mat material%rowtype;
begin
  if new.stok_fisik is null or new.stok_fisik < 0 then
    raise exception 'Stok fisik wajib diisi dan tidak boleh minus.';
  end if;

  select * into v_mat from material where id = new.material_id for update;
  if not found then
    raise exception 'Material dengan id % tidak ditemukan.', new.material_id;
  end if;

  perform cek_urutan_tanggal(new.material_id, new.tanggal);

  new.stok_sistem := v_mat.stok;
  new.selisih     := new.stok_fisik - v_mat.stok;   -- minus = barang hilang/kurang

  if new.stok_fisik = 0 then
    -- Barang habis: seluruh nilai stok dihapus
    new.nilai_selisih := -v_mat.nilai_stok;
  else
    -- Nilai selisih dihitung dengan harga rata-rata saat ini
    new.nilai_selisih := greatest(round(new.selisih * v_mat.harga_rata_rata, 2),
                                  -v_mat.nilai_stok);
  end if;

  -- Stok sistem disamakan dengan stok fisik
  update material
     set stok       = new.stok_fisik,
         nilai_stok = nilai_stok + new.nilai_selisih
   where id = new.material_id;

  -- Kartu stok hanya dicatat jika memang ada selisih
  if new.selisih <> 0 then
    insert into kartu_stok (material_id, tanggal, jenis_transaksi, no_bukti, keterangan,
                            masuk, keluar, harga, nilai_masuk, nilai_keluar,
                            saldo_jumlah, saldo_nilai)
    values (new.material_id, new.tanggal, 'STOK_OPNAME', new.no_bukti,
            case when new.selisih > 0 then 'Stok opname: fisik lebih'
                 else 'Stok opname: fisik kurang' end,
            greatest(new.selisih, 0), greatest(-new.selisih, 0),
            v_mat.harga_rata_rata,
            greatest(new.nilai_selisih, 0), greatest(-new.nilai_selisih, 0),
            new.stok_fisik, v_mat.nilai_stok + new.nilai_selisih);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_stok_opname on stok_opname;
create trigger trg_stok_opname
  before insert on stok_opname
  for each row execute function fn_stok_opname();


-- B.5 PENGAMAN JURNAL SEIMBANG (lapis kedua).
-- "constraint trigger ... initially deferred" = pemeriksaan ditunda
-- sampai transaksi selesai (commit). Saat itu semua baris jurnal sudah
-- masuk, lalu dicek: total debit harus = total kredit. Kalau tidak,
-- seluruh transaksi dibatalkan.
create or replace function fn_cek_jurnal_seimbang()
returns trigger
language plpgsql
as $$
declare
  v_debit  numeric;
  v_kredit numeric;
begin
  select coalesce(sum(debit), 0), coalesce(sum(kredit), 0)
    into v_debit, v_kredit
  from jurnal_detail
  where jurnal_id = new.jurnal_id;

  if v_debit <> v_kredit then
    raise exception 'Jurnal id % tidak seimbang: debit % vs kredit %.',
      new.jurnal_id, format_rp(v_debit), format_rp(v_kredit);
  end if;

  return null;
end;
$$;

drop trigger if exists trg_cek_jurnal_seimbang on jurnal_detail;
create constraint trigger trg_cek_jurnal_seimbang
  after insert on jurnal_detail
  deferrable initially deferred
  for each row execute function fn_cek_jurnal_seimbang();


-- B.6 PENGUNCI DATA TRANSAKSI (lapis kedua selain RLS).
-- Detail transaksi, kartu stok, dan jurnal tidak boleh diubah/dihapus
-- oleh siapa pun (termasuk dari SQL Editor), supaya stok, kartu stok,
-- dan jurnal selalu konsisten. Koreksi dilakukan dengan transaksi baru
-- (misalnya stok opname).
-- Catatan: header pembelian & pemakaian TIDAK dikunci di sini karena
-- fungsi RPC perlu mengisi kolom total & sisa_utang. Dari aplikasi,
-- keduanya tetap tidak bisa diubah karena tidak ada policy UPDATE.
create or replace function fn_tolak_ubah_hapus()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Data di tabel "%" tidak boleh diubah atau dihapus. Gunakan transaksi koreksi bila ada kesalahan.',
    tg_table_name;
end;
$$;

drop trigger if exists trg_kunci on pembelian_detail;
create trigger trg_kunci before update or delete on pembelian_detail
  for each row execute function fn_tolak_ubah_hapus();

drop trigger if exists trg_kunci on pemakaian_detail;
create trigger trg_kunci before update or delete on pemakaian_detail
  for each row execute function fn_tolak_ubah_hapus();

drop trigger if exists trg_kunci on pembayaran_utang;
create trigger trg_kunci before update or delete on pembayaran_utang
  for each row execute function fn_tolak_ubah_hapus();

drop trigger if exists trg_kunci on stok_opname;
create trigger trg_kunci before update or delete on stok_opname
  for each row execute function fn_tolak_ubah_hapus();

drop trigger if exists trg_kunci on kartu_stok;
create trigger trg_kunci before update or delete on kartu_stok
  for each row execute function fn_tolak_ubah_hapus();

drop trigger if exists trg_kunci on jurnal;
create trigger trg_kunci before update or delete on jurnal
  for each row execute function fn_tolak_ubah_hapus();

drop trigger if exists trg_kunci on jurnal_detail;
create trigger trg_kunci before update or delete on jurnal_detail
  for each row execute function fn_tolak_ubah_hapus();


-- =====================================================================
-- C. FUNGSI RPC (dipanggil dari frontend: supabase.rpc('nama', {...}))
--
-- "security definer" = fungsi berjalan dengan hak PEMILIK fungsi
-- (postgres), bukan hak anon. Inilah yang membuat anon bisa menyimpan
-- transaksi walaupun tidak boleh insert langsung ke tabel transaksi —
-- tapi hanya lewat jalur yang sudah kita validasi di sini.
-- "set search_path = public" = pengaman wajib untuk security definer.
--
-- Parameter p_items berbentuk JSON array, contoh:
--   [{"material_id": 1, "jumlah": 10, "harga_satuan": 65000}, ...]
-- =====================================================================

-- C.1 Simpan pembelian (tunai / kredit)
create or replace function simpan_pembelian(
  p_supplier_id  bigint,
  p_tanggal      date,
  p_no_faktur    text,
  p_cara_bayar   text,
  p_keterangan   text,
  p_items        jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id           bigint;
  v_item         jsonb;
  v_total        numeric;
  v_supplier     text;
  v_no_faktur    text := trim(p_no_faktur);
  v_akun_kredit  text;
begin
  -- 1) Validasi input
  select nama into v_supplier from supplier where id = p_supplier_id;
  if not found then
    raise exception 'Supplier belum dipilih atau tidak ditemukan.';
  end if;
  if p_tanggal is null then
    raise exception 'Tanggal wajib diisi.';
  end if;
  if coalesce(v_no_faktur, '') = '' then
    raise exception 'No. faktur wajib diisi.';
  end if;
  if p_cara_bayar is null or p_cara_bayar not in ('tunai', 'kredit') then
    raise exception 'Cara bayar harus tunai atau kredit.';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Minimal harus ada satu baris material.';
  end if;
  if exists (select 1 from pembelian
             where supplier_id = p_supplier_id and no_faktur = v_no_faktur) then
    raise exception 'Faktur % dari supplier ini sudah pernah dicatat.', v_no_faktur;
  end if;

  -- 2) Simpan header (total diisi belakangan)
  insert into pembelian (supplier_id, tanggal, no_faktur, cara_bayar, keterangan)
  values (p_supplier_id, p_tanggal, v_no_faktur, p_cara_bayar, p_keterangan)
  returning id into v_id;

  -- 3) Simpan tiap baris detail -> trigger B.1 mengurus stok & kartu stok
  for v_item in select value from jsonb_array_elements(p_items) loop
    insert into pembelian_detail (pembelian_id, material_id, jumlah, harga_satuan)
    values (v_id,
            (v_item ->> 'material_id')::bigint,
            (v_item ->> 'jumlah')::numeric,
            (v_item ->> 'harga_satuan')::numeric);
  end loop;

  -- 4) Hitung total, isi sisa utang (hanya untuk kredit)
  select sum(subtotal) into v_total from pembelian_detail where pembelian_id = v_id;

  update pembelian
     set total      = v_total,
         sisa_utang = case when p_cara_bayar = 'kredit' then v_total else 0 end
   where id = v_id;

  -- 5) SATU jurnal untuk seluruh faktur
  --    Tunai : Persediaan Material (D) / Kas (K)
  --    Kredit: Persediaan Material (D) / Utang Usaha (K)
  v_akun_kredit := case when p_cara_bayar = 'tunai' then '1101' else '2101' end;

  perform buat_jurnal(p_tanggal, v_no_faktur,
                      'Pembelian ' || p_cara_bayar || ' dari ' || v_supplier,
                      'PEMBELIAN', v_id, '1301', v_akun_kredit, v_total);

  return jsonb_build_object('id', v_id, 'no_bukti', v_no_faktur, 'total', v_total);
end;
$$;


-- C.2 Simpan pemakaian material ke proyek
create or replace function simpan_pemakaian(
  p_proyek_id   bigint,
  p_tanggal     date,
  p_no_bukti    text,     -- boleh kosong -> dibuat otomatis
  p_keterangan  text,
  p_items       jsonb     -- [{"material_id": 1, "jumlah": 10}, ...]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proyek  proyek%rowtype;
  v_id      bigint;
  v_no      text;
  v_item    jsonb;
  v_total   numeric;
begin
  -- 1) Validasi input
  select * into v_proyek from proyek where id = p_proyek_id;
  if not found then
    raise exception 'Proyek belum dipilih atau tidak ditemukan.';
  end if;
  if v_proyek.status <> 'berjalan' then
    raise exception 'Proyek "%" sudah selesai, tidak bisa menerima material lagi.', v_proyek.nama;
  end if;
  if p_tanggal is null then
    raise exception 'Tanggal wajib diisi.';
  end if;
  if p_tanggal < v_proyek.tanggal_mulai then
    raise exception 'Tanggal pemakaian tidak boleh sebelum proyek dimulai (%).',
      to_char(v_proyek.tanggal_mulai, 'DD-MM-YYYY');
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Minimal harus ada satu baris material.';
  end if;

  -- 2) Nomor bukti: pakai isian pengguna, atau buat otomatis
  v_no := coalesce(nullif(trim(p_no_bukti), ''),
                   buat_no_bukti('PK', 'seq_no_pemakaian', p_tanggal));
  if exists (select 1 from pemakaian where no_bukti = v_no) then
    raise exception 'No. bukti % sudah dipakai.', v_no;
  end if;

  -- 3) Simpan header
  insert into pemakaian (proyek_id, tanggal, no_bukti, keterangan)
  values (p_proyek_id, p_tanggal, v_no, p_keterangan)
  returning id into v_id;

  -- 4) Simpan detail -> trigger B.2 cek stok, isi harga pokok,
  --    kurangi stok, isi kartu stok
  for v_item in select value from jsonb_array_elements(p_items) loop
    insert into pemakaian_detail (pemakaian_id, material_id, jumlah)
    values (v_id,
            (v_item ->> 'material_id')::bigint,
            (v_item ->> 'jumlah')::numeric);
  end loop;

  select sum(subtotal) into v_total from pemakaian_detail where pemakaian_id = v_id;
  update pemakaian set total = v_total where id = v_id;

  -- 5) SATU jurnal: Biaya Material Proyek (D) / Persediaan Material (K)
  --    (dilewati hanya jika nilainya 0, mis. material tanpa harga)
  if v_total > 0 then
    perform buat_jurnal(p_tanggal, v_no,
                        'Pemakaian material proyek ' || v_proyek.nama,
                        'PEMAKAIAN', v_id, '5101', '1301', v_total);
  end if;

  return jsonb_build_object('id', v_id, 'no_bukti', v_no, 'total', v_total);
end;
$$;


-- C.3 Simpan pembayaran utang
create or replace function simpan_pembayaran_utang(
  p_pembelian_id  bigint,
  p_tanggal       date,
  p_jumlah        numeric,
  p_keterangan    text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_beli  record;
  v_no    text;
  v_id    bigint;
begin
  select b.no_faktur, s.nama as nama_supplier
    into v_beli
  from pembelian b
  join supplier s on s.id = b.supplier_id
  where b.id = p_pembelian_id;

  if not found then
    raise exception 'Faktur pembelian belum dipilih atau tidak ditemukan.';
  end if;
  if p_tanggal is null then
    raise exception 'Tanggal wajib diisi.';
  end if;

  v_no := buat_no_bukti('BKK', 'seq_no_pembayaran', p_tanggal);

  -- Trigger B.3 memvalidasi jumlah & mengurangi sisa utang
  insert into pembayaran_utang (pembelian_id, tanggal, no_bukti, jumlah_bayar, keterangan)
  values (p_pembelian_id, p_tanggal, v_no, p_jumlah, p_keterangan)
  returning id into v_id;

  -- Jurnal: Utang Usaha (D) / Kas (K)
  perform buat_jurnal(p_tanggal, v_no,
                      'Pembayaran utang faktur ' || v_beli.no_faktur || ' kepada ' || v_beli.nama_supplier,
                      'PEMBAYARAN_UTANG', v_id, '2101', '1101', p_jumlah);

  return jsonb_build_object('id', v_id, 'no_bukti', v_no, 'jumlah', p_jumlah);
end;
$$;


-- C.4 Simpan stok opname (satu material per pemanggilan)
create or replace function simpan_stok_opname(
  p_material_id  bigint,
  p_tanggal      date,
  p_stok_fisik   numeric,
  p_keterangan   text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nama  text;
  v_no    text;
  v_op    stok_opname%rowtype;
begin
  select nama into v_nama from material where id = p_material_id;
  if not found then
    raise exception 'Material belum dipilih atau tidak ditemukan.';
  end if;
  if p_tanggal is null then
    raise exception 'Tanggal wajib diisi.';
  end if;

  v_no := buat_no_bukti('SO', 'seq_no_opname', p_tanggal);

  -- Trigger B.4 menghitung stok sistem, selisih, nilai selisih,
  -- lalu menyamakan stok dan mengisi kartu stok
  insert into stok_opname (material_id, tanggal, no_bukti, stok_fisik, keterangan)
  values (p_material_id, p_tanggal, v_no, p_stok_fisik, p_keterangan)
  returning * into v_op;

  if v_op.nilai_selisih < 0 then
    -- Fisik LEBIH KECIL: Beban Selisih Persediaan (D) / Persediaan Material (K)
    perform buat_jurnal(p_tanggal, v_no, 'Selisih kurang stok opname ' || v_nama,
                        'STOK_OPNAME', v_op.id, '5201', '1301', -v_op.nilai_selisih);
  elsif v_op.nilai_selisih > 0 then
    -- Fisik LEBIH BESAR: Persediaan Material (D) / Pendapatan Lain-lain (K)
    perform buat_jurnal(p_tanggal, v_no, 'Selisih lebih stok opname ' || v_nama,
                        'STOK_OPNAME', v_op.id, '1301', '4201', v_op.nilai_selisih);
  end if;
  -- Jika selisih 0, tidak ada jurnal (tidak ada yang perlu dicatat)

  return jsonb_build_object(
    'id', v_op.id,
    'no_bukti', v_no,
    'stok_sistem', v_op.stok_sistem,
    'selisih', v_op.selisih,
    'nilai_selisih', v_op.nilai_selisih
  );
end;
$$;


-- =====================================================================
-- D. HAK AKSES FUNGSI
-- Secara bawaan PostgreSQL mengizinkan SEMUA orang menjalankan fungsi.
-- Kita tutup dulu semuanya, lalu buka HANYA 4 fungsi simpan_...
-- Jadi anon tidak bisa memanggil buat_jurnal() langsung untuk membuat
-- jurnal palsu.
-- =====================================================================
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function simpan_pembelian(bigint, date, text, text, text, jsonb)  to anon, authenticated;
grant execute on function simpan_pemakaian(bigint, date, text, text, jsonb)        to anon, authenticated;
grant execute on function simpan_pembayaran_utang(bigint, date, numeric, text)     to anon, authenticated;
grant execute on function simpan_stok_opname(bigint, date, numeric, text)          to anon, authenticated;
