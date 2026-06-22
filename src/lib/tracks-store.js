// Фонотека эфира в БД: чтение/добавление/удаление треков.
// Источник правды для /api/tracks, резолва «сейчас играет» и плейлиста Liquidsoap.
import { db } from './db.js';

const listStmt = db.prepare(
  'SELECT id, position, title, artist, s3_key, url, cover FROM tracks ORDER BY position ASC, id ASC'
);
const byIdStmt = db.prepare('SELECT * FROM tracks WHERE id = ?');
const countStmt = db.prepare('SELECT COUNT(*) AS n FROM tracks');
const maxPosStmt = db.prepare('SELECT COALESCE(MAX(position), 0) AS m FROM tracks');
const insertStmt = db.prepare(
  'INSERT INTO tracks (position, title, artist, s3_key, url, cover) VALUES (?, ?, ?, ?, ?, ?)'
);
const deleteStmt = db.prepare('DELETE FROM tracks WHERE id = ?');

export function listTracks() {
  return listStmt.all();
}
export function getTrack(id) {
  return byIdStmt.get(Number(id));
}
export function countTracks() {
  return countStmt.get().n;
}
export function nextPosition() {
  return maxPosStmt.get().m + 1;
}

// Добавляет трек. Возвращает { id, position }.
export function insertTrack({ title, artist, s3Key, url, cover, position }) {
  const pos = position ?? nextPosition();
  const info = insertStmt.run(
    pos,
    title,
    artist ?? 'Клан Толкай Вода',
    s3Key ?? '',
    url,
    cover ?? '/assets/img/cover-default.webp'
  );
  return { id: Number(info.lastInsertRowid), position: pos };
}

export function deleteTrack(id) {
  return deleteStmt.run(Number(id)).changes;
}
