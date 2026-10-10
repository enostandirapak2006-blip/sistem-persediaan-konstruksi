// =====================================================================
// buku-besar.js — Halaman Buku Besar
// Mutasi satu akun dengan saldo berjalan, bisa difilter per akun dan
// rentang tanggal. Di bawahnya ada Neraca Saldo semua akun.
//
// Saldo berjalan mengikuti saldo normal akun:
//   saldo normal Debit : saldo = saldo + debit - kredit
//   saldo normal Kredit: saldo = saldo + kredit - debit
// =====================================================================

async function halamanBukuBesar(konten) {
  const daftarAkun = await jalankan(db.from('akun').select('*').order('kode'));

  const opsiAkun = daftarAkun
    .map(a => `<option value="${a.id}">${esc(a.kode)} — ${esc(a.nama)}</option>`).join('');

  konten.innerHTML = `
    <div class="kartu no-print">
      <form id="formFilter" class="filter">
        <label>Akun <select name="akun_id" required>${opsiAkun}</select></label>
        <label>Dari Tanggal <input type="date" name="dari"></label>
        <label>Sampai Tanggal <input type="date" name="sampai"></label>
        <button type="submit" class="tombol utama">Tampilkan</button>
        <button type="button" class="tombol" onclick="window.print()">Cetak</button>
      </form>
    </div>
    <div class="kartu" id="hasil"></div>
    <div class="kartu" id="neracaSaldo"></div>`;

  const form = konten.querySelector('#formFilter');
  const hasil = konten.querySelector('#hasil');

  // Hitung perubahan saldo satu baris sesuai saldo normal akun
  function perubahan(akun, debit, kredit) {
    return akun.saldo_normal === 'D'
      ? Number(debit) - Number(kredit)
      : Number(kredit) - Number(debit);
  }

  async function tampilkan() {
    const isian = Object.fromEntries(new FormData(form));
    const akun = daftarAkun.find(a => a.id == isian.akun_id);
    if (!akun) return;
    if (isian.dari && isian.sampai && isian.dari > isian.sampai) {
      tampilkanPesan('Tanggal "dari" tidak boleh setelah tanggal "sampai".', 'peringatan');
      return;
    }
    hasil.innerHTML = '<div class="memuat">Memuat...</div>';

    let mutasi;
    let saldoAwal = 0;
    try {
      // Saldo awal = jumlah semua transaksi SEBELUM tanggal "dari"
      if (isian.dari) {
        const sebelum = await jalankan(db.from('v_buku_besar')
          .select('debit, kredit')
          .eq('akun_id', akun.id)
          .lt('tanggal', isian.dari));
        sebelum.forEach(b => { saldoAwal += perubahan(akun, b.debit, b.kredit); });
      }

      let query = db.from('v_buku_besar').select('*')
        .eq('akun_id', akun.id)
        .order('tanggal').order('jurnal_id').order('id');
      if (isian.dari) query = query.gte('tanggal', isian.dari);
      if (isian.sampai) query = query.lte('tanggal', isian.sampai);
      mutasi = await jalankan(query);
    } catch (err) {
      hasil.innerHTML = `<div class="info merah">${esc(pesanError(err))}</div>`;
      return;
    }

    // Saldo berjalan
    let saldo = saldoAwal;
    const baris = mutasi.map(b => {
      saldo += perubahan(akun, b.debit, b.kredit);
      return `
        <tr>
          <td class="nowrap">${formatTanggal(b.tanggal)}</td>
          <td class="nowrap">${esc(b.no_bukti)}</td>
          <td>${esc(b.keterangan)}</td>
          <td class="kanan">${b.debit > 0 ? formatRupiah(b.debit) : ''}</td>
          <td class="kanan">${b.kredit > 0 ? formatRupiah(b.kredit) : ''}</td>
          <td class="kanan"><strong>${formatRupiah(saldo)}</strong></td>
        </tr>`;
    }).join('');

    let periode = 'Semua tanggal';
    if (isian.dari || isian.sampai) {
      periode = `${isian.dari ? formatTanggalPanjang(isian.dari) : 'awal'} s.d. ${isian.sampai ? formatTanggalPanjang(isian.sampai) : 'sekarang'}`;
    }

    hasil.innerHTML = `
      <div class="kartu-kepala">
        <div>
          <h2>Buku Besar: ${esc(akun.kode)} — ${esc(akun.nama)}</h2>
          <div class="catatan" style="margin:0">Jenis: ${esc(akun.jenis)} &nbsp;|&nbsp;
            Saldo normal: ${akun.saldo_normal === 'D' ? 'Debit' : 'Kredit'} &nbsp;|&nbsp; Periode: ${periode}</div>
        </div>
      </div>
      <div class="tabel-wadah">
        <table>
          <thead>
            <tr><th>Tanggal</th><th>No. Bukti</th><th>Keterangan</th>
              <th class="kanan">Debit</th><th class="kanan">Kredit</th><th class="kanan">Saldo</th></tr>
          </thead>
          <tbody>
            <tr class="baris-saldo-awal">
              <td colspan="5">Saldo awal${isian.dari ? ' per ' + formatTanggalPanjang(isian.dari) : ''}</td>
              <td class="kanan">${formatRupiah(saldoAwal)}</td>
            </tr>
            ${baris || barisKosong(6, 'Tidak ada transaksi pada periode ini.')}
          </tbody>
          <tfoot>
            <tr><td colspan="3">JUMLAH / SALDO AKHIR</td>
              <td class="kanan">${formatRupiah(jumlahkan(mutasi, 'debit'))}</td>
              <td class="kanan">${formatRupiah(jumlahkan(mutasi, 'kredit'))}</td>
              <td class="kanan">${formatRupiah(saldo)}</td></tr>
          </tfoot>
        </table>
      </div>`;
  }

  // Neraca saldo: saldo akhir semua akun (total debit harus = total kredit)
  async function tampilkanNeracaSaldo() {
    const el = konten.querySelector('#neracaSaldo');
    try {
      const saldo = await jalankan(db.from('v_saldo_akun').select('*').order('kode'));
      let totalD = 0;
      let totalK = 0;
      const baris = saldo.map(a => {
        // Saldo positif ditaruh di sisi saldo normalnya
        const diDebit = (a.saldo_normal === 'D') === (Number(a.saldo) >= 0);
        const nilai = Math.abs(Number(a.saldo));
        if (diDebit) totalD += nilai; else totalK += nilai;
        return `
          <tr>
            <td>${esc(a.kode)}</td><td>${esc(a.nama)}</td>
            <td class="kanan">${diDebit && nilai ? formatRupiah(nilai) : ''}</td>
            <td class="kanan">${!diDebit && nilai ? formatRupiah(nilai) : ''}</td>
          </tr>`;
      }).join('');

      el.innerHTML = `
        <div class="kartu-kepala">
          <h2>Neraca Saldo (semua tanggal)</h2>
          ${Math.abs(totalD - totalK) < 0.005 ? badge('Seimbang', 'hijau', '✓') : badge('Tidak seimbang', 'merah', '✕')}
        </div>
        <div class="tabel-wadah">
          <table>
            <thead><tr><th>Kode</th><th>Nama Akun</th><th class="kanan">Debit</th><th class="kanan">Kredit</th></tr></thead>
            <tbody>${baris}</tbody>
            <tfoot><tr><td colspan="2">TOTAL</td>
              <td class="kanan">${formatRupiah(totalD)}</td>
              <td class="kanan">${formatRupiah(totalK)}</td></tr></tfoot>
          </table>
        </div>`;
    } catch (err) {
      el.innerHTML = `<div class="info merah">${esc(pesanError(err))}</div>`;
    }
  }

  form.addEventListener('submit', e => {
    e.preventDefault();
    tampilkan();
  });
  form.akun_id.addEventListener('change', tampilkan);

  await Promise.all([tampilkan(), tampilkanNeracaSaldo()]);
}
