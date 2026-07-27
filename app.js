let calendarioData = [];
let calendarioYearCargado = null;

document.getElementById("calcular").addEventListener("click", async () => {
  const turno = document.getElementById("turno").value;
  const inicio = document.getElementById("inicio").value; // input type="date" => "YYYY-MM-DD"
  const fin = document.getElementById("fin").value;

  if (!turno || !inicio || !fin) {
    alert("Completa todos los campos.");
    return;
  }

  if (inicio > fin) {
    alert("La fecha de inicio no puede ser mayor que la fecha de fin.");
    return;
  }

  const year = parseISOToLocalDate(inicio).getFullYear();
  await cargarCalendario(year);

  const resultado = calcularAusentismo(turno, inicio, fin);
  renderTabla(resultado, turno);
});

async function cargarCalendario(year) {
  if (calendarioYearCargado === year && calendarioData.length > 0) return;

  const response = await fetch(`calendario_${year}.json`);
  if (!response.ok) {
    throw new Error(`No se pudo cargar calendario_${year}.json (HTTP ${response.status})`);
  }

  calendarioData = await response.json();
  calendarioYearCargado = year;
}

/**
 * Parse seguro de "YYYY-MM-DD" a Date LOCAL.
 * Fijamos hora al mediodía para evitar desfases por UTC/DST.
 */
function parseISOToLocalDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

function calcularAusentismo(turno, inicio, fin) {
  const inicioDate = parseISOToLocalDate(inicio);
  const finDate = parseISOToLocalDate(fin);

  const agrupado = {};

  for (const dia of calendarioData) {
    const fecha = parseISOToLocalDate(dia.fecha_iso);

    if (fecha < inicioDate || fecha > finDate) continue;
    if (Number(dia[turno]) !== 1) continue;

    // ✅ Clave según regla especial de corte de mes
    const keyDate = obtenerKeyAgrupacion(fecha);
    const weekStr = formatFecha(keyDate);

    if (!agrupado[weekStr]) {
      agrupado[weekStr] = {
        count: 0,
        mes: obtenerNombreMes(keyDate), // Periodo según "Week" del tramo
      };
    }

    agrupado[weekStr].count++;
  }

  return agrupado;
}

/**
 * Regla:
 * - Normal: agrupar por lunes de la semana.
 * - Especial: si el día 01 del mes NO cae lunes, entonces los días desde el 01 hasta domingo
 *   (en esa misma semana) se agrupan bajo Week = 01-mm-aaaa.
 */
function obtenerKeyAgrupacion(fecha) {
  const lunesDeFecha = obtenerLunes(fecha);

  const firstOfMonth = new Date(fecha.getFullYear(), fecha.getMonth(), 1, 12, 0, 0);
  const firstIsMonday = firstOfMonth.getDay() === 1; // lunes
  const lunesDeFirst = obtenerLunes(firstOfMonth);

  const mismaSemanaQueElPrimero = lunesDeFecha.getTime() === lunesDeFirst.getTime();
  const esDesdeElPrimero = fecha.getTime() >= firstOfMonth.getTime();

  // ✅ Aplica solo si el 01 NO cae lunes y la fecha está en esa semana y desde el 01 hacia adelante
  if (!firstIsMonday && mismaSemanaQueElPrimero && esDesdeElPrimero) {
    return firstOfMonth; // Week = 01-mm-aaaa (tramo especial)
  }

  // Normal
  return lunesDeFecha; // Week = lunes
}

function obtenerLunes(fecha) {
  const f = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate(), 12, 0, 0);
  const dia = f.getDay(); // 0=domingo
  const diff = dia === 0 ? -6 : 1 - dia;
  f.setDate(f.getDate() + diff);
  return f;
}

function formatFecha(fecha) {
  const d = String(fecha.getDate()).padStart(2, "0");
  const m = String(fecha.getMonth() + 1).padStart(2, "0");
  const y = fecha.getFullYear();
  return `${d}-${m}-${y}`;
}

function obtenerNombreMes(fecha) {
  const meses = [
    "Enero","Febrero","Marzo","Abril","Mayo","Junio",
    "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"
  ];
  return meses[fecha.getMonth()];
}

function renderTabla(data, turno) {
  const resultadoDiv = document.getElementById("resultado");

  const keys = Object.keys(data);
  if (keys.length === 0) {
    resultadoDiv.innerHTML = "<p>No hay días ausentes en el rango seleccionado.</p>";
    return;
  }

  let html = `
    <table class="tabla-resultados">
      <thead>
        <tr>
          <th>Week</th>
          <th>Periodo</th>
          <th>Ausentismo</th>
          <th>Turno</th>
        </tr>
      </thead>
      <tbody>
  `;

  keys
    .sort((a, b) => parseDDMMYYYYToLocalDate(a) - parseDDMMYYYYToLocalDate(b))
    .forEach((week) => {
      const info = data[week];
      html += `
        <tr>
          <td>${week}</td>
          <td>${info.mes}</td>
          <td>${info.count}</td>
          <td>${turno}</td>
        </tr>
      `;
    });

  html += "</tbody></table>";
  resultadoDiv.innerHTML = html;
}

function parseDDMMYYYYToLocalDate(fechaStr) {
  const [d, m, y] = fechaStr.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

document.getElementById("limpiar").addEventListener("click", () => {

  document.getElementById("turno").value = "";
  document.getElementById("inicio").value = "";
  document.getElementById("fin").value = "";

  document.getElementById("resultado").innerHTML =
    '<p class="placeholder">Aquí aparecerán los resultados...</p>';

});