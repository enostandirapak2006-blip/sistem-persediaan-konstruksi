// =====================================================================
// utils.js — Fungsi bantu yang dipakai oleh banyak halaman
// =====================================================================

const NAMA_BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const BULAN_SINGKAT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

// Label yang mudah dibaca untuk kolom "sumber" di tabel jurnal
const LABEL_SUMBER = {
  SALDO_AWAL: 'Saldo Awal',
  PEMBELIAN: 'Pembelian',
  PEMBAYARAN_UTANG: 'Pembayaran Utang',
  PEMAKAIAN: 'Pemakaian',
  STOK_OPNAME: 'Stok Opname'
};


// ---------- Format angka & tanggal ----------

// 1250000 -> "Rp 1.250.000"   |   -132500 -> "-Rp 132.500"
function formatRupiah(angka) {
  const n = Number(angka) || 0;
  const teks = Math.abs(n).toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return (n < 0 ? '-Rp ' : 'Rp ') + teks;
}

// 6010 -> "6.010"   |   12.5 -> "12,5"
function formatAngka(angka) {
  return (Number(angka) || 0).toLocaleString('id-ID', { maximumFractionDigits: 2 });
}

// "2026-09-02" -> "2 Sep 2026"
// (dipecah manual supaya tidak bergeser karena zona waktu)
function formatTanggal(teks) {
  if (!teks) return '-';
  const [tahun, bulan, tanggal] = teks.slice(0, 10).split('-');
  return `${Number(tanggal)} ${BULAN_SINGKAT[Number(bulan) - 1]} ${tahun}`;
}

// "2026-09-02" -> "2 September 2026"
function formatTanggalPanjang(teks) {
  if (!teks) return '-';
  const [tahun, bulan, tanggal] = teks.slice(0, 10).split('-');
  return `${Number(tanggal)} ${NAMA_BULAN[Number(bulan) - 1]} ${tahun}`;
}

// Tanggal hari ini dalam format input date: "2026-10-10"
function hariIni() {
  const d = new Date();
  const bulan = String(d.getMonth() + 1).padStart(2, '0');
  const tanggal = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${bulan}-${tanggal}`;
}


// ---------- Keamanan tampilan ----------

// Mengubah karakter khusus HTML (< > & " ') supaya teks dari database
// tidak dianggap kode HTML. Wajib dipakai untuk teks isian pengguna
// yang dimasukkan lewat innerHTML (mencegah serangan XSS).
function esc(teks) {
  if (teks === null || teks === undefined) return '';
  return String(teks)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}


// ---------- Database ----------

// Menjalankan query Supabase. Jika gagal, lempar error supaya bisa
// ditangkap try/catch. Jika berhasil, kembalikan datanya saja.
//   Contoh: const data = await jalankan(db.from('material').select('*'));
async function jalankan(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

// Mengubah error menjadi pesan bahasa Indonesia yang mudah dipahami
function pesanError(e) {
  if (!e) return 'Terjadi kesalahan.';
  if (e.code === '23505') return 'Data dengan kode/nomor yang sama sudah ada.';
  if (e.code === '42501') return 'Akses ditolak database. Pastikan schema.sql (bagian RLS) sudah dijalankan.';
  const pesan = e.message || String(e);
  if (pesan.includes('Failed to fetch')) {
    return 'Tidak dapat terhubung ke Supabase. Periksa koneksi internet dan SUPABASE_URL di js/supabase.js.';
  }
  return pesan;
}

// Menjumlahkan satu kolom dari array data.
//   jumlahkan([{nilai: 1}, {nilai: 2}], 'nilai') -> 3
function jumlahkan(daftar, kolom) {
  return daftar.reduce((total, baris) => total + (Number(baris[kolom]) || 0), 0);
}


// ---------- Tampilan ----------

// Notifikasi kecil di pojok kanan bawah. jenis: sukses | error | peringatan
function tampilkanPesan(teks, jenis = 'sukses') {
  const wadah = document.getElementById('toastWadah');
  const el = document.createElement('div');
  el.className = 'toast ' + jenis;
  el.textContent = teks;
  wadah.appendChild(el);
  setTimeout(() => el.remove(), jenis === 'error' ? 7000 : 4000);
}

// Membuat label kecil berwarna. warna: hijau | merah | kuning | biru | abu
// ikon (opsional) ditampilkan di depan teks. Status penting sebaiknya
// diberi ikon juga, supaya tidak hanya dibedakan dengan warna
// (ramah untuk pengguna buta warna & saat dicetak hitam-putih).
function badge(teks, warna, ikon = '') {
  const tandaIkon = ikon ? `<span class="badge-ikon" aria-hidden="true">${ikon}</span>` : '';
  return `<span class="badge ${warna}">${tandaIkon}${esc(teks)}</span>`;
}

// Status stok sebuah material dalam bentuk badge
function badgeStatusStok(material) {
  const stok = Number(material.stok);
  if (stok <= 0) return badge('Habis', 'merah', '✕');
  if (stok < Number(material.stok_minimum)) return badge('Menipis', 'kuning', '!');
  return badge('Aman', 'hijau', '✓');
}

// Baris tabel "kosong" ketika tidak ada data
function barisKosong(jumlahKolom, teks = 'Belum ada data.') {
  return `<tr><td colspan="${jumlahKolom}" class="kosong">${esc(teks)}</td></tr>`;
}

// Menonaktifkan tombol selama proses simpan, supaya tidak diklik dua kali
function setLoading(tombol, sedangProses) {
  if (sedangProses) {
    tombol.dataset.teksAsli = tombol.textContent;
    tombol.textContent = 'Menyimpan...';
    tombol.disabled = true;
  } else {
    tombol.textContent = tombol.dataset.teksAsli || tombol.textContent;
    tombol.disabled = false;
  }
}

// Pintasan keyboard untuk form transaksi yang punya baris detail
// (Pembelian & Pemakaian). Admin akuntansi mengetik transaksi berulang
// kali, jadi alur tanpa mouse mempercepat input:
//   Enter di baris detail -> pindah ke baris berikutnya (atau buat baru)
//   Ctrl + Enter          -> simpan transaksi
// Enter biasa di kolom header TIDAK langsung menyimpan, supaya transaksi
// tidak tersimpan tanpa sengaja.
function aktifkanKeyboardTransaksi(form, tbodyDetail, tambahBaris) {
  form.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.target.tagName === 'BUTTON' || e.target.tagName === 'TEXTAREA') return;
    e.preventDefault();

    if (e.ctrlKey || e.metaKey) {
      form.requestSubmit();   // jalankan validasi lalu event "submit"
      return;
    }

    const baris = e.target.closest('tr');
    if (!baris || !tbodyDetail.contains(baris)) return;
    if (!baris.nextElementSibling) tambahBaris();
    baris.nextElementSibling.querySelector('select, input').focus();
  });
}

// Membuka/menutup baris detail di bawah sebuah baris tabel.
//   tombol      : tombol "Detail" yang diklik
//   jumlahKolom : jumlah kolom tabel (untuk colspan)
//   ambilIsi    : fungsi async yang mengembalikan HTML isi detail
async function toggleBarisDetail(tombol, jumlahKolom, ambilIsi) {
  const baris = tombol.closest('tr');
  const berikut = baris.nextElementSibling;

  // Jika sudah terbuka -> tutup
  if (berikut && berikut.classList.contains('baris-detail')) {
    berikut.remove();
    tombol.textContent = 'Detail';
    return;
  }

  const tr = document.createElement('tr');
  tr.className = 'baris-detail';
  tr.innerHTML = `<td colspan="${jumlahKolom}">Memuat...</td>`;
  baris.after(tr);
  tombol.textContent = 'Tutup';

  try {
    tr.firstElementChild.innerHTML = await ambilIsi();
  } catch (e) {
    tr.firstElementChild.innerHTML = `<span class="teks-merah">${esc(pesanError(e))}</span>`;
  }
}
