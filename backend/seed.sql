-- =====================================================================
-- seed.sql
-- Data contoh untuk demo. Jalankan TERAKHIR (setelah schema.sql dan
-- triggers.sql). Jalankan hanya SEKALI setelah schema.sql; kalau ingin
-- mengulang, jalankan lagi ketiga file dari awal.
--
-- Transaksi contoh sengaja disimpan lewat fungsi simpan_... (sama
-- persis dengan yang dipakai aplikasi), sehingga stok, kartu stok, dan
-- jurnal ikut terisi otomatis dan pasti konsisten.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. DAFTAR AKUN
-- Kode akun ini dipakai di triggers.sql — jangan diubah kodenya.
-- ---------------------------------------------------------------------
insert into akun (kode, nama, jenis, saldo_normal) values
  ('1101', 'Kas',                      'Aset',       'D'),
  ('1301', 'Persediaan Material',      'Aset',       'D'),
  ('2101', 'Utang Usaha',              'Liabilitas', 'K'),
  ('3101', 'Modal',                    'Ekuitas',    'K'),
  ('4201', 'Pendapatan Lain-lain',     'Pendapatan', 'K'),
  ('5101', 'Biaya Material Proyek',    'Beban',      'D'),
  ('5201', 'Beban Selisih Persediaan', 'Beban',      'D');


-- ---------------------------------------------------------------------
-- 2. SALDO AWAL KAS lewat jurnal modal
--    Kas (D) 500.000.000 / Modal (K) 500.000.000
-- ---------------------------------------------------------------------
select buat_jurnal('2026-09-01', 'SA-0001', 'Setoran modal awal pemilik',
                   'SALDO_AWAL', null, '1101', '3101', 500000000);


-- ---------------------------------------------------------------------
-- 3. MATERIAL (stok awal 0 — stok hanya bertambah lewat pembelian)
-- ---------------------------------------------------------------------
insert into material (kode, nama, kategori, satuan, stok_minimum) values
  ('MAT-001', 'Semen Portland 50 kg',     'Semen',     'sak',    100),
  ('MAT-002', 'Besi Beton Ulir D13',      'Besi',      'batang',  75),
  ('MAT-003', 'Besi Beton Polos D10',     'Besi',      'batang',  50),
  ('MAT-004', 'Pasir Beton',              'Agregat',   'm3',      10),
  ('MAT-005', 'Batu Split 1-2',           'Agregat',   'm3',      10),
  ('MAT-006', 'Bata Merah',               'Bata',      'buah',  2000),
  ('MAT-007', 'Cat Tembok Putih 25 kg',   'Cat',       'pail',    10),
  ('MAT-008', 'Kawat Bendrat',            'Besi',      'kg',      20),
  ('MAT-009', 'Keramik Lantai 40x40',     'Finishing', 'dus',     30),
  ('MAT-010', 'Pipa PVC 3 inch',          'Plumbing',  'batang',  20);


-- ---------------------------------------------------------------------
-- 4. SUPPLIER
-- ---------------------------------------------------------------------
insert into supplier (nama, alamat, telepon) values
  ('TB Sumber Makmur',    'Jl. Soekarno-Hatta No. 120, Bandung', '022-7301122'),
  ('PT Baja Perkasa',     'Kawasan Industri Cikarang Blok B-7',  '021-89904455'),
  ('CV Pasir Jaya',       'Jl. Raya Cileunyi Km. 5, Bandung',    '0812-2345-6789'),
  ('Toko Cat Warna Indah','Jl. Kopo No. 88, Bandung',            '022-5401234');


-- ---------------------------------------------------------------------
-- 5. PROYEK (satu proyek "selesai" untuk menguji penolakan pemakaian)
-- ---------------------------------------------------------------------
insert into proyek (nama, lokasi, tanggal_mulai, status) values
  ('Pembangunan Ruko 3 Lantai Jl. Merdeka', 'Bandung',  '2026-08-15', 'berjalan'),
  ('Renovasi Gedung SDN 5 Cimahi',          'Cimahi',   '2026-09-01', 'berjalan'),
  ('Perumahan Griya Asri Blok C',           'Sumedang', '2026-03-01', 'selesai');


-- ---------------------------------------------------------------------
-- 6. TRANSAKSI CONTOH
-- Fungsi bantu sementara (pg_temp = hilang sendiri setelah selesai)
-- supaya kita bisa menulis kode material/nama alih-alih angka id.
-- ---------------------------------------------------------------------
create or replace function pg_temp.mat(p_kode text) returns bigint
language sql as $$ select id from material where kode = p_kode $$;

create or replace function pg_temp.sup(p_nama text) returns bigint
language sql as $$ select id from supplier where nama = p_nama $$;

create or replace function pg_temp.pro(p_nama text) returns bigint
language sql as $$ select id from proyek where nama = p_nama $$;


-- 02-09-2026  Pembelian TUNAI dari TB Sumber Makmur  (total 28.600.000)
select simpan_pembelian(pg_temp.sup('TB Sumber Makmur'), '2026-09-02', 'FTR-SM-0901', 'tunai',
  'Stok awal gudang',
  jsonb_build_array(
    jsonb_build_object('material_id', pg_temp.mat('MAT-001'), 'jumlah',   300, 'harga_satuan', 65000),
    jsonb_build_object('material_id', pg_temp.mat('MAT-006'), 'jumlah', 10000, 'harga_satuan',   800),
    jsonb_build_object('material_id', pg_temp.mat('MAT-008'), 'jumlah',    50, 'harga_satuan', 22000)
  ));

-- 03-09-2026  Pembelian KREDIT dari PT Baja Perkasa  (total 33.750.000)
select simpan_pembelian(pg_temp.sup('PT Baja Perkasa'), '2026-09-03', 'INV-BP-2209', 'kredit',
  'Tempo 30 hari',
  jsonb_build_array(
    jsonb_build_object('material_id', pg_temp.mat('MAT-002'), 'jumlah', 200, 'harga_satuan', 120000),
    jsonb_build_object('material_id', pg_temp.mat('MAT-003'), 'jumlah', 150, 'harga_satuan',  65000)
  ));

-- 05-09-2026  Pembelian KREDIT dari CV Pasir Jaya  (total 20.600.000)
select simpan_pembelian(pg_temp.sup('CV Pasir Jaya'), '2026-09-05', 'PJ-0457', 'kredit',
  'Tempo 14 hari',
  jsonb_build_array(
    jsonb_build_object('material_id', pg_temp.mat('MAT-004'), 'jumlah', 40, 'harga_satuan', 275000),
    jsonb_build_object('material_id', pg_temp.mat('MAT-005'), 'jumlah', 30, 'harga_satuan', 320000)
  ));

-- 10-09-2026  Pemakaian ke proyek Ruko  (total 25.165.000)
select simpan_pemakaian(pg_temp.pro('Pembangunan Ruko 3 Lantai Jl. Merdeka'), '2026-09-10', null,
  'Pengecoran kolom lantai 1',
  jsonb_build_array(
    jsonb_build_object('material_id', pg_temp.mat('MAT-001'), 'jumlah', 120),
    jsonb_build_object('material_id', pg_temp.mat('MAT-002'), 'jumlah',  80),
    jsonb_build_object('material_id', pg_temp.mat('MAT-004'), 'jumlah',  15),
    jsonb_build_object('material_id', pg_temp.mat('MAT-005'), 'jumlah',  10),
    jsonb_build_object('material_id', pg_temp.mat('MAT-008'), 'jumlah',  20)
  ));

-- 12-09-2026  Pemakaian ke proyek SDN 5  (total 9.300.000)
select simpan_pemakaian(pg_temp.pro('Renovasi Gedung SDN 5 Cimahi'), '2026-09-12', null,
  'Pasangan dinding ruang kelas',
  jsonb_build_array(
    jsonb_build_object('material_id', pg_temp.mat('MAT-001'), 'jumlah',   60),
    jsonb_build_object('material_id', pg_temp.mat('MAT-006'), 'jumlah', 4000),
    jsonb_build_object('material_id', pg_temp.mat('MAT-004'), 'jumlah',    8)
  ));

-- 15-09-2026  Pembelian TUNAI semen dengan harga BARU (67.000)
-- Contoh rata-rata bergerak semen:
--   stok lama 120 sak senilai 7.800.000 + beli 200 sak senilai 13.400.000
--   = 21.200.000 / 320 sak = Rp 66.250 per sak
select simpan_pembelian(pg_temp.sup('TB Sumber Makmur'), '2026-09-15', 'FTR-SM-0915', 'tunai',
  null,
  jsonb_build_array(
    jsonb_build_object('material_id', pg_temp.mat('MAT-001'), 'jumlah', 200, 'harga_satuan', 67000)
  ));

-- 20-09-2026  Bayar SEBAGIAN utang PT Baja Perkasa: 20.000.000
--             (sisa utang faktur INV-BP-2209 menjadi 13.750.000)
select simpan_pembayaran_utang(
  (select id from pembelian where no_faktur = 'INV-BP-2209'),
  '2026-09-20', 20000000, 'Pembayaran termin 1');

-- 25-09-2026  Pemakaian ke proyek Ruko  (total 17.075.000)
--             semen dinilai dengan harga rata-rata baru 66.250
select simpan_pemakaian(pg_temp.pro('Pembangunan Ruko 3 Lantai Jl. Merdeka'), '2026-09-25', null,
  'Pengecoran balok & plat lantai 2',
  jsonb_build_array(
    jsonb_build_object('material_id', pg_temp.mat('MAT-001'), 'jumlah', 100),
    jsonb_build_object('material_id', pg_temp.mat('MAT-002'), 'jumlah',  60),
    jsonb_build_object('material_id', pg_temp.mat('MAT-003'), 'jumlah',  50)
  ));

-- 30-09-2026  Stok opname akhir bulan
--   Semen: sistem 220, fisik 218 -> kurang 2 x 66.250 = 132.500 (beban)
select simpan_stok_opname(pg_temp.mat('MAT-001'), '2026-09-30', 218, 'Ada 2 sak mengeras');
--   Bata : sistem 6.000, fisik 6.010 -> lebih 10 x 800 = 8.000 (pendapatan)
select simpan_stok_opname(pg_temp.mat('MAT-006'), '2026-09-30', 6010, 'Sisa bonus pengiriman');


-- ---------------------------------------------------------------------
-- HASIL YANG DIHARAPKAN SETELAH SEED:
--   Saldo Kas                  = 438.000.000
--   Saldo Persediaan Material  =  44.685.500  (= total nilai_stok material)
--   Saldo Utang Usaha          =  34.350.000
--   Saldo Modal                = 500.000.000
--   Biaya Material Proyek      =  51.540.000
--   Beban Selisih Persediaan   =     132.500
--   Pendapatan Lain-lain       =       8.000
--   Stok menipis: Besi D13 (60 < 75), Cat, Keramik, Pipa PVC (stok 0)
-- ---------------------------------------------------------------------
