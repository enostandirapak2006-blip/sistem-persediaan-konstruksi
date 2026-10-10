// =====================================================================
// pembayaran-utang.js — Halaman Pembayaran Utang
//
// Disimpan lewat db.rpc('simpan_pembayaran_utang', ...).
// Database menolak jika jumlah bayar melebihi sisa utang, lalu
// otomatis mengurangi sisa utang dan membuat jurnal:
//   Utang Usaha (D) / Kas (K)
// =====================================================================

async function halamanPembayaranUtang(konten) {
  const [daftarUtang, riwayat] = await Promise.all([
    // Faktur kredit yang masih punya sisa utang
    jalankan(db.from('pembelian')
      .select('id, tanggal, no_faktur, total, sisa_utang, supplier(nama)')
      .eq('cara_bayar', 'kredit')
      .gt('sisa_utang', 0)
      .order('tanggal')),
    jalankan(db.from('pembayaran_utang')
      .select('tanggal, no_bukti, jumlah_bayar, keterangan, pembelian(no_faktur, supplier(nama))')
      .order('tanggal', { ascending: false })
      .order('id', { ascending: false }))
  ]);

  const totalUtang = jumlahkan(daftarUtang, 'sisa_utang');

  const opsiFaktur = daftarUtang.map(b => `
    <option value="${b.id}">${esc(b.no_faktur)} — ${esc(b.supplier.nama)}
      (sisa ${formatRupiah(b.sisa_utang)})</option>`).join('');

  konten.innerHTML = `
    <div class="kartu">
      <h2>Input Pembayaran Utang</h2>
      ${daftarUtang.length === 0
        ? '<div class="info hijau">Semua utang sudah lunas. Tidak ada yang perlu dibayar.</div>'
        : `
      <form id="formBayar">
        <div class="form-grid">
          <label class="lebar-penuh">Faktur Pembelian
            <select name="pembelian_id" required>
              <option value="">-- pilih faktur --</option>${opsiFaktur}
            </select>
          </label>
          <label>Tanggal Bayar
            <input type="date" name="tanggal" required value="${hariIni()}">
          </label>
          <label>Jumlah Bayar (Rp)
            <input type="number" name="jumlah" min="1" step="any" required>
          </label>
          <label class="lebar-penuh">Keterangan
            <input name="keterangan" placeholder="opsional, contoh: transfer termin 2">
          </label>
        </div>
        <div class="info" id="infoFaktur">Pilih faktur untuk melihat sisa utangnya.</div>
        <div class="form-aksi">
          <button type="button" class="tombol" id="tombolLunasi">Isi = Sisa Utang (Lunasi)</button>
          <button type="submit" class="tombol utama">Simpan Pembayaran</button>
        </div>
        <p class="catatan">Jurnal otomatis: Utang Usaha (D) / Kas (K)</p>
      </form>`}
    </div>

    <div class="kartu">
      <div class="kartu-kepala">
        <h2>Utang Belum Lunas</h2>
        <strong>Total: ${formatRupiah(totalUtang)}</strong>
      </div>
      <div class="tabel-wadah">
        <table>
          <thead>
            <tr><th>Tgl Faktur</th><th>No. Faktur</th><th>Supplier</th>
              <th class="kanan">Total Faktur</th><th class="kanan">Sudah Dibayar</th>
              <th class="kanan">Sisa Utang</th><th></th></tr>
          </thead>
          <tbody id="isiUtang">
            ${daftarUtang.map(b => `
              <tr>
                <td class="nowrap">${formatTanggal(b.tanggal)}</td>
                <td class="nowrap">${esc(b.no_faktur)}</td>
                <td>${esc(b.supplier.nama)}</td>
                <td class="kanan">${formatRupiah(b.total)}</td>
                <td class="kanan">${formatRupiah(b.total - b.sisa_utang)}</td>
                <td class="kanan"><strong>${formatRupiah(b.sisa_utang)}</strong></td>
                <td><button class="tombol kecil tombol-bayar" data-id="${b.id}">Bayar</button></td>
              </tr>`).join('') || barisKosong(7, 'Tidak ada utang.')}
          </tbody>
        </table>
      </div>
    </div>

    <div class="kartu">
      <h2>Riwayat Pembayaran</h2>
      <div class="tabel-wadah">
        <table>
          <thead>
            <tr><th>Tanggal</th><th>No. Bukti</th><th>No. Faktur</th><th>Supplier</th>
              <th>Keterangan</th><th class="kanan">Jumlah</th></tr>
          </thead>
          <tbody>
            ${riwayat.map(r => `
              <tr>
                <td class="nowrap">${formatTanggal(r.tanggal)}</td>
                <td class="nowrap">${esc(r.no_bukti)}</td>
                <td class="nowrap">${esc(r.pembelian.no_faktur)}</td>
                <td>${esc(r.pembelian.supplier.nama)}</td>
                <td>${esc(r.keterangan) || '-'}</td>
                <td class="kanan">${formatRupiah(r.jumlah_bayar)}</td>
              </tr>`).join('') || barisKosong(6, 'Belum ada pembayaran.')}
          </tbody>
        </table>
      </div>
    </div>`;

  const form = konten.querySelector('#formBayar');
  if (!form) return;   // tidak ada utang -> tidak ada form

  // Faktur yang sedang dipilih
  function fakturTerpilih() {
    return daftarUtang.find(b => b.id == form.pembelian_id.value);
  }

  function tampilkanInfoFaktur() {
    const b = fakturTerpilih();
    konten.querySelector('#infoFaktur').innerHTML = b
      ? `Faktur <strong>${esc(b.no_faktur)}</strong> tanggal ${formatTanggal(b.tanggal)} —
         total ${formatRupiah(b.total)}, sisa utang <strong>${formatRupiah(b.sisa_utang)}</strong>.
         Tanggal bayar tidak boleh sebelum tanggal faktur.`
      : 'Pilih faktur untuk melihat sisa utangnya.';
  }

  form.pembelian_id.addEventListener('change', tampilkanInfoFaktur);

  // Tombol "Lunasi" mengisi jumlah dengan seluruh sisa utang
  konten.querySelector('#tombolLunasi').addEventListener('click', () => {
    const b = fakturTerpilih();
    if (!b) return tampilkanPesan('Pilih faktur terlebih dahulu.', 'peringatan');
    form.jumlah.value = b.sisa_utang;
  });

  // Tombol "Bayar" di tabel utang -> pilih faktur itu di form
  konten.querySelector('#isiUtang').addEventListener('click', e => {
    if (!e.target.classList.contains('tombol-bayar')) return;
    form.pembelian_id.value = e.target.dataset.id;
    tampilkanInfoFaktur();
    form.scrollIntoView({ behavior: 'smooth' });
    form.jumlah.focus();
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const isian = Object.fromEntries(new FormData(form));
    const b = fakturTerpilih();

    // Cek di sisi browser dulu (database juga akan mengecek ulang)
    if (Number(isian.jumlah) > Number(b.sisa_utang)) {
      tampilkanPesan(`Jumlah bayar melebihi sisa utang (${formatRupiah(b.sisa_utang)}).`, 'error');
      return;
    }

    const tombol = form.querySelector('button[type=submit]');
    setLoading(tombol, true);
    try {
      const hasil = await jalankan(db.rpc('simpan_pembayaran_utang', {
        p_pembelian_id: Number(isian.pembelian_id),
        p_tanggal: isian.tanggal,
        p_jumlah: Number(isian.jumlah),
        p_keterangan: isian.keterangan.trim() || null
      }));
      tampilkanPesan(`Pembayaran ${hasil.no_bukti} sebesar ${formatRupiah(hasil.jumlah)} tersimpan.`);
      await halamanPembayaranUtang(konten);
    } catch (err) {
      tampilkanPesan(pesanError(err), 'error');
      setLoading(tombol, false);
    }
  });
}
