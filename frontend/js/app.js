// =====================================================================
// app.js — Mengatur perpindahan menu (single-page application)
//
// Cara kerjanya:
//   1. Link di sidebar mengubah alamat menjadi index.html#nama-menu
//   2. Browser memicu event "hashchange"
//   3. Fungsi bukaHalaman() membaca #nama-menu, lalu memanggil fungsi
//      halaman yang sesuai (misal halamanMaterial) untuk menggambar isi.
// =====================================================================

// Daftar menu: id (sesuai href="#...") -> kelompok, judul, & fungsi
// penggambarnya. Fungsi-fungsi ini ada di file JS masing-masing menu.
const DAFTAR_HALAMAN = {
  'dashboard':          { grup: 'Utama',       judul: 'Dashboard',          tampil: halamanDashboard },
  'material':           { grup: 'Data Master', judul: 'Material',           tampil: halamanMaterial },
  'supplier':           { grup: 'Data Master', judul: 'Supplier',           tampil: halamanSupplier },
  'proyek':             { grup: 'Data Master', judul: 'Proyek',             tampil: halamanProyek },
  'pembelian':          { grup: 'Transaksi',   judul: 'Pembelian',          tampil: halamanPembelian },
  'pembayaran-utang':   { grup: 'Transaksi',   judul: 'Pembayaran Utang',   tampil: halamanPembayaranUtang },
  'pemakaian':          { grup: 'Transaksi',   judul: 'Pemakaian Material', tampil: halamanPemakaian },
  'stok-opname':        { grup: 'Transaksi',   judul: 'Stok Opname',        tampil: halamanStokOpname },
  'kartu-stok':         { grup: 'Laporan',     judul: 'Kartu Stok',         tampil: halamanKartuStok },
  'jurnal-umum':        { grup: 'Laporan',     judul: 'Jurnal Umum',        tampil: halamanJurnalUmum },
  'buku-besar':         { grup: 'Laporan',     judul: 'Buku Besar',         tampil: halamanBukuBesar },
  'laporan-persediaan': { grup: 'Laporan',     judul: 'Laporan Persediaan', tampil: halamanLaporanPersediaan }
};

async function bukaHalaman() {
  // "#material" -> "material". Jika kosong / tidak dikenal -> dashboard
  let id = location.hash.replace('#', '');
  if (!DAFTAR_HALAMAN[id]) id = 'dashboard';
  const halaman = DAFTAR_HALAMAN[id];

  // Tandai menu yang aktif di sidebar
  document.querySelectorAll('.menu a').forEach(link => {
    link.classList.toggle('aktif', link.dataset.menu === id);
  });

  document.getElementById('grupHalaman').textContent = halaman.grup;
  document.getElementById('judulHalaman').textContent = halaman.judul;
  document.title = halaman.judul + ' — SIPERKON';
  tutupSidebar();

  const konten = document.getElementById('konten');

  // Jika supabase.js belum diisi, tampilkan petunjuk
  if (!supabaseSudahDiatur()) {
    konten.innerHTML = `
      <div class="kartu">
        <h2>Supabase belum diatur</h2>
        <p>Buka file <code>frontend/js/supabase.js</code>, lalu isi
        <code>SUPABASE_URL</code> dan <code>SUPABASE_ANON_KEY</code>
        dengan data dari dashboard Supabase (Project Settings → API Keys).</p>
      </div>`;
    return;
  }

  // Setiap kali pindah menu, buat "wadah" baru. Jika pengguna pindah
  // menu sebelum data halaman lama selesai dimuat, halaman lama akan
  // menggambar ke wadah lama yang sudah tidak tampil (tidak bentrok).
  const wadah = document.createElement('div');
  wadah.innerHTML = '<div class="memuat">Memuat data...</div>';
  konten.replaceChildren(wadah);
  window.scrollTo(0, 0);

  try {
    await halaman.tampil(wadah);
  } catch (e) {
    console.error(e);
    wadah.innerHTML = `
      <div class="info merah">
        <strong>Gagal memuat halaman.</strong><br>${esc(pesanError(e))}
      </div>`;
  }
}

// ---------- Sidebar di HP (buka/tutup) ----------
function tutupSidebar() {
  document.getElementById('sidebar').classList.remove('buka');
  document.getElementById('overlay').classList.remove('buka');
}

document.getElementById('tombolMenu').addEventListener('click', () => {
  document.getElementById('sidebar').classList.add('buka');
  document.getElementById('overlay').classList.add('buka');
});
document.getElementById('overlay').addEventListener('click', tutupSidebar);

// ---------- Mulai aplikasi ----------
document.getElementById('tanggalHariIni').textContent =
  new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

window.addEventListener('hashchange', bukaHalaman);
bukaHalaman();
