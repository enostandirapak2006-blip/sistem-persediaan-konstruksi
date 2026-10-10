// =====================================================================
// dashboard.js — Halaman Dashboard
// Ringkasan: nilai persediaan, utang usaha, proyek berjalan, saldo kas,
// daftar stok menipis, dan transaksi terakhir.
// =====================================================================

async function halamanDashboard(konten) {
  // Ambil beberapa data sekaligus (paralel) supaya lebih cepat
  const [daftarMaterial, daftarUtang, daftarProyek, saldoAkun, jurnalTerakhir] = await Promise.all([
    jalankan(db.from('material').select('kode, nama, satuan, stok, stok_minimum, nilai_stok').order('kode')),
    jalankan(db.from('pembelian').select('sisa_utang').gt('sisa_utang', 0)),
    jalankan(db.from('proyek').select('status')),
    jalankan(db.from('v_saldo_akun').select('kode, saldo')),
    jalankan(db.from('jurnal').select('tanggal, no_bukti, keterangan, sumber')
      .order('id', { ascending: false }).limit(6))
  ]);

  // Hitung angka-angka ringkasan
  const totalPersediaan = jumlahkan(daftarMaterial, 'nilai_stok');
  const totalUtang = jumlahkan(daftarUtang, 'sisa_utang');
  const proyekBerjalan = daftarProyek.filter(p => p.status === 'berjalan').length;
  const akunKas = saldoAkun.find(a => a.kode === '1101');
  const saldoKas = akunKas ? akunKas.saldo : 0;

  // Material yang stoknya DI BAWAH stok minimum
  const stokMenipis = daftarMaterial.filter(m => Number(m.stok) < Number(m.stok_minimum));

  const barisMenipis = stokMenipis.map(m => `
    <tr>
      <td>${esc(m.kode)}</td>
      <td>${esc(m.nama)}</td>
      <td class="kanan">${formatAngka(m.stok)} ${esc(m.satuan)}</td>
      <td class="kanan">${formatAngka(m.stok_minimum)} ${esc(m.satuan)}</td>
      <td>${badgeStatusStok(m)}</td>
    </tr>`).join('');

  const barisJurnal = jurnalTerakhir.map(j => `
    <tr>
      <td class="nowrap">${formatTanggal(j.tanggal)}</td>
      <td class="nowrap">${esc(j.no_bukti)}</td>
      <td>${esc(j.keterangan)}</td>
      <td>${badge(LABEL_SUMBER[j.sumber] || j.sumber, 'abu')}</td>
    </tr>`).join('');

  // Banner peringatan di paling atas: satu-satunya hal yang menuntut
  // tindakan admin, jadi harus terlihat pertama kali.
  const banner = stokMenipis.length
    ? `<div class="banner peringatan">
         <span class="banner-ikon" aria-hidden="true">!</span>
         <div><strong>${stokMenipis.length} material di bawah stok minimum.</strong>
           Segera lakukan pembelian: ${stokMenipis.slice(0, 4).map(m => esc(m.nama)).join(', ')}${stokMenipis.length > 4 ? ', …' : ''}.</div>
         <a href="#pembelian" class="tombol kecil">Buat Pembelian</a>
       </div>`
    : '';

  konten.innerHTML = `
    ${banner}
    <div class="grid-ringkasan">
      <div class="ringkasan">
        <div class="label">Total Nilai Persediaan</div>
        <div class="nilai">${formatRupiah(totalPersediaan)}</div>
        <div class="sub">${daftarMaterial.length} jenis material</div>
      </div>
      <div class="ringkasan merah">
        <div class="label">Total Utang Usaha</div>
        <div class="nilai">${formatRupiah(totalUtang)}</div>
        <div class="sub">${daftarUtang.length} faktur belum lunas</div>
      </div>
      <div class="ringkasan biru">
        <div class="label">Proyek Berjalan</div>
        <div class="nilai">${proyekBerjalan}</div>
        <div class="sub">dari ${daftarProyek.length} proyek</div>
      </div>
      <div class="ringkasan hijau">
        <div class="label">Saldo Kas</div>
        <div class="nilai">${formatRupiah(saldoKas)}</div>
        <div class="sub">menurut Buku Besar</div>
      </div>
    </div>

    <div class="grid-2">
      <div class="kartu">
        <div class="kartu-kepala">
          <h2>Stok di Bawah Minimum</h2>
          ${stokMenipis.length ? badge(stokMenipis.length + ' material', 'kuning', '!') : ''}
        </div>
        ${stokMenipis.length
          ? `<div class="tabel-wadah"><table>
              <thead><tr><th>Kode</th><th>Material</th><th class="kanan">Stok</th>
                <th class="kanan">Minimum</th><th>Status</th></tr></thead>
              <tbody>${barisMenipis}</tbody>
            </table></div>`
          : '<div class="info hijau">Semua stok material masih di atas batas minimum.</div>'}
      </div>

      <div class="kartu">
        <div class="kartu-kepala">
          <h2>Transaksi Terakhir</h2>
          <a href="#jurnal-umum" class="tombol kecil">Lihat Jurnal</a>
        </div>
        <div class="tabel-wadah"><table>
          <thead><tr><th>Tanggal</th><th>No. Bukti</th><th>Keterangan</th><th>Jenis</th></tr></thead>
          <tbody>${barisJurnal || barisKosong(4, 'Belum ada transaksi.')}</tbody>
        </table></div>
      </div>
    </div>`;
}
