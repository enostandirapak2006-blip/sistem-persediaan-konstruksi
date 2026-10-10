// =====================================================================
// supabase.js — Koneksi ke database Supabase
//
// Ambil dua nilai di bawah dari dashboard Supabase:
//   Project Settings -> API Keys (dan Data API untuk Project URL)
//
// PENTING:
//   * Pakai ANON / PUBLISHABLE key saja. Kunci ini memang boleh dilihat
//     publik karena keamanannya dijaga oleh Row Level Security (RLS)
//     yang sudah dibuat di backend/schema.sql.
//   * JANGAN PERNAH menaruh service_role / secret key di sini. Kunci itu
//     melewati semua RLS — siapa pun yang melihatnya bisa menghapus
//     seluruh database.
// =====================================================================

const SUPABASE_URL = 'https://xsfabmtxniakdpphvqyy.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_XD9OMjDiJEab9vjyKalKmA_GkqRrIv3';

// "window.supabase" berasal dari library CDN yang dimuat di index.html.
// "db" adalah objek yang kita pakai di semua file untuk mengakses database.
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Mengecek apakah URL & key di atas sudah diganti
function supabaseSudahDiatur() {
  return !SUPABASE_URL.includes('GANTI') && !SUPABASE_ANON_KEY.includes('GANTI');
}
