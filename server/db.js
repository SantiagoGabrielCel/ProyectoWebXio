// Capa de acceso a datos SQLite.
// SQLite no soporta procedimientos almacenados nativos: estas funciones
// cumplen ese rol (parametrizadas, con logica encapsulada) para el resto de la app.
'use strict';

const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.join(__dirname, '..', 'datos');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const IMAGENES_DIR = path.join(__dirname, '..', 'Imagenes de Productos');

const DB_PATH = path.join(DATA_DIR, 'basedatos_liderlib.db');
const db = new DatabaseSync(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS usuarios_admin (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario TEXT UNIQUE NOT NULL,
    clave_hash TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS productos (
    id INTEGER PRIMARY KEY,
    nombre TEXT NOT NULL,
    categoria TEXT NOT NULL,
    precio_minorista INTEGER NOT NULL,
    precio_mayorista INTEGER NOT NULL,
    cantidad_minima_mayorista INTEGER NOT NULL DEFAULT 10,
    ruta_imagen TEXT
  );
`);

// Migra bases creadas antes de renombrar la columna imagen_url -> ruta_imagen.
const columnasProductos = db.prepare("PRAGMA table_info(productos)").all();
const tieneRutaImagen = columnasProductos.some(c => c.name === 'ruta_imagen');
const tieneImagenUrl = columnasProductos.some(c => c.name === 'imagen_url');
if (!tieneRutaImagen && tieneImagenUrl) {
  db.exec('ALTER TABLE productos RENAME COLUMN imagen_url TO ruta_imagen');
}

// Normaliza nombres para poder emparejar productos con archivos de imagen
// (ignora mayúsculas, espacios extra y usa "-" donde el nombre tiene "/").
function normalizarTexto(texto) {
  return texto
    .replace(/\//g, '-')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

// Busca, para cada producto de la semilla, el archivo de imagen que le corresponde
// dentro de "Imagenes de Productos", tal cual está nombrado en esa carpeta.
function construirMapaImagenesSemilla() {
  const mapa = new Map();
  if (!fs.existsSync(IMAGENES_DIR)) return mapa;

  const archivos = fs.readdirSync(IMAGENES_DIR)
    .filter(f => /\.(jpe?g|png|webp|gif)$/i.test(f));

  for (const [id, nombre] of SEED_PRODUCTS) {
    const nombreNormalizado = normalizarTexto(nombre);
    const archivo = archivos.find(f => {
      const base = normalizarTexto(path.parse(f).name);
      return base === nombreNormalizado || base.includes(nombreNormalizado);
    });
    if (archivo) mapa.set(id, `/imagenes-productos/${encodeURIComponent(archivo)}`);
  }
  return mapa;
}

const SEED_PRODUCTS = [
  [1, "Aprieta papel binder Nº5 negro x 12 unidades", "Archivo", 2450, 2100, 10],
  [2, "Bandas elásticas bolsa x 500 gramos 40 mm", "Organización", 3900, 3450, 10],
  [3, "Bibliorato PVC A4 palanca alta azul", "Archivo", 6200, 5600, 10],
  [4, "Bolígrafo opaco trazo 1.0 mm azul", "Escritura", 850, 720, 10],
  [5, "Bolígrafo opaco trazo 1.0 mm negro", "Escritura", 850, 720, 10],
  [6, "Broches Nepaco Velox plástico x 50 unidades", "Broches", 2750, 2400, 10],
  [7, "Broches Nº 50 por 1000 unidades flexibles", "Broches", 7300, 6750, 10],
  [8, "Carpeta base opaca A4 negro", "Archivo", 1900, 1650, 10],
  [9, "Cinta adhesiva 18 mm x 30 metros corte", "Cintas", 1650, 1450, 10],
  [10, "Cinta de embalar transparente 48 mm", "Cintas", 2400, 2100, 10],
  [11, "Clips Nº 4 x 100 unidades", "Broches", 1800, 1550, 10],
  [12, "Corrector lápiz de secado instantáneo 7 ml", "Corrección", 2150, 1850, 10],
  [13, "Folios A4 cristal 40 micrones x 100 un.", "Archivo", 5600, 5100, 10],
  [14, "Folios oficio cristal 40 micrones x 100 un.", "Archivo", 6100, 5550, 10],
  [15, "Lápiz negro HB Infinity x unidad", "Escritura", 780, 650, 10],
  [16, "Marcador Permanent Marker 040 1.0 mm negro", "Marcadores", 1650, 1420, 10],
  [17, "Marcador Permanent Marker 051 punta redonda azul/negro/rojo/verde", "Marcadores", 1750, 1490, 10],
  [18, "Marcador pizarra 058 punta redonda negro/rojo/verde", "Marcadores", 1900, 1620, 10],
  [19, "Regla 30 cm cristal", "Medición", 1200, 990, 10],
  [20, "Resaltador chato Intro 500 amarillo fluo", "Resaltadores", 1500, 1270, 10],
  [21, "Resaltador chato Intro 500 naranja fluo", "Resaltadores", 1500, 1270, 10],
  [22, "Resaltador chato Intro 500 rosa fluo", "Resaltadores", 1500, 1270, 10],
  [23, "Taco multicolor 9x9 por 400 hojas", "Papelería", 4300, 3850, 10],
  [24, "Cuaderno A4", "Cuadernos", 5200, 4650, 10],
  [25, "Cuaderno 16x21", "Cuadernos", 3600, 3200, 10],
  [26, "Resma A4 75 gramos 500 hojas", "Papel", 6860, 5238, 10],
  [27, "Resma A4 Autor 80 g", "Papel", 7340, 5587, 10],
  [28, "Resma A4 Punax 75 gramos 500 hojas", "Papel", 6650, 5150, 10],
  [29, "Resma oficio 75 gramos 500 hojas 21.6 x 35.6", "Papel", 8850, 7195, 10]
];

function seedProducts() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM productos').get().c;
  if (count > 0) return;
  const mapaImagenes = construirMapaImagenesSemilla();
  const insert = db.prepare(
    `INSERT INTO productos (id, nombre, categoria, precio_minorista, precio_mayorista, cantidad_minima_mayorista, ruta_imagen)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  for (const row of SEED_PRODUCTS) {
    const [id] = row;
    insert.run(...row, mapaImagenes.get(id) || null);
  }
}

// Completa ruta_imagen para productos que todavía no tienen imagen asignada,
// por si se agregan archivos nuevos a la carpeta luego del primer arranque.
function sincronizarImagenesSemilla() {
  const mapaImagenes = construirMapaImagenesSemilla();
  const actualizar = db.prepare('UPDATE productos SET ruta_imagen = ? WHERE id = ? AND ruta_imagen IS NULL');
  for (const [id, ruta] of mapaImagenes.entries()) {
    actualizar.run(ruta, id);
  }
}

// Usuario/clave de admin configurables por entorno (ADMIN_USERNAME/ADMIN_PASSWORD).
// Si ADMIN_PASSWORD está definida, siempre se aplica (sirve para resetear el
// acceso). Si no, solo se usa una clave por defecto la primera vez: una vez
// creado el usuario, su clave se puede cambiar desde el panel admin sin que
// se pise en cada reinicio.
function seedAdmin() {
  const usuario = process.env.ADMIN_USERNAME || 'Amadeo';
  const claveEntorno = process.env.ADMIN_PASSWORD;
  const existente = db.prepare('SELECT id FROM usuarios_admin WHERE usuario = ?').get(usuario);

  if (!existente) {
    if (!claveEntorno) {
      console.warn('[LiderLib] ADMIN_PASSWORD no definida: usando clave por defecto (solo desarrollo). Cambiala desde el panel admin.');
    }
    const hash = bcrypt.hashSync(claveEntorno || 'AmadeoLiderLib', 10);
    db.prepare('INSERT INTO usuarios_admin (usuario, clave_hash) VALUES (?, ?)').run(usuario, hash);
    return;
  }

  if (claveEntorno) {
    const hash = bcrypt.hashSync(claveEntorno, 10);
    db.prepare('UPDATE usuarios_admin SET clave_hash = ? WHERE usuario = ?').run(hash, usuario);
  }
}

seedProducts();
sincronizarImagenesSemilla();
seedAdmin();

// sp_verificar_admin: valida usuario/clave del admin.
function spVerificarAdmin(username, password) {
  if (!username || !password) return false;
  const row = db.prepare('SELECT clave_hash FROM usuarios_admin WHERE usuario = ?').get(username);
  if (!row) return false;
  return bcrypt.compareSync(password, row.clave_hash);
}

// sp_cambiar_clave: permite al admin cambiar su propia clave (valida la actual antes de guardar el hash nuevo).
function spCambiarClave(usuario, claveActual, claveNueva) {
  const row = db.prepare('SELECT clave_hash FROM usuarios_admin WHERE usuario = ?').get(usuario);
  if (!row) return false;
  if (!bcrypt.compareSync(claveActual, row.clave_hash)) return false;
  const hash = bcrypt.hashSync(claveNueva, 10);
  db.prepare('UPDATE usuarios_admin SET clave_hash = ? WHERE usuario = ?').run(hash, usuario);
  return true;
}

// sp_alta_producto: crea un producto nuevo o actualiza uno existente (mismo id).
function spAltaProducto({ id, name, category, unit_price, bulk_price, bulk_qty }) {
  db.prepare(
    `INSERT INTO productos (id, nombre, categoria, precio_minorista, precio_mayorista, cantidad_minima_mayorista)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       nombre = excluded.nombre,
       categoria = excluded.categoria,
       precio_minorista = excluded.precio_minorista,
       precio_mayorista = excluded.precio_mayorista,
       cantidad_minima_mayorista = excluded.cantidad_minima_mayorista`
  ).run(id, name, category, unit_price, bulk_price, bulk_qty ?? 10);
  return db.prepare('SELECT * FROM productos WHERE id = ?').get(id);
}

// sp_actualizar_imagen: actualiza la imagen de un producto existente.
function spActualizarImagen(id, rutaImagen) {
  const result = db.prepare('UPDATE productos SET ruta_imagen = ? WHERE id = ?').run(rutaImagen, id);
  return result.changes > 0;
}

// sp_actualizar_precios: actualiza el precio minorista y mayorista de un producto existente.
function spActualizarPrecios(id, precioMinorista, precioMayorista) {
  const result = db.prepare(
    'UPDATE productos SET precio_minorista = ?, precio_mayorista = ? WHERE id = ?'
  ).run(precioMinorista, precioMayorista, id);
  return result.changes > 0;
}

function getAllProducts() {
  return db.prepare('SELECT * FROM productos ORDER BY id').all();
}

function getProductById(id) {
  return db.prepare('SELECT * FROM productos WHERE id = ?').get(id);
}

function nextProductId() {
  const row = db.prepare('SELECT MAX(id) AS maxId FROM productos').get();
  return (row.maxId || 0) + 1;
}

module.exports = {
  spVerificarAdmin,
  spCambiarClave,
  spAltaProducto,
  spActualizarImagen,
  spActualizarPrecios,
  getAllProducts,
  getProductById,
  nextProductId
};
