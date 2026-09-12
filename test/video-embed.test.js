// Видео в статье: клиент вставляет в текст код с RuTube (или VK/YouTube),
// на странице должен появиться плеер, а текст рядом — остаться.
// Реальный случай 12.09.2026: код вставки с RuTube выводился как простыня букв.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { videoEmbed, withoutVideo } from '../public/js/video-embed.js';
import { excerptOf } from '../src/lib/post-text.js';

// Код вставки ровно в том виде, в каком его даёт RuTube.
const RUTUBE_CODE =
  '<iframe width="720" height="405" src="https://rutube.ru/play/embed/79d53342d97a615267acafa277b060a6/"' +
  ' style="border: none;" allow="clipboard-write; autoplay" allowFullScreen></iframe>';

describe('разбор видео', () => {
  test('код вставки RuTube', () => {
    assert.deepEqual(videoEmbed(RUTUBE_CODE), {
      name: 'RuTube',
      src: 'https://rutube.ru/play/embed/79d53342d97a615267acafa277b060a6/',
    });
  });

  test('обычная ссылка на ролик RuTube', () => {
    const v = videoEmbed('https://rutube.ru/video/79d53342d97a615267acafa277b060a6/');
    assert.equal(v.src, 'https://rutube.ru/play/embed/79d53342d97a615267acafa277b060a6/');
  });

  test('приватная ссылка RuTube сохраняет ключ доступа', () => {
    const v = videoEmbed('https://rutube.ru/video/private/79d53342d97a615267acafa277b060a6/?p=aBc-1_2');
    assert.equal(v.src, 'https://rutube.ru/play/embed/79d53342d97a615267acafa277b060a6/?p=aBc-1_2');
  });

  test('YouTube во всех трёх видах', () => {
    const want = 'https://www.youtube.com/embed/dQw4w9WgXcQ';
    assert.equal(videoEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ').src, want);
    assert.equal(videoEmbed('https://youtu.be/dQw4w9WgXcQ').src, want);
    assert.equal(
      videoEmbed('<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>').src,
      want
    );
  });

  test('VK: код вставки и обычная ссылка', () => {
    const code = videoEmbed('<iframe src="https://vk.com/video_ext.php?oid=-12345&id=678&hash=ab12"></iframe>');
    assert.equal(code.src, 'https://vk.com/video_ext.php?oid=-12345&id=678&hash=ab12');
    const link = videoEmbed('https://vkvideo.ru/video-12345_678');
    assert.equal(link.src, 'https://vk.com/video_ext.php?oid=-12345&id=678');
  });

  test('обычный текст и чужие ссылки видео не считаются', () => {
    assert.equal(videoEmbed('Сегодня клан выпустил новую песню.'), null);
    assert.equal(videoEmbed('https://tolkay-voda.ru/blog/pesnya'), null);
    assert.equal(videoEmbed(''), null);
    assert.equal(videoEmbed(null), null);
  });

  test('ссылка внутри предложения остаётся текстом', () => {
    // Иначе абзац молча превратился бы в плеер и потерял слова вокруг.
    assert.equal(videoEmbed('Смотрите https://rutube.ru/video/79d53342d97a615267acafa277b060a6/ тут'), null);
  });

  test('чужой iframe не пройдёт', () => {
    assert.equal(videoEmbed('<iframe src="https://evil.example/pwn"></iframe>'), null);
  });
});

describe('анонс статьи с видео', () => {
  test('анонсом становится текст, а не код вставки', () => {
    const body = `${RUTUBE_CODE}\n\nНовая песня клана уже в эфире.\n\nВторой абзац.`;
    assert.equal(excerptOf(body), 'Новая песня клана уже в эфире.');
  });

  test('видео внутри абзаца не съедает соседние строки', () => {
    const body = `Смотрите ролик:\n${RUTUBE_CODE}\nПриятного просмотра.`;
    assert.equal(withoutVideo(body), 'Смотрите ролик:\nПриятного просмотра.');
  });

  test('статья из одного ролика даёт пустой анонс, а не html', () => {
    assert.equal(excerptOf(RUTUBE_CODE), '');
  });

  test('обычная статья работает как раньше', () => {
    assert.equal(excerptOf('Первый абзац.\n\nВторой абзац.'), 'Первый абзац.');
  });
});
