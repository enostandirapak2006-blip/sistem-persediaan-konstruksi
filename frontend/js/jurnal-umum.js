// =====================================================================
// jurnal-umum.js — Halaman Jurnal Umum
// Menampilkan semua jurnal (dibuat otomatis oleh database) dalam format
// buku jurnal: akun debit di atas, akun kredit menjorok ke kanan.
// =====================================================================

async function halamanJurnalUmum(konten) {
  konten.innerHTML = `
    <div class="kartu no-print">
      <form id="formFilter" class="filter">
        <label>Dari Tanggal <input type="date" name="dari"></label>
        <label>Sampai Tanggal <input type="date" name="sampai"></label>
        <label>Jenis Transaksi
          <select name="sumber">
            <option value="">Semua</option>
            ${Object.entries(LABEL_SUMBER).map(([kode, label]) =>
              `<option value="${kode}">${label}</option>`).join('')}
          </select>
        </label>
        <button type="submit" class="tombol utama">Tampilkan</button>
        <button type="button" class="tombol" onclick="window.print()">Cetak</button>
      </form>
    </div>
    <div class="kartu" id="hasil"></div>`;

  const form = konten.querySelector('#formFilter');
  const hasil = konten.querySelector('#hasil');

  async function tampilkan() {
    const isian = Object.fromEntries(new FormData(form));
    hasil.innerHTML = '<div class="memuat">Memuat...</div>';

    // Ambil jurnal beserta baris-barisnya dan nama akunnya sekaligus
    let query = db.from('jurnal')
      .select('id, tanggal, no_bukti, keterangan, sumber, jurnal_detail(id, debit, kredit, akun(kode, nama))')
      .order('tanggal').order('id');
    if (isian.dari) query = query.gte('tanggal', isian.dari);
    if (isian.sampai) query = query.lte('tanggal', isian.sampai);
    if (isian.sumber) query = query.eq('sumber', isian.sumber);

    let daftarJurnal;
    try {
      daftarJurnal = await jalankan(query);
    } catch (err) {
      hasil.innerHTML = `<div class="info merah">${esc(pesanError(err))}</div>`;
      return;
    }

    let totalDebit = 0;
    let totalKredit = 0;
    let html = '';

    daftarJurnal.forEach(j => {
      // Urutkan: baris debit dulu, baru kredit
      const barisJurnal = [...j.jurnal_detail].sort((a, b) => (b.debit > 0) - (a.debit > 0) || a.id - b.id);

      barisJurnal.forEach((d, i) => {
        totalDebit += Number(d.debit);
        totalKredit += Number(d.kredit);
        const pertama = i === 0;
        html += `
          <tr>
            <td class="nowrap">${pertama ? formatTanggal(j.tanggal) : ''}</td>
            <td class="nowrap">${pertama ? esc(j.no_bukti) : ''}</td>
            <td class="${d.kredit > 0 ? 'jurnal-kredit' : ''}">${esc(d.akun.nama)}</td>
            <td class="nowrap">${esc(d.akun.kode)}</td>
            <td class="kanan">${d.debit > 0 ? formatRupiah(d.debit) : ''}</td>
            <td class="kanan">${d.kredit > 0 ? formatRupiah(d.kredit) : ''}</td>
          </tr>`;
      });

      // Baris keterangan di bawah setiap jurnal
      html += `
        <tr class="jurnal-keterangan">
          <td></td><td></td>
          <td colspan="4">(${esc(j.keterangan)}) — ${esc(LABEL_SUMBER[j.sumber] || j.sumber)}</td>
        </tr>`;
    });

    const seimbang = Math.abs(totalDebit - totalKredit) < 0.005;

    hasil.innerHTML = `
      <div class="kartu-kepala">
        <h2>Jurnal Umum</h2>
        <span>${daftarJurnal.length} jurnal &nbsp;
          ${seimbang ? badge('Seimbang', 'hijau', '✓') : badge('Tidak seimbang', 'merah', '✕')}</span>
      </div>
      <div class="tabel-wadah">
        <table>
          <thead>
            <tr><th>Tanggal</th><th>No. Bukti</th><th>Akun</th><th>Ref</th>
              <th class="kanan">Debit</th><th class="kanan">Kredit</th></tr>
          </thead>
          <tbody>${html || barisKosong(6, 'Tidak ada jurnal pada periode ini.')}</tbody>
          <tfoot>
            <tr><td colspan="4">TOTAL</td>
              <td class="kanan">${formatRupiah(totalDebit)}</td>
              <td class="kanan">${formatRupiah(totalKredit)}</td></tr>
          </tfoot>
        </table>
      </div>`;
  }

  form.addEventListener('submit', e => {
    e.preventDefault();
    tampilkan();
  });

  await tampilkan();
}
