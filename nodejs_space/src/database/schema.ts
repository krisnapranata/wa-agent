/**
 * Tabel internal milik bot. Dibuat otomatis saat service start (CREATE TABLE IF NOT EXISTS).
 * Salinan SQL yang sama tersedia di sql/001_bot_tables.sql untuk dijalankan manual.
 */
export const SCHEMA_SQL: string[] = [
  `CREATE TABLE IF NOT EXISTS broadcast_numbers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nama_petugas VARCHAR(100) NOT NULL,
    nomor_wa VARCHAR(20) NOT NULL UNIQUE,
    aktif TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS wa_auth_state (
    id VARCHAR(255) PRIMARY KEY,
    data LONGTEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS api_keys (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nama VARCHAR(100) NOT NULL,
    key_hash CHAR(64) NOT NULL UNIQUE,
    aktif TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS broadcast_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tipe VARCHAR(30) NOT NULL,
    jumlah_pasien INT NOT NULL DEFAULT 0,
    jumlah_terkirim INT NOT NULL DEFAULT 0,
    jumlah_gagal INT NOT NULL DEFAULT 0,
    keterangan VARCHAR(500) NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
];
