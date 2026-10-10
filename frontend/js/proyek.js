// =====================================================================
// proyek.js — Halaman Data Proyek (tambah & ubah, termasuk status)
// Proyek berstatus "selesai" tidak bisa lagi menerima pemakaian material.
// =====================================================================

async function halamanProyek(konten) {
  let daftarProyek = [];
  let idEdit = null;

  konten.innerHTML = `
    <div class="kartu">
      <h2 id="judulForm">Tambah Proyek</h2>
      <form id="formProyek">
        <div class="form-grid">
          <label class="lebar-penuh">Nama Proyek
            <input name="nama" required maxlength="150" placeholder="contoh: Pembangunan Gudang Logistik">
          </label>
          <label>Lokasi
            <input name="lokasi" maxlength="150" placeholder="contoh: Bandung">
          </label>
          <label>Tanggal Mulai
            <input name="tanggal_mulai" type="date" required value="${hariIni()}">
          </label>
          <label>Status
            <select name="status">
              <option value="berjalan">Berjalan</option>
              <option value="selesai">Selesai</option>
            </select>
          </label>
        </div>
        <div class="form-aksi">
          <button type="submit" class="tombol utama">Simpan</button>
          <button type="button" class="tombol" id="tombolBatal" hidden>Batal Ubah</button>
        </div>
      </form>
    </div>

    <div class="kartu">
      <h2>Daftar Proyek</h2>
      <div class="tabel-wadah">
        <table>
          <thead>
            <tr><th>No</th><th>Nama Proyek</th><th>Lokasi</th><th>Tgl Mulai</th>
              <th>Status</th><th class="kanan">Total Material Terpakai</th><th></th></tr>
          </thead>
          <tbody id="isiTabel"></tbody>
        </table>
      </div>
    </div>`;

  const form = konten.querySelector('#formProyek');
  const isiTabel = konten.querySelector('#isiTabel');
  const tombolBatal = konten.querySelector('#tombolBatal');

  async function muatData() {
    const [proyek, pemakaian] = await Promise.all([
      jalankan(db.from('proyek').select('*').order('tanggal_mulai', { ascending: false })),
      jalankan(db.from('pemakaian').select('proyek_id, total'))
    ]);
    daftarProyek = proyek;

    isiTabel.innerHTML = daftarProyek.map((p, i) => {
      const totalPakai = jumlahkan(pemakaian.filter(x => x.proyek_id === p.id), 'total');
      return `
        <tr>
          <td>${i + 1}</td>
          <td>${esc(p.nama)}</td>
          <td>${esc(p.lokasi) || '-'}</td>
          <td class="nowrap">${formatTanggal(p.tanggal_mulai)}</td>
          <td>${p.status === 'berjalan' ? badge('Berjalan', 'biru') : badge('Selesai', 'abu')}</td>
          <td class="kanan">${formatRupiah(totalPakai)}</td>
          <td><button class="tombol kecil tombol-ubah" data-id="${p.id}">Ubah</button></td>
        </tr>`;
    }).join('') || barisKosong(7);
  }

  function aturModeTambah() {
    idEdit = null;
    form.reset();
    form.tanggal_mulai.value = hariIni();
    konten.querySelector('#judulForm').textContent = 'Tambah Proyek';
    tombolBatal.hidden = true;
  }

  isiTabel.addEventListener('click', e => {
    if (!e.target.classList.contains('tombol-ubah')) return;
    const p = daftarProyek.find(x => x.id == e.target.dataset.id);
    idEdit = p.id;
    form.nama.value = p.nama;
    form.lokasi.value = p.lokasi || '';
    form.tanggal_mulai.value = p.tanggal_mulai;
    form.status.value = p.status;
    konten.querySelector('#judulForm').textContent = 'Ubah Proyek: ' + p.nama;
    tombolBatal.hidden = false;
    form.scrollIntoView({ behavior: 'smooth' });
  });

  tombolBatal.addEventListener('click', aturModeTambah);

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const isian = Object.fromEntries(new FormData(form));
    const data = {
      nama: isian.nama.trim(),
      lokasi: isian.lokasi.trim() || null,
      tanggal_mulai: isian.tanggal_mulai,
      status: isian.status
    };

    const tombol = form.querySelector('button[type=submit]');
    setLoading(tombol, true);
    try {
      if (idEdit) {
        await jalankan(db.from('proyek').update(data).eq('id', idEdit));
        tampilkanPesan('Proyek berhasil diubah.');
      } else {
        await jalankan(db.from('proyek').insert(data));
        tampilkanPesan('Proyek berhasil ditambahkan.');
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
