// =====================================================================
// stok-opname.js — Halaman Stok Opname
//
// Pengguna memasukkan hasil hitung fisik gudang. Database lalu:
//   * menghitung selisih (fisik - sistem) dan nilainya,
//   * mengubah stok sistem menjadi sama dengan stok fisik,
//   * membuat jurnal:
//       fisik < sistem: Beban Selisih Persediaan (D) / Persediaan (K)
//       fisik > sistem: Persediaan Material (D) / Pendapatan Lain-lain (K)
// =====================================================================

async function halamanStokOpname(konten) {
  const [daftarMaterial, riwayat] = await Promise.all([
    jalankan(db.from('material').select('id, kode, nama, satuan, stok, harga_rata_rata, nilai_stok').order('kode')),
    jalankan(db.from('stok_opname')
      .select('tanggal, no_bukti, stok_sistem, stok_fisik, selisih, nilai_selisih, keterangan, material(nama, satuan)')
      .order('tanggal', { ascending: false })
      .order('id', { ascending: false }))
  ]);

  const opsiMaterial = daftarMaterial
    .map(m => `<option value="${m.id}">${esc(m.kode)} — ${esc(m.nama)}</option>`).join('');

  konten.innerHTML = `
    <div class="kartu">
      <h2>Input Stok Opname</h2>
      <form id="formOpname">
        <div class="form-grid">
          <label>Material
            <select name="material_id" required>
              <option value="">-- pilih material --</option>${opsiMaterial}
            </select>
          </label>
          <label>Tanggal Opname
            <input type="date" name="tanggal" required value="${hariIni()}">
          </label>
          <label>Stok Fisik (hasil hitung)
            <input type="number" name="stok_fisik" min="0" step="any" required>
          </label>
          <label class="lebar-penuh">Keterangan
            <input name="keterangan" placeholder="contoh: 2 sak semen mengeras">
          </label>
        </div>
        <div class="info" id="pratinjau">Pilih material dan isi stok fisik untuk melihat selisihnya.</div>
        <div class="form-aksi">
          <button type="submit" class="tombol utama">Simpan Stok Opname</button>
        </div>
      </form>
    </div>

    <div class="kartu">
      <h2>Riwayat Stok Opname</h2>
      <div class="tabel-wadah">
        <table>
          <thead>
            <tr><th>Tanggal</th><th>No. Bukti</th><th>Material</th>
              <th class="kanan">Stok Sistem</th><th class="kanan">Stok Fisik</th>
              <th class="kanan">Selisih</th><th class="kanan">Nilai Selisih</th><th>Keterangan</th></tr>
          </thead>
          <tbody>
            ${riwayat.map(r => `
              <tr>
                <td class="nowrap">${formatTanggal(r.tanggal)}</td>
                <td class="nowrap">${esc(r.no_bukti)}</td>
                <td>${esc(r.material.nama)}</td>
                <td class="kanan">${formatAngka(r.stok_sistem)} ${esc(r.material.satuan)}</td>
                <td class="kanan">${formatAngka(r.stok_fisik)} ${esc(r.material.satuan)}</td>
                <td class="kanan ${r.selisih < 0 ? 'teks-merah' : r.selisih > 0 ? 'teks-hijau' : ''}">
                  ${r.selisih > 0 ? '+' : ''}${formatAngka(r.selisih)}</td>
                <td class="kanan">${formatRupiah(r.nilai_selisih)}</td>
                <td>${esc(r.keterangan) || '-'}</td>
              </tr>`).join('') || barisKosong(8, 'Belum ada stok opname.')}
          </tbody>
        </table>
      </div>
    </div>`;

  const form = konten.querySelector('#formOpname');
  const pratinjau = konten.querySelector('#pratinjau');

  // Pratinjau selisih & jurnal sebelum disimpan.
  // (Angka final tetap dihitung oleh database saat disimpan.)
  function tampilkanPratinjau() {
    const m = daftarMaterial.find(x => x.id == form.material_id.value);
    if (!m || form.stok_fisik.value === '') {
      pratinjau.className = 'info';
      pratinjau.innerHTML = m
        ? `Stok sistem <strong>${esc(m.nama)}</strong>: ${formatAngka(m.stok)} ${esc(m.satuan)}
           (nilai ${formatRupiah(m.nilai_stok)}). Isi stok fisik untuk melihat selisihnya.`
        : 'Pilih material dan isi stok fisik untuk melihat selisihnya.';
      return;
    }

    const fisik = Number(form.stok_fisik.value);
    const selisih = fisik - Number(m.stok);
    // Jika fisik 0, seluruh nilai stok dihapus; selain itu selisih x harga rata-rata
    const nilai = fisik === 0 ? -Number(m.nilai_stok) : selisih * Number(m.harga_rata_rata);

    let jurnal = 'Tidak ada selisih, tidak ada jurnal.';
    pratinjau.className = 'info hijau';
    if (selisih < 0) {
      jurnal = `Beban Selisih Persediaan (D) / Persediaan Material (K) ${formatRupiah(Math.abs(nilai))}`;
      pratinjau.className = 'info merah';
    } else if (selisih > 0) {
      jurnal = `Persediaan Material (D) / Pendapatan Lain-lain (K) ${formatRupiah(nilai)}`;
      pratinjau.className = 'info kuning';
    }

    pratinjau.innerHTML = `
      Stok sistem: <strong>${formatAngka(m.stok)} ${esc(m.satuan)}</strong> &nbsp;|&nbsp;
      Stok fisik: <strong>${formatAngka(fisik)} ${esc(m.satuan)}</strong> &nbsp;|&nbsp;
      Selisih: <strong>${selisih > 0 ? '+' : ''}${formatAngka(selisih)} ${esc(m.satuan)}</strong>
      (${formatRupiah(nilai)})<br>
      <strong>Jurnal:</strong> ${jurnal}`;
  }

  form.material_id.addEventListener('change', tampilkanPratinjau);
  form.stok_fisik.addEventListener('input', tampilkanPratinjau);

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const isian = Object.fromEntries(new FormData(form));

    const tombol = form.querySelector('button[type=submit]');
    setLoading(tombol, true);
    try {
      const hasil = await jalankan(db.rpc('simpan_stok_opname', {
        p_material_id: Number(isian.material_id),
        p_tanggal: isian.tanggal,
        p_stok_fisik: Number(isian.stok_fisik),
        p_keterangan: isian.keterangan.trim() || null
      }));
      const teksSelisih = Number(hasil.selisih) === 0
        ? 'tanpa selisih'
        : `selisih ${formatAngka(hasil.selisih)} (${formatRupiah(hasil.nilai_selisih)})`;
      tampilkanPesan(`Stok opname ${hasil.no_bukti} tersimpan, ${teksSelisih}.`);
      await halamanStokOpname(konten);
    } catch (err) {
      tampilkanPesan(pesanError(err), 'error');
      setLoading(tombol, false);
    }
  });
}
