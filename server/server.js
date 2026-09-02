'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const rateLimit = require('express-rate-limit');

const {
  spVerificarAdmin,
  spCambiarClave,
  spAltaProducto,
  spActualizarImagen,
  spActualizarPrecios,
  getAllProducts,
  getProductById,
  nextProductId
} = require('./db');

const ROOT_DIR = path.join(__dirname, '..');
const UPLOADS_DIR = path.join(ROOT_DIR, 'uploads', 'products');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
const IMAGENES_DIR = path.join(ROOT_DIR, 'Imagenes de Productos');

const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const PORT = process.env.PORT || 3000;

const app = express();
app.set('trust proxy', 1);
app.use(express.json());

// --- Autenticación ---
function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No autenticado' });
  try {
    req.admin = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Sesión inválida o expirada' });
  }
}

// Frena intentos de fuerza bruta contra el login y el cambio de clave del admin.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Probá de nuevo en unos minutos.' }
});

app.post('/api/admin/login', loginLimiter, (req, res) => {
  const { usuario, clave } = req.body || {};
  if (!spVerificarAdmin(usuario, clave)) {
    return res.status(401).json({ error: 'Usuario o clave incorrectos' });
  }
  const token = jwt.sign({ usuario }, JWT_SECRET, { expiresIn: '8h' });
  res.json({ token });
});

app.post('/api/admin/cambiar-clave', loginLimiter, requireAdmin, (req, res) => {
  const { claveActual, claveNueva } = req.body || {};
  if (!claveActual || !claveNueva || String(claveNueva).length < 8) {
    return res.status(400).json({ error: 'La nueva clave debe tener al menos 8 caracteres' });
  }
  const ok = spCambiarClave(req.admin.usuario, claveActual, claveNueva);
  if (!ok) return res.status(401).json({ error: 'La clave actual no es correcta' });
  res.json({ ok: true });
});

// --- Productos (público: solo lectura) ---
app.get('/api/products', (_req, res) => {
  res.json(getAllProducts());
});

// --- Productos (admin) ---
app.post('/api/admin/products', requireAdmin, (req, res) => {
  const { id, nombre, categoria, precio_minorista, precio_mayorista, cantidad_minima_mayorista } = req.body || {};
  if (!nombre || !categoria || !precio_minorista || !precio_mayorista) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }
  const productId = id || nextProductId();
  const product = spAltaProducto({
    id: productId,
    name: nombre,
    category: categoria,
    unit_price: Number(precio_minorista),
    bulk_price: Number(precio_mayorista),
    bulk_qty: Number(cantidad_minima_mayorista) || 10
  });
  res.status(201).json(product);
});

app.put('/api/admin/products/:id/precios', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const { precio_minorista, precio_mayorista } = req.body || {};
  const minorista = Number(precio_minorista);
  const mayorista = Number(precio_mayorista);

  if (!Number.isFinite(minorista) || minorista <= 0 || !Number.isFinite(mayorista) || mayorista <= 0) {
    return res.status(400).json({ error: 'Los precios deben ser números mayores a 0' });
  }

  const actualizado = spActualizarPrecios(id, minorista, mayorista);
  if (!actualizado) return res.status(404).json({ error: 'Producto no encontrado' });
  res.json(getProductById(id));
});

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `producto-${req.params.id}-${Date.now()}${ext}`);
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
    cb(null, allowed.includes(path.extname(file.originalname).toLowerCase()));
  }
});

app.post('/api/admin/products/:id/imagen', requireAdmin, upload.single('imagen'), (req, res) => {
  const id = Number(req.params.id);
  const product = getProductById(id);
  if (!product) return res.status(404).json({ error: 'Producto no encontrado' });
  if (!req.file) return res.status(400).json({ error: 'Imagen inválida o faltante' });

  const imageUrl = `/uploads/products/${req.file.filename}`;
  spActualizarImagen(id, imageUrl);
  res.json({ id, ruta_imagen: imageUrl });
});

// --- Estáticos ---
app.use('/imagenes-productos', express.static(IMAGENES_DIR));
app.use('/uploads', express.static(path.join(ROOT_DIR, 'uploads')));
app.use(express.static(ROOT_DIR, { index: 'index.html' }));

app.listen(PORT, () => {
  console.log(`LiderLib server escuchando en el puerto ${PORT}`);
});
