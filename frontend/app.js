const API = 'http://localhost:3000';
const MAX_SIZE_MB = 5;
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];

document.getElementById('uploadBtn').addEventListener('click', async () => {
  const fileInput = document.getElementById('file');
  const file = fileInput.files[0];
  const statusDiv = document.getElementById('status');

  if (!file) return alert('Por favor selecciona un archivo.');

  if (!ALLOWED.includes(file.type)) {
    statusDiv.textContent = 'Error: Tipo de archivo no permitido (solo JPG, PNG, WEBP).';
    statusDiv.style.color = 'red';
    return;
  }

  if (file.size > MAX_SIZE_MB * 1024 * 1024) {
    statusDiv.textContent = 'Error: El archivo excede el tamaño máximo permitido de 5MB.';
    statusDiv.style.color = 'red';
    return;
  }

  statusDiv.textContent = 'Solicitando URL prefirmada...';
  statusDiv.style.color = 'blue';

  try {
    // 1) Pedir presigned URL al backend
    const res = await fetch(`${API}/api/upload-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: file.name,
        contentType: file.type,
        sizeBytes: file.size
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    statusDiv.textContent = 'Subiendo directamente a S3...';

    // 2) Petición PUT directa del navegador hacia Amazon S3
    const s3Res = await fetch(data.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file
    });

    // Validar respuesta real de S3
    if (!s3Res.ok) {
      throw new Error(`S3 rechazó la subida (Código HTTP: ${s3Res.status})`);
    }

    statusDiv.textContent = '¡Carga completada con éxito!';
    statusDiv.style.color = 'green';
    fileInput.value = '';
    loadGallery();
  } catch (err) {
    statusDiv.textContent = `Error: ${err.message}`;
    statusDiv.style.color = 'red';
  }
});

async function loadGallery() {
  try {
    const res = await fetch(`${API}/api/images`);
    const items = await res.json();
    const gallery = document.getElementById('gallery');
    gallery.innerHTML = items.map(i =>
      `<div class="card">
        <img src="${i.url}" alt="Imagen S3">
        <button class="btn-delete" onclick="del('${i.key}')">Eliminar</button>
      </div>`
    ).join('');
  } catch (err) {
    console.error('Error al cargar la galería:', err);
  }
}

async function del(key) {
  if (!confirm('¿Seguro que deseas eliminar esta imagen?')) return;
  await fetch(`${API}/api/images/${encodeURIComponent(key)}`, { method: 'DELETE' });
  loadGallery();
}

loadGallery();