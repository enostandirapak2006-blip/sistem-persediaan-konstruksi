// =====================================================================
// supplier.js — Halaman Data Supplier (tambah & ubah)
// =====================================================================

async function halamanSupplier(konten) {
  let daftarSupplier = [];
  let idEdit = null;   // null = mode tambah, angka = mode ubah

  konten.innerHTML = `
    <div class="kartu">
      <h2 id="judulForm">Tambah Supplier</h2>
      <form id="formSupplier">
        <div class="form-grid">
          <label>Nama Supplier
            <input name="nama" required maxlength="100" placeholder="contoh: TB Maju Jaya">
          </label>
          <label>Telepon
            <input name="telepon" maxlength="30" placeholder="contoh: 022-1234567">
          </label>
          <label class="lebar-penuh">Alamat
            <input name="alamat" placeholder="Alamat lengkap supplier">
          </label>
        </div>
        <div class="form-aksi">
          <button type="submit" class="tombol utama">Simpan</button>
          <button type="button" class="tombol" id="tombolBatal" hidden>Batal Ubah</button>
        </div>
      </form>
    </div>

    <div class="kartu">
      <h2>Daftar Supplier</h2>
      <div class="tabel-wadah">
        <table>
          <thead>
            <tr><th>No</th><th>Nama</th><th>Alamat</th><th>Telepon</th>
              <th class="kanan">Sisa Utang</th><th></th></tr>
          </thead>
          <tbody id="isiTabel"></tbody>
        </table>
      </div>
    </div>`;

  const form = konten.querySelector('#formSupplier');
  const isiTabel = konten.querySelector('#isiTabel');
  const tombolBatal = konten.querySelector('#tombolBatal');

  async function muatData() {
    const [supplier, utang] = await Promise.all([
      jalankan(db.from('supplier').select('*').order('nama')),
      jalankan(db.from('pembelian').select('supplier_id, sisa_utang').gt('sisa_utang', 0))
    ]);
    daftarSupplier = supplier;

    isiTabel.innerHTML = daftarSupplier.map((s, i) => {
      // total sisa utang ke supplier ini
      const sisaUtang = jumlahkan(utang.filter(u => u.supplier_id === s.id), 'sisa_utang');
      return `
        <tr>
          <td>${i + 1}</td>
          <td>${esc(s.nama)}</td>
          <td>${esc(s.alamat) || '-'}</td>
          <td class="nowrap">${esc(s.telepon) || '-'}</td>
          <td class="kanan">${sisaUtang ? formatRupiah(sisaUtang) : '-'}</td>
          <td><button class="tombol kecil tombol-ubah" data-id="${s.id}">Ubah</button></td>
        </tr>`;
    }).join('') || barisKosong(6);
  }

  function aturModeTambah() {
    idEdit = null;
    form.reset();
    konten.querySelector('#judulForm').textContent = 'Tambah Supplier';
    tombolBatal.hidden = true;
  }

  isiTabel.addEventListener('click', e => {
    if (!e.target.classList.contains('tombol-ubah')) return;
    const s = daftarSupplier.find(x => x.id == e.target.dataset.id);
    idEdit = s.id;
    form.nama.value = s.nama;
    form.telepon.value = s.telepon || '';
    form.alamat.value = s.alamat || '';
    konten.querySelector('#judulForm').textContent = 'Ubah Supplier: ' + s.nama;
    tombolBatal.hidden = false;
    form.scrollIntoView({ behavior: 'smooth' });
  });

  tombolBatal.addEventListener('click', aturModeTambah);

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const isian = Object.fromEntries(new FormData(form));
    const data = {
      nama: isian.nama.trim(),
      telepon: isian.telepon.trim() || null,
      alamat: isian.alamat.trim() || null
    };

    const tombol = form.querySelector('button[type=submit]');
    setLoading(tombol, true);
    try {
      if (idEdit) {
        await jalankan(db.from('supplier').update(data).eq('id', idEdit));
        tampilkanPesan('Supplier berhasil diubah.');
      } else {
        await jalankan(db.from('supplier').insert(data));
        tampilkanPesan('Supplier berhasil ditambahkan.');
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
