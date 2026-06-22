import {
  S3Client,
  PutObjectCommand,
  HeadBucketCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { config } from './config.js';

// Клиент S3 Beget (path-style)
export const s3 = new S3Client({
  region: config.s3.region,
  endpoint: config.s3.endpoint,
  forcePathStyle: true,
  credentials: {
    accessKeyId: config.s3.accessKey,
    secretAccessKey: config.s3.secretKey,
  },
});

export async function bucketReachable() {
  await s3.send(new HeadBucketCommand({ Bucket: config.s3.bucket }));
  return true;
}

// Загружает объект, возвращает публичный CDN-URL
export async function uploadObject(key, body, contentType) {
  await s3.send(
    new PutObjectCommand({
      Bucket: config.s3.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      ACL: 'public-read',
      CacheControl: 'public, max-age=31536000, immutable',
    })
  );
  return cdnUrl(key);
}

export function cdnUrl(key) {
  return `${config.s3.cdnBaseUrl}/${key}`;
}

// Удаляет объект из бакета (idempotent — S3 не ошибается, если ключа нет).
export async function deleteObject(key) {
  if (!key) return false;
  await s3.send(new DeleteObjectCommand({ Bucket: config.s3.bucket, Key: key }));
  return true;
}
