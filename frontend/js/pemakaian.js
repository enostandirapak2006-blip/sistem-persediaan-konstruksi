// =====================================================================
// pemakaian.js — Halaman Pemakaian Material ke Proyek
//
// Disimpan lewat db.rpc('simpan_pemakaian', ...). Database:
//   * menolak jika jumlah melebihi stok,
//   * mengisi harga pokok = harga rata-rata saat itu,
//   * mengurangi stok & mengisi kartu stok,
//   * membuat SATU jurnal: Biaya Material Proyek (D) / Persediaan (K)
// =====================================================================

async function halamanPemakaian(konten) {
  const [daftarProyek, daftarMaterial] = await Promise.all([
    // Hanya proyek yang masih berjalan yang boleh menerima material
    jalankan(db.from('proyek').select('id, nama, tanggal_mulai')
      .eq('status', 'berjalan').order('nama')),
    // Hanya material yang ada stoknya
    jalankan(db.from('material').select('id, kode, nama, satuan, stok, harga_rata_rata')
      .gt('stok', 0).order('kode'))
  ]);

  const opsiProyek = daftarProyek
    .map(p => `<option value="${p.id}">${esc(p.nama)}</option>`).join('');
  const opsiMaterial = daftarMaterial
    .map(m => `<option value="${m.id}">${esc(m.kode)} — ${esc(m.nama)} (stok ${formatAngka(m.stok)} ${esc(m.satuan)})</option>`)
    .join('');

  konten.innerHTML = `
    <div class="kartu">
      <h2>Input Pemakaian Material</h2>
      <form id="formPemakaian">
        <div class="form-grid">
          <label>Proyek
            <select name="proyek_id" required>
              <option value="">-- pilih proyek berjalan --</option>${opsiProyek}
            </select>
          </label>
          <label>Tanggal
            <input type="date" name="tanggal" required value="${hariIni()}">
          </label>
          <label>No. Bukti
            <input name="no_bukti" maxlength="50" placeholder="kosongkan = otomatis">
          </label>
          <label class="lebar-penuh">Keterangan
            <input name="keterangan" placeholder="contoh: pengecoran plat lantai 3">
          </label>
        </div>

        <h3>Material yang Dipakai</h3>
        <div class="tabel-wadah">
          <table class="tabel-input">
            <thead>
              <tr><th>Material</th><th>Jumlah</th><th class="kanan">Stok Tersedia</th>
                <th class="kanan">Harga Rata-rata</th><th class="kanan">Perkiraan Nilai</th><th></th></tr>
            </thead>
            <tbody id="barisDetail"></tbody>
            <tfoot>
              <tr><td colspan="4" class="kanan">PERKIRAAN TOTAL</td>
                <td class="kanan" id="totalPemakaian">Rp 0</td><td></td></tr>
            </tfoot>
          </table>
        </div>

        <div class="form-aksi">
          <button type="button" class="tombol" id="tombolTambahBaris">+ Tambah Baris</button>
          <button type="submit" class="tombol utama">Simpan Pemakaian</button>
          <span class="pintasan"><kbd>Enter</kbd> baris berikutnya · <kbd>Ctrl</kbd>+<kbd>Enter</kbd> simpan</span>
        </div>
        <p class="catatan">Nilai dihitung dengan harga rata-rata (moving average) saat pemakaian.
          Jurnal otomatis: Biaya Material Proyek (D) / Persediaan Material (K).</p>
      </form>
    </div>

    <div class="kartu">
      <h2>Riwayat Pemakaian</h2>
      <div class="tabel-wadah">
        <table>
          <thead>
            <tr><th>Tanggal</th><th>No. Bukti</th><th>Proyek</th><th>Keterangan</th>
              <th class="kanan">Total Nilai</th><th></th></tr>
          </thead>
          <tbody id="isiRiwayat"><tr><td colspan="6" class="kosong">Memuat...</td></tr></tbody>
        </table>
      </div>
    </div>`;

  const form = konten.querySelector('#formPemakaian');
  const tbodyDetail = konten.querySelector('#barisDetail');
  const isiRiwayat = konten.querySelector('#isiRiwayat');

  // ---------- Baris detail ----------
  function tambahBaris() {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><select class="pilih-material" required>
        <option value="">-- pilih material --</option>${opsiMaterial}</select></td>
      <td><input type="number" class="input-jumlah" min="0.01" step="any" required></td>
      <td class="kanan stok">-</td>
      <td class="kanan harga">-</td>
      <td class="kanan subtotal">Rp 0</td>
      <td><button type="button" class="tombol-hapus" title="Hapus baris">✕</button></td>`;
    tbodyDetail.appendChild(tr);
  }

  // Perbarui info stok, harga, dan perkiraan nilai di semua baris.
  // Baris yang jumlahnya melebihi stok diberi warna merah.
  function perbaruiBaris() {
    let total = 0;
    const totalPerMaterial = {};   // untuk cek jika material sama dipilih di 2 baris

    tbodyDetail.querySelectorAll('tr').forEach(tr => {
      const m = daftarMaterial.find(x => x.id == tr.querySelector('.pilih-material').value);
      const inputJumlah = tr.querySelector('.input-jumlah');
      const jumlah = Number(inputJumlah.value) || 0;

      if (!m) {
        tr.querySelector('.stok').textContent = '-';
        tr.querySelector('.harga').textContent = '-';
        tr.querySelector('.subtotal').textContent = 'Rp 0';
        inputJumlah.classList.remove('salah');
        return;
      }

      totalPerMaterial[m.id] = (totalPerMaterial[m.id] || 0) + jumlah;
      const subtotal = jumlah * Number(m.harga_rata_rata);
      total += subtotal;

      tr.querySelector('.stok').textContent = `${formatAngka(m.stok)} ${m.satuan}`;
      tr.querySelector('.harga').textContent = formatRupiah(m.harga_rata_rata);
      tr.querySelector('.subtotal').textContent = formatRupiah(subtotal);
      inputJumlah.classList.toggle('salah', totalPerMaterial[m.id] > Number(m.stok));
    });

    konten.querySelector('#totalPemakaian').textContent = formatRupiah(total);
    return totalPerMaterial;
  }

  tbodyDetail.addEventListener('input', perbaruiBaris);
  tbodyDetail.addEventListener('change', perbaruiBaris);
  tbodyDetail.addEventListener('click', e => {
    if (!e.target.classList.contains('tombol-hapus')) return;
    if (tbodyDetail.children.length === 1) {
      tampilkanPesan('Minimal harus ada satu baris material.', 'peringatan');
      return;
    }
    e.target.closest('tr').remove();
    perbaruiBaris();
  });
  konten.querySelector('#tombolTambahBaris').addEventListener('click', tambahBaris);
  tambahBaris();
  aktifkanKeyboardTransaksi(form, tbodyDetail, tambahBaris);

  // ---------- Simpan ----------
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const isian = Object.fromEntries(new FormData(form));

    // Cek stok di browser dulu supaya pengguna langsung tahu
    const totalPerMaterial = perbaruiBaris();
    for (const id in totalPerMaterial) {
      const m = daftarMaterial.find(x => x.id == id);
      if (totalPerMaterial[id] > Number(m.stok)) {
        tampilkanPesan(`Stok ${m.nama} tidak cukup. Tersedia ${formatAngka(m.stok)} ${m.satuan}.`, 'error');
        return;
      }
    }

    const items = [...tbodyDetail.querySelectorAll('tr')].map(tr => ({
      material_id: Number(tr.querySelector('.pilih-material').value),
      jumlah: Number(tr.querySelector('.input-jumlah').value)
    }));

    const tombol = form.querySelector('button[type=submit]');
    setLoading(tombol, true);
    try {
      const hasil = await jalankan(db.rpc('simpan_pemakaian', {
        p_proyek_id: Number(isian.proyek_id),
        p_tanggal: isian.tanggal,
        p_no_bukti: isian.no_bukti.trim() || null,
        p_keterangan: isian.keterangan.trim() || null,
        p_items: items
      }));
      tampilkanPesan(`Pemakaian ${hasil.no_bukti} tersimpan. Nilai ${formatRupiah(hasil.total)}.`);
      await halamanPemakaian(konten);
    } catch (err) {
      tampilkanPesan(pesanError(err), 'error');
      setLoading(tombol, false);
    }
  });

  // ---------- Riwayat ----------
  async function muatRiwayat() {
    try {
      const data = await jalankan(db.from('pemakaian')
        .select('id, tanggal, no_bukti, keterangan, total, proyek(nama)')
        .order('tanggal', { ascending: false })
        .order('id', { ascending: false }));

      isiRiwayat.innerHTML = data.map(p => `
        <tr>
          <td class="nowrap">${formatTanggal(p.tanggal)}</td>
          <td class="nowrap">${esc(p.no_bukti)}</td>
          <td>${esc(p.proyek.nama)}</td>
          <td>${esc(p.keterangan) || '-'}</td>
          <td class="kanan">${formatRupiah(p.total)}</td>
          <td><button class="tombol kecil tombol-detail" data-id="${p.id}">Detail</button></td>
        </tr>`).join('') || barisKosong(6, 'Belum ada pemakaian.');
    } catch (err) {
      isiRiwayat.innerHTML = barisKosong(6, pesanError(err));
    }
  }

  isiRiwayat.addEventListener('click', e => {
    if (!e.target.classList.contains('tombol-detail')) return;
    const id = e.target.dataset.id;
    toggleBarisDetail(e.target, 6, async () => {
      const detail = await jalankan(db.from('pemakaian_detail')
        .select('jumlah, harga_pokok, subtotal, material(kode, nama, satuan)')
        .eq('pemakaian_id', id).order('id'));
      return `
        <table>
          <thead><tr><th>Material</th><th class="kanan">Jumlah</th>
            <th class="kanan">Harga Pokok</th><th class="kanan">Subtotal</th></tr></thead>
          <tbody>${detail.map(d => `
            <tr>
              <td>${esc(d.material.kode)} — ${esc(d.material.nama)}</td>
              <td class="kanan">${formatAngka(d.jumlah)} ${esc(d.material.satuan)}</td>
              <td class="kanan">${formatRupiah(d.harga_pokok)}</td>
              <td class="kanan">${formatRupiah(d.subtotal)}</td>
            </tr>`).join('')}
          </tbody>
        </table>`;
    });
  });

  muatRiwayat();
}
