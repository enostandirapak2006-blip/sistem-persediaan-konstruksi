// =====================================================================
// pembelian.js — Halaman Pembelian Material (tunai / kredit)
//
// Data disimpan dengan SATU panggilan: db.rpc('simpan_pembelian', ...)
// Database lalu otomatis: menambah stok, menghitung ulang harga
// rata-rata, mengisi kartu stok, dan membuat SATU jurnal:
//   Tunai : Persediaan Material (D) / Kas (K)
//   Kredit: Persediaan Material (D) / Utang Usaha (K)
// =====================================================================

async function halamanPembelian(konten) {
  const [daftarSupplier, daftarMaterial] = await Promise.all([
    jalankan(db.from('supplier').select('id, nama').order('nama')),
    jalankan(db.from('material').select('id, kode, nama, satuan, harga_rata_rata').order('kode'))
  ]);

  // Pilihan dropdown dibuat sekali, dipakai berulang di tiap baris
  const opsiSupplier = daftarSupplier
    .map(s => `<option value="${s.id}">${esc(s.nama)}</option>`).join('');
  const opsiMaterial = daftarMaterial
    .map(m => `<option value="${m.id}">${esc(m.kode)} — ${esc(m.nama)} (${esc(m.satuan)})</option>`).join('');

  konten.innerHTML = `
    <div class="kartu">
      <h2>Input Pembelian</h2>
      <form id="formPembelian">
        <div class="form-grid">
          <label>Supplier
            <select name="supplier_id" required>
              <option value="">-- pilih supplier --</option>${opsiSupplier}
            </select>
          </label>
          <label>Tanggal
            <input type="date" name="tanggal" required value="${hariIni()}">
          </label>
          <label>No. Faktur Supplier
            <input name="no_faktur" required maxlength="50" placeholder="contoh: INV-0012">
          </label>
          <label>Cara Bayar
            <select name="cara_bayar">
              <option value="tunai">Tunai</option>
              <option value="kredit">Kredit (utang)</option>
            </select>
          </label>
          <label class="lebar-penuh">Keterangan
            <input name="keterangan" placeholder="opsional">
          </label>
        </div>

        <h3>Daftar Material yang Dibeli</h3>
        <div class="tabel-wadah">
          <table class="tabel-input">
            <thead>
              <tr><th>Material</th><th>Jumlah</th><th>Harga Satuan (Rp)</th>
                <th class="kanan">Subtotal</th><th></th></tr>
            </thead>
            <tbody id="barisDetail"></tbody>
            <tfoot>
              <tr><td colspan="3" class="kanan">TOTAL</td>
                <td class="kanan" id="totalPembelian">Rp 0</td><td></td></tr>
            </tfoot>
          </table>
        </div>

        <div class="form-aksi">
          <button type="button" class="tombol" id="tombolTambahBaris">+ Tambah Baris</button>
          <button type="submit" class="tombol utama">Simpan Pembelian</button>
          <span class="pintasan"><kbd>Enter</kbd> baris berikutnya · <kbd>Ctrl</kbd>+<kbd>Enter</kbd> simpan</span>
        </div>
        <div class="info" id="infoJurnal"></div>
      </form>
    </div>

    <div class="kartu">
      <h2>Riwayat Pembelian</h2>
      <div class="tabel-wadah">
        <table>
          <thead>
            <tr><th>Tanggal</th><th>No. Faktur</th><th>Supplier</th><th>Cara Bayar</th>
              <th class="kanan">Total</th><th class="kanan">Sisa Utang</th><th>Status</th><th></th></tr>
          </thead>
          <tbody id="isiRiwayat"><tr><td colspan="8" class="kosong">Memuat...</td></tr></tbody>
        </table>
      </div>
    </div>`;

  const form = konten.querySelector('#formPembelian');
  const tbodyDetail = konten.querySelector('#barisDetail');
  const elTotal = konten.querySelector('#totalPembelian');
  const isiRiwayat = konten.querySelector('#isiRiwayat');

  // ---------- Baris detail (bisa ditambah / dihapus) ----------
  function tambahBaris() {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><select class="pilih-material" required>
        <option value="">-- pilih material --</option>${opsiMaterial}</select></td>
      <td><input type="number" class="input-jumlah" min="0.01" step="any" required></td>
      <td><input type="number" class="input-harga" min="1" step="any" required></td>
      <td class="kanan subtotal">Rp 0</td>
      <td><button type="button" class="tombol-hapus" title="Hapus baris">✕</button></td>`;
    tbodyDetail.appendChild(tr);
  }

  // Hitung subtotal tiap baris dan total keseluruhan
  function hitungTotal() {
    let total = 0;
    tbodyDetail.querySelectorAll('tr').forEach(tr => {
      const jumlah = Number(tr.querySelector('.input-jumlah').value) || 0;
      const harga = Number(tr.querySelector('.input-harga').value) || 0;
      const subtotal = jumlah * harga;
      tr.querySelector('.subtotal').textContent = formatRupiah(subtotal);
      total += subtotal;
    });
    elTotal.textContent = formatRupiah(total);
  }

  // Tampilkan jurnal yang akan dibuat sesuai cara bayar
  function tampilkanInfoJurnal() {
    const akunKredit = form.cara_bayar.value === 'tunai' ? 'Kas' : 'Utang Usaha';
    konten.querySelector('#infoJurnal').innerHTML =
      `<strong>Jurnal otomatis:</strong> Persediaan Material (D) / ${akunKredit} (K)`;
  }

  // Satu "pendengar" untuk semua baris (event delegation)
  tbodyDetail.addEventListener('input', hitungTotal);

  tbodyDetail.addEventListener('change', e => {
    // Saat material dipilih, sarankan harga = harga rata-rata terakhir
    if (!e.target.classList.contains('pilih-material')) return;
    const m = daftarMaterial.find(x => x.id == e.target.value);
    const inputHarga = e.target.closest('tr').querySelector('.input-harga');
    if (m && !inputHarga.value && Number(m.harga_rata_rata) > 0) {
      inputHarga.value = Math.round(m.harga_rata_rata);
      hitungTotal();
    }
  });

  tbodyDetail.addEventListener('click', e => {
    if (!e.target.classList.contains('tombol-hapus')) return;
    if (tbodyDetail.children.length === 1) {
      tampilkanPesan('Minimal harus ada satu baris material.', 'peringatan');
      return;
    }
    e.target.closest('tr').remove();
    hitungTotal();
  });

  konten.querySelector('#tombolTambahBaris').addEventListener('click', tambahBaris);
  form.cara_bayar.addEventListener('change', tampilkanInfoJurnal);

  tambahBaris();
  tampilkanInfoJurnal();
  aktifkanKeyboardTransaksi(form, tbodyDetail, tambahBaris);

  // ---------- Simpan ----------
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const isian = Object.fromEntries(new FormData(form));

    // Kumpulkan baris detail menjadi array untuk dikirim ke database
    const items = [...tbodyDetail.querySelectorAll('tr')].map(tr => ({
      material_id: Number(tr.querySelector('.pilih-material').value),
      jumlah: Number(tr.querySelector('.input-jumlah').value),
      harga_satuan: Number(tr.querySelector('.input-harga').value)
    }));

    const tombol = form.querySelector('button[type=submit]');
    setLoading(tombol, true);
    try {
      const hasil = await jalankan(db.rpc('simpan_pembelian', {
        p_supplier_id: Number(isian.supplier_id),
        p_tanggal: isian.tanggal,
        p_no_faktur: isian.no_faktur,
        p_cara_bayar: isian.cara_bayar,
        p_keterangan: isian.keterangan.trim() || null,
        p_items: items
      }));
      tampilkanPesan(`Pembelian ${hasil.no_bukti} tersimpan. Total ${formatRupiah(hasil.total)}.`);
      await halamanPembelian(konten);   // gambar ulang halaman (form kosong lagi)
    } catch (err) {
      tampilkanPesan(pesanError(err), 'error');
      setLoading(tombol, false);
    }
  });

  // ---------- Riwayat ----------
  async function muatRiwayat() {
    try {
      const data = await jalankan(db.from('pembelian')
        .select('id, tanggal, no_faktur, cara_bayar, total, sisa_utang, supplier(nama)')
        .order('tanggal', { ascending: false })
        .order('id', { ascending: false }));

      isiRiwayat.innerHTML = data.map(b => {
        let status = badge('Lunas', 'hijau');
        if (Number(b.sisa_utang) > 0) status = badge('Belum Lunas', 'merah');
        return `
          <tr>
            <td class="nowrap">${formatTanggal(b.tanggal)}</td>
            <td class="nowrap">${esc(b.no_faktur)}</td>
            <td>${esc(b.supplier.nama)}</td>
            <td>${b.cara_bayar === 'tunai' ? badge('Tunai', 'hijau') : badge('Kredit', 'kuning')}</td>
            <td class="kanan">${formatRupiah(b.total)}</td>
            <td class="kanan">${formatRupiah(b.sisa_utang)}</td>
            <td>${status}</td>
            <td><button class="tombol kecil tombol-detail" data-id="${b.id}">Detail</button></td>
          </tr>`;
      }).join('') || barisKosong(8, 'Belum ada pembelian.');
    } catch (err) {
      isiRiwayat.innerHTML = barisKosong(8, pesanError(err));
    }
  }

  // Tombol "Detail" -> tampilkan material yang dibeli dalam faktur itu
  isiRiwayat.addEventListener('click', e => {
    if (!e.target.classList.contains('tombol-detail')) return;
    const id = e.target.dataset.id;
    toggleBarisDetail(e.target, 8, async () => {
      const detail = await jalankan(db.from('pembelian_detail')
        .select('jumlah, harga_satuan, subtotal, material(kode, nama, satuan)')
        .eq('pembelian_id', id).order('id'));
      return `
        <table>
          <thead><tr><th>Material</th><th class="kanan">Jumlah</th>
            <th class="kanan">Harga Satuan</th><th class="kanan">Subtotal</th></tr></thead>
          <tbody>${detail.map(d => `
            <tr>
              <td>${esc(d.material.kode)} — ${esc(d.material.nama)}</td>
              <td class="kanan">${formatAngka(d.jumlah)} ${esc(d.material.satuan)}</td>
              <td class="kanan">${formatRupiah(d.harga_satuan)}</td>
              <td class="kanan">${formatRupiah(d.subtotal)}</td>
            </tr>`).join('')}
          </tbody>
        </table>`;
    });
  });

  muatRiwayat();
}
