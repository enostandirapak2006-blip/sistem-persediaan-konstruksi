// =====================================================================
// kartu-stok.js — Halaman Kartu Stok
// Riwayat mutasi satu material (masuk, keluar, saldo jumlah & nilai),
// bisa difilter per material dan rentang tanggal.
// Data kartu_stok diisi otomatis oleh trigger di database.
// =====================================================================

async function halamanKartuStok(konten) {
  const daftarMaterial = await jalankan(db.from('material')
    .select('id, kode, nama, satuan, stok, harga_rata_rata, nilai_stok').order('kode'));

  const opsiMaterial = daftarMaterial
    .map(m => `<option value="${m.id}">${esc(m.kode)} — ${esc(m.nama)}</option>`).join('');

  konten.innerHTML = `
    <div class="kartu no-print">
      <form id="formFilter" class="filter">
        <label>Material
          <select name="material_id" required>${opsiMaterial}</select>
        </label>
        <label>Dari Tanggal <input type="date" name="dari"></label>
        <label>Sampai Tanggal <input type="date" name="sampai"></label>
        <button type="submit" class="tombol utama">Tampilkan</button>
        <button type="button" class="tombol" onclick="window.print()">Cetak</button>
      </form>
      <p class="catatan">Kosongkan tanggal untuk menampilkan semua transaksi.</p>
    </div>
    <div class="kartu" id="hasil"></div>`;

  const form = konten.querySelector('#formFilter');
  const hasil = konten.querySelector('#hasil');

  async function tampilkan() {
    const isian = Object.fromEntries(new FormData(form));
    const m = daftarMaterial.find(x => x.id == isian.material_id);
    if (!m) {
      hasil.innerHTML = '<p class="kosong">Belum ada material.</p>';
      return;
    }
    if (isian.dari && isian.sampai && isian.dari > isian.sampai) {
      tampilkanPesan('Tanggal "dari" tidak boleh setelah tanggal "sampai".', 'peringatan');
      return;
    }

    hasil.innerHTML = '<div class="memuat">Memuat...</div>';

    // Query mutasi dalam rentang tanggal
    let query = db.from('kartu_stok').select('*')
      .eq('material_id', m.id)
      .order('tanggal').order('id');
    if (isian.dari) query = query.gte('tanggal', isian.dari);
    if (isian.sampai) query = query.lte('tanggal', isian.sampai);

    // Saldo awal = saldo pada mutasi TERAKHIR sebelum tanggal "dari"
    let saldoAwal = { saldo_jumlah: 0, saldo_nilai: 0 };
    let mutasi;
    try {
      if (isian.dari) {
        const sebelum = await jalankan(db.from('kartu_stok')
          .select('saldo_jumlah, saldo_nilai')
          .eq('material_id', m.id)
          .lt('tanggal', isian.dari)
          .order('tanggal', { ascending: false })
          .order('id', { ascending: false })
          .limit(1));
        if (sebelum.length) saldoAwal = sebelum[0];
      }
      mutasi = await jalankan(query);
    } catch (err) {
      hasil.innerHTML = `<div class="info merah">${esc(pesanError(err))}</div>`;
      return;
    }

    const jenisBadge = {
      PEMBELIAN: badge('Pembelian', 'hijau'),
      PEMAKAIAN: badge('Pemakaian', 'biru'),
      STOK_OPNAME: badge('Stok Opname', 'kuning')
    };

    const baris = mutasi.map(k => `
      <tr>
        <td class="nowrap">${formatTanggal(k.tanggal)}</td>
        <td class="nowrap">${esc(k.no_bukti)}</td>
        <td>${jenisBadge[k.jenis_transaksi] || esc(k.jenis_transaksi)}</td>
        <td>${esc(k.keterangan)}</td>
        <td class="kanan">${k.masuk ? formatAngka(k.masuk) : ''}</td>
        <td class="kanan">${k.keluar ? formatAngka(k.keluar) : ''}</td>
        <td class="kanan">${formatRupiah(k.harga)}</td>
        <td class="kanan">${k.nilai_masuk ? formatRupiah(k.nilai_masuk) : ''}</td>
        <td class="kanan">${k.nilai_keluar ? formatRupiah(k.nilai_keluar) : ''}</td>
        <td class="kanan"><strong>${formatAngka(k.saldo_jumlah)}</strong></td>
        <td class="kanan"><strong>${formatRupiah(k.saldo_nilai)}</strong></td>
      </tr>`).join('');

    // Saldo akhir = saldo baris terakhir (atau saldo awal jika tidak ada mutasi)
    const terakhir = mutasi.length ? mutasi[mutasi.length - 1] : saldoAwal;

    let periode = 'Semua tanggal';
    if (isian.dari || isian.sampai) {
      periode = `${isian.dari ? formatTanggalPanjang(isian.dari) : 'awal'} s.d. ${isian.sampai ? formatTanggalPanjang(isian.sampai) : 'sekarang'}`;
    }

    hasil.innerHTML = `
      <div class="kartu-kepala">
        <div>
          <h2>Kartu Stok: ${esc(m.kode)} — ${esc(m.nama)}</h2>
          <div class="catatan" style="margin:0">Satuan: ${esc(m.satuan)} &nbsp;|&nbsp; Periode: ${periode}
            &nbsp;|&nbsp; Metode: rata-rata bergerak</div>
        </div>
        <div class="kanan">Harga rata-rata saat ini<br><strong>${formatRupiah(m.harga_rata_rata)}</strong></div>
      </div>
      <div class="tabel-wadah">
        <table>
          <thead>
            <tr><th>Tanggal</th><th>No. Bukti</th><th>Jenis</th><th>Keterangan</th>
              <th class="kanan">Masuk (${esc(m.satuan)})</th><th class="kanan">Keluar (${esc(m.satuan)})</th>
              <th class="kanan">Harga</th>
              <th class="kanan">Nilai Masuk</th><th class="kanan">Nilai Keluar</th>
              <th class="kanan">Saldo (${esc(m.satuan)})</th><th class="kanan">Saldo Nilai</th></tr>
          </thead>
          <tbody>
            ${isian.dari ? `
              <tr class="baris-saldo-awal">
                <td colspan="9">Saldo awal per ${formatTanggalPanjang(isian.dari)}</td>
                <td class="kanan">${formatAngka(saldoAwal.saldo_jumlah)}</td>
                <td class="kanan">${formatRupiah(saldoAwal.saldo_nilai)}</td>
              </tr>` : ''}
            ${baris || barisKosong(11, 'Tidak ada mutasi pada periode ini.')}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="4">JUMLAH / SALDO AKHIR</td>
              <td class="kanan">${formatAngka(jumlahkan(mutasi, 'masuk'))}</td>
              <td class="kanan">${formatAngka(jumlahkan(mutasi, 'keluar'))}</td>
              <td></td>
              <td class="kanan">${formatRupiah(jumlahkan(mutasi, 'nilai_masuk'))}</td>
              <td class="kanan">${formatRupiah(jumlahkan(mutasi, 'nilai_keluar'))}</td>
              <td class="kanan">${formatAngka(terakhir.saldo_jumlah)}</td>
              <td class="kanan">${formatRupiah(terakhir.saldo_nilai)}</td>
            </tr>
          </tfoot>
        </table>
      </div>`;
  }

  form.addEventListener('submit', e => {
    e.preventDefault();
    tampilkan();
  });
  form.material_id.addEventListener('change', tampilkan);

  await tampilkan();   // langsung tampilkan material pertama
}
