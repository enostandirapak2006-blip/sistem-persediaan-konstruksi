// =====================================================================
// laporan-persediaan.js — Halaman Laporan Persediaan
//   1. Posisi persediaan: jumlah & nilai per material
//   2. Rekonsiliasi: total nilai persediaan HARUS sama dengan saldo
//      akun Persediaan Material (1301) di Buku Besar
//   3. Rekap pemakaian material per proyek
// =====================================================================

async function halamanLaporanPersediaan(konten) {
  const [daftarMaterial, saldoAkun, rekap] = await Promise.all([
    jalankan(db.from('material').select('*').order('kategori').order('kode')),
    jalankan(db.from('v_saldo_akun').select('kode, saldo').in('kode', ['1301', '5101'])),
    jalankan(db.from('v_rekap_pemakaian_proyek').select('*').order('nama_proyek').order('kode_material'))
  ]);

  // ---------- 1. Posisi persediaan ----------
  const totalNilai = jumlahkan(daftarMaterial, 'nilai_stok');
  const akunPersediaan = saldoAkun.find(a => a.kode === '1301');
  const saldoBukuBesar = akunPersediaan ? Number(akunPersediaan.saldo) : 0;
  const selisih = totalNilai - saldoBukuBesar;
  const cocok = Math.abs(selisih) < 0.005;

  const barisMaterial = daftarMaterial.map((m, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${esc(m.kode)}</td>
      <td>${esc(m.nama)}</td>
      <td>${esc(m.kategori)}</td>
      <td class="kanan">${formatAngka(m.stok)} ${esc(m.satuan)}</td>
      <td class="kanan">${formatRupiah(m.harga_rata_rata)}</td>
      <td class="kanan">${formatRupiah(m.nilai_stok)}</td>
    </tr>`).join('');

  // ---------- 3. Rekap per proyek (dikelompokkan) ----------
  let barisRekap = '';
  let totalSemuaProyek = 0;
  let proyekSekarang = null;
  let subtotalProyek = 0;

  // Tambahkan baris subtotal setelah setiap kelompok proyek selesai
  function tutupKelompok() {
    if (proyekSekarang === null) return;
    barisRekap += `
      <tr><td colspan="3" class="kanan"><em>Subtotal ${esc(proyekSekarang)}</em></td>
        <td class="kanan"><strong>${formatRupiah(subtotalProyek)}</strong></td></tr>`;
  }

  rekap.forEach(r => {
    if (r.nama_proyek !== proyekSekarang) {
      tutupKelompok();
      proyekSekarang = r.nama_proyek;
      subtotalProyek = 0;
      barisRekap += `
        <tr class="grup-proyek"><td colspan="4">${esc(r.nama_proyek)}
          ${r.status === 'berjalan' ? badge('Berjalan', 'biru') : badge('Selesai', 'abu')}</td></tr>`;
    }
    subtotalProyek += Number(r.total_nilai);
    totalSemuaProyek += Number(r.total_nilai);
    barisRekap += `
      <tr>
        <td style="padding-left:28px">${esc(r.kode_material)}</td>
        <td>${esc(r.nama_material)}</td>
        <td class="kanan">${formatAngka(r.total_jumlah)} ${esc(r.satuan)}</td>
        <td class="kanan">${formatRupiah(r.total_nilai)}</td>
      </tr>`;
  });
  tutupKelompok();

  const akunBiaya = saldoAkun.find(a => a.kode === '5101');
  const saldoBiaya = akunBiaya ? Number(akunBiaya.saldo) : 0;

  konten.innerHTML = `
    <div class="form-aksi no-print" style="margin:0 0 16px">
      <button class="tombol" onclick="window.print()">Cetak Laporan</button>
    </div>

    <div class="kartu">
      <div class="kartu-kepala">
        <div>
          <h2>Laporan Posisi Persediaan Material</h2>
          <div class="catatan" style="margin:0">Per ${formatTanggalPanjang(hariIni())} —
            metode perpetual, penilaian rata-rata bergerak</div>
        </div>
      </div>
      <div class="tabel-wadah">
        <table>
          <thead>
            <tr><th>No</th><th>Kode</th><th>Nama Material</th><th>Kategori</th>
              <th class="kanan">Jumlah</th><th class="kanan">Harga Rata-rata</th><th class="kanan">Nilai</th></tr>
          </thead>
          <tbody>${barisMaterial || barisKosong(7)}</tbody>
          <tfoot>
            <tr><td colspan="6">TOTAL NILAI PERSEDIAAN</td>
              <td class="kanan">${formatRupiah(totalNilai)}</td></tr>
          </tfoot>
        </table>
      </div>

      <div class="info ${cocok ? 'hijau' : 'merah'}">
        <strong>Rekonsiliasi dengan Buku Besar</strong><br>
        Total nilai persediaan (laporan ini): <strong>${formatRupiah(totalNilai)}</strong><br>
        Saldo akun 1301 Persediaan Material: <strong>${formatRupiah(saldoBukuBesar)}</strong><br>
        ${cocok
          ? '✓ Cocok — laporan persediaan sama dengan Buku Besar.'
          : `✗ Ada selisih ${formatRupiah(selisih)}. Periksa data transaksi.`}
      </div>
    </div>

    <div class="kartu">
      <h2>Rekap Pemakaian Material per Proyek</h2>
      <div class="tabel-wadah">
        <table>
          <thead>
            <tr><th>Kode</th><th>Material</th><th class="kanan">Jumlah Dipakai</th><th class="kanan">Nilai</th></tr>
          </thead>
          <tbody>${barisRekap || barisKosong(4, 'Belum ada pemakaian material.')}</tbody>
          <tfoot>
            <tr><td colspan="3">TOTAL PEMAKAIAN SEMUA PROYEK</td>
              <td class="kanan">${formatRupiah(totalSemuaProyek)}</td></tr>
          </tfoot>
        </table>
      </div>
      <p class="catatan">Saldo akun 5101 Biaya Material Proyek di Buku Besar: ${formatRupiah(saldoBiaya)}</p>
    </div>`;
}
