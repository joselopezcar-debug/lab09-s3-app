require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());

const s3 = new S3Client({ region: process.env.AWS_REGION });
const BUCKET = process.env.S3_BUCKET;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE_MB = 5;

// 1) Endpoint para solicitar URL prefirmada de subida (validez 5 minutos)
app.post('/api/upload-url', async (req, res) => {
  try {
    const { filename, contentType, sizeBytes } = req.body;

    if (!ALLOWED_TYPES.includes(contentType)) {
      return res.status(400).json({ error: 'Tipo de archivo no permitido' });
    }
    if (sizeBytes > MAX_SIZE_MB * 1024 * 1024) {
      return res.status(400).json({ error: 'El archivo excede el tamaño máximo de 5MB' });
    }

    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `originales/${Date.now()}-${crypto.randomBytes(6).toString('hex')}-${safeName}`;

    const cmd = new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ContentType: contentType
    });

    const url = await getSignedUrl(s3, cmd, { expiresIn: 300 }); // 5 minutos
    res.json({ uploadUrl: url, key });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2) Endpoint para listar imágenes con URLs prefirmadas de lectura (validez 15 minutos)
app.get('/api/images', async (req, res) => {
  try {
    const list = await s3.send(new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: 'originales/'
    }));

    // Filtrar para ignorar carpetas
    const validObjects = (list.Contents || []).filter(obj => !obj.Key.endsWith('/'));

    const items = await Promise.all(validObjects.map(async obj => {
      const url = await getSignedUrl(s3,
        new GetObjectCommand({ Bucket: BUCKET, Key: obj.Key }),
        { expiresIn: 900 } // 15 minutos
      );
      return { key: obj.Key, size: obj.Size, lastModified: obj.LastModified, url };
    }));

    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3) Endpoint para eliminar imagen
app.delete('/api/images/:key(*)', async (req, res) => {
  try {
    await s3.send(new DeleteObjectCommand({
      Bucket: BUCKET,
      Key: req.params.key
    }));
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(process.env.PORT, () => {
  console.log(`Servidor API escuchando en el puerto :${process.env.PORT}`);
});