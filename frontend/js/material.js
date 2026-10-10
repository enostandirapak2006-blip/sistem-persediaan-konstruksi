// =====================================================================
// material.js — Halaman Data Material
// Tambah & ubah data material. Stok, harga rata-rata, dan nilai stok
// TIDAK diisi di sini — semuanya berubah otomatis lewat transaksi.
// =====================================================================

async function halamanMaterial(konten) {
  let daftarMaterial = [];   // data dari database
  let idEdit = null;         // null = mode tambah, angka = mode ubah

  konten.innerHTML = `
    <div class="kartu">
      <h2 id="judulForm">Tambah Material</h2>
      <form id="formMaterial">
        <div class="form-grid">
          <label>Kode Material
            <input name="kode" required maxlength="20" placeholder="contoh: MAT-011">
          </label>
          <label>Nama Material
            <input name="nama" required maxlength="100" placeholder="contoh: Semen Putih 40 kg">
          </label>
          <label>Kategori
            <input name="kategori" required maxlength="50" list="daftarKategori" placeholder="contoh: Semen">
          </label>
          <label>Satuan
            <input name="satuan" required maxlength="20" placeholder="sak, batang, m3, kg">
          </label>
          <label>Stok Minimum
            <input name="stok_minimum" type="number" min="0" step="any" value="0" required>
          </label>
        </div>
        <datalist id="daftarKategori"></datalist>
        <div class="form-aksi">
          <button type="submit" class="tombol utama">Simpan</button>
          <button type="button" class="tombol" id="tombolBatal" hidden>Batal Ubah</button>
        </div>
        <p class="catatan">Stok awal material baru = 0. Stok bertambah lewat menu Pembelian.</p>
      </form>
    </div>

    <div class="kartu">
      <div class="kartu-kepala">
        <h2>Daftar Material</h2>
        <input type="search" id="cari" placeholder="Cari kode / nama / kategori..." style="max-width:280px">
      </div>
      <div class="tabel-wadah">
        <table>
          <thead>
            <tr>
              <th>Kode</th><th>Nama</th><th>Kategori</th><th>Satuan</th>
              <th class="kanan">Stok</th><th class="kanan">Stok Min.</th>
              <th class="kanan">Harga Rata-rata</th><th class="kanan">Nilai Stok</th>
              <th>Status</th><th></th>
            </tr>
          </thead>
          <tbody id="isiTabel"></tbody>
        </table>
      </div>
    </div>`;

  const form = konten.querySelector('#formMaterial');
  const isiTabel = konten.querySelector('#isiTabel');
  const inputCari = konten.querySelector('#cari');
  const tombolBatal = konten.querySelector('#tombolBatal');

  // ---------- Ambil data & gambar tabel ----------
  async function muatData() {
    daftarMaterial = await jalankan(db.from('material').select('*').order('kode'));

    // Isi saran kategori (datalist) dari kategori yang sudah ada
    const kategoriUnik = [...new Set(daftarMaterial.map(m => m.kategori))];
    konten.querySelector('#daftarKategori').innerHTML =
      kategoriUnik.map(k => `<option value="${esc(k)}">`).join('');

    gambarTabel();
  }

  function gambarTabel() {
    const kataCari = inputCari.value.toLowerCase();
    const hasil = daftarMaterial.filter(m =>
      (m.kode + ' ' + m.nama + ' ' + m.kategori).toLowerCase().includes(kataCari));

    isiTabel.innerHTML = hasil.map(m => `
      <tr>
        <td>${esc(m.kode)}</td>
        <td>${esc(m.nama)}</td>
        <td>${esc(m.kategori)}</td>
        <td>${esc(m.satuan)}</td>
        <td class="kanan">${formatAngka(m.stok)}</td>
        <td class="kanan">${formatAngka(m.stok_minimum)}</td>
        <td class="kanan">${formatRupiah(m.harga_rata_rata)}</td>
        <td class="kanan">${formatRupiah(m.nilai_stok)}</td>
        <td>${badgeStatusStok(m)}</td>
        <td><button class="tombol kecil tombol-ubah" data-id="${m.id}">Ubah</button></td>
      </tr>`).join('') || barisKosong(10);
  }

  // ---------- Mode tambah / ubah ----------
  function aturModeTambah() {
    idEdit = null;
    form.reset();
    konten.querySelector('#judulForm').textContent = 'Tambah Material';
    tombolBatal.hidden = true;
  }

  isiTabel.addEventListener('click', e => {
    if (!e.target.classList.contains('tombol-ubah')) return;
    const m = daftarMaterial.find(x => x.id == e.target.dataset.id);
    idEdit = m.id;
    form.kode.value = m.kode;
    form.nama.value = m.nama;
    form.kategori.value = m.kategori;
    form.satuan.value = m.satuan;
    form.stok_minimum.value = m.stok_minimum;
    konten.querySelector('#judulForm').textContent = 'Ubah Material: ' + m.nama;
    tombolBatal.hidden = false;
    form.scrollIntoView({ behavior: 'smooth' });
  });

  tombolBatal.addEventListener('click', aturModeTambah);
  inputCari.addEventListener('input', gambarTabel);

  // ---------- Simpan ----------
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const isian = Object.fromEntries(new FormData(form));
    const data = {
      kode: isian.kode.trim(),
      nama: isian.nama.trim(),
      kategori: isian.kategori.trim(),
      satuan: isian.satuan.trim(),
      stok_minimum: Number(isian.stok_minimum)
    };

    const tombol = form.querySelector('button[type=submit]');
    setLoading(tombol, true);
    try {
      if (idEdit) {
        await jalankan(db.from('material').update(data).eq('id', idEdit));
        tampilkanPesan('Material berhasil diubah.');
      } else {
        await jalankan(db.from('material').insert(data));
        tampilkanPesan('Material berhasil ditambahkan.');
      }
      aturModeTambah();
      await muatData();
    } catch (err) {
      tampilkanPesan(pesanError(err), 'error');
    }
    setLoading(tombol, false);
  });

  await muatData();
}
