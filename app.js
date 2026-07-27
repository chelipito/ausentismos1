let calendarioPorAnio = {}; // cache: { [year]: dataArray }

document.getElementById("calcular").addEventListener("click", async () => {
  const turno = document.getElementById("turno").value;
  const inicio = document.getElementById("inicio").value; // input type="date" => "YYYY-MM-DD"
  const fin = document.getElementById("fin").value;
  const btnCalcular = document.getElementById("calcular");
  const resultadoDiv = document.getElementById("resultado");

  if (!turno || !inicio || !fin) {
    alert("Completa todos los campos.");
    return;
  }

  if (inicio > fin) {
    alert("La fecha de inicio no puede ser mayor que la fecha de fin.");
    return;
  }

  const anioInicio = parseISOToLocalDate(inicio).getFullYear();
  const anioFin = parseISOToLocalDate(fin).getFullYear();
  const anios = [];
  for (let y = anioInicio; y <= anioFin; y++) anios.push(y);

  btnCalcular.disabled = true;
  btnCalcular.textContent = "Calculando...";

  try {
    await Promise.all(anios.map(cargarCalendario));

    const calendarioData = anios.flatMap((y) => calendarioPorAnio[y]);
    const resultado = calcularAusentismo(calendarioData, turno, inicio, fin);
    renderTabla(resultado, turno);
  } catch (err) {
    resultadoDiv.innerHTML = `<p class="placeholder">Error: ${err.message}</p>`;
  } finally {
    btnCalcular.disabled = false;
    btnCalcular.textContent = "Calcular Ausentismo";
  }
});

async function cargarCalendario(year) {
  if (calendarioPorAnio[year]) return;

  const response = await fetch(`calendario_${year}.json`);
  if (!response.ok) {
    throw new Error(
      `No se pudo cargar calendario_${year}.json (HTTP ${response.status}). Verifica que el archivo exista para ese año.`
    );
  }

  calendarioPorAnio[year] = await response.json();
}

/**
 * Parse seguro de "YYYY-MM-DD" a Date LOCAL.
 * Fijamos hora al mediodía para evitar desfases por UTC/DST.
 */
function parseISOToLocalDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

function calcularAusentismo(calendarioData, turno, inicio, fin) {
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

/* ============================================================
   CARGA MASIVA (EXCEL)
   ============================================================ */

const TURNOS_VALIDOS = [
  "5x2", "4x3", "8x6a", "7x7_M", "7x7_N",
  "7x7_P", "7x7_Q", "4x10", "4x3_M", "4x3_P",
];

document.getElementById("procesarCarga").addEventListener("click", async () => {
  const fileInput = document.getElementById("excelFile");
  const btnProcesar = document.getElementById("procesarCarga");
  const resultadoMasivoDiv = document.getElementById("resultadoMasivo");

  if (!fileInput.files || fileInput.files.length === 0) {
    alert("Selecciona un archivo Excel primero.");
    return;
  }

  btnProcesar.disabled = true;
  btnProcesar.textContent = "Procesando...";
  resultadoMasivoDiv.innerHTML = "";

  try {
    const filas = await leerExcel(fileInput.files[0]);

    if (filas.length === 0) {
      resultadoMasivoDiv.innerHTML =
        '<p class="placeholder">El archivo no tiene filas de datos.</p>';
      return;
    }

    // Recolectar todos los años necesarios entre todas las filas
    const aniosNecesarios = new Set();
    const filasProcesadas = [];

    for (const [index, fila] of filas.entries()) {
      const nombre = obtenerValorColumna(fila, ["Nombre"]);
      const turnoCrudo = obtenerValorColumna(fila, ["turno", "Turno"]);
      const inicioCrudo = obtenerValorColumna(fila, ["Fecha Inicio Ausentismo", "Fecha Inicio"]);
      const finCrudo = obtenerValorColumna(fila, ["Fecha Término Ausentismo", "Fecha Termino Ausentismo", "Fecha Fin Ausentismo"]);

      const turno = (turnoCrudo || "").toString().trim().replace(/\s+/g, "_");
      const inicioISO = celdaAFechaISO(inicioCrudo);
      const finISO = celdaAFechaISO(finCrudo);

      const errores = [];
      if (!nombre) errores.push("falta Nombre");
      if (!TURNOS_VALIDOS.includes(turno)) errores.push(`turno "${turnoCrudo}" no reconocido`);
      if (!inicioISO) errores.push("Fecha Inicio inválida");
      if (!finISO) errores.push("Fecha Término inválida");
      if (inicioISO && finISO && inicioISO > finISO) errores.push("Fecha Inicio es posterior a Fecha Término");

      if (errores.length > 0) {
        filasProcesadas.push({ fila: index + 2, nombre, turno, error: errores.join(", ") });
        continue;
      }

      const anioInicio = parseISOToLocalDate(inicioISO).getFullYear();
      const anioFin = parseISOToLocalDate(finISO).getFullYear();
      for (let y = anioInicio; y <= anioFin; y++) aniosNecesarios.add(y);

      filasProcesadas.push({ fila: index + 2, nombre, turno, inicioISO, finISO });
    }

    // Cargar todos los calendarios necesarios (una sola vez por año)
    const resultadosCarga = [];
    for (const year of aniosNecesarios) {
      try {
        await cargarCalendario(year);
      } catch (err) {
        resultadosCarga.push({ year, error: err.message });
      }
    }

    // Renderizar resultado por fila
    filasProcesadas.forEach((item) => {
      if (item.error) {
        renderFilaError(item, resultadoMasivoDiv);
        return;
      }

      const anioInicio = parseISOToLocalDate(item.inicioISO).getFullYear();
      const anioFin = parseISOToLocalDate(item.finISO).getFullYear();
      const anios = [];
      for (let y = anioInicio; y <= anioFin; y++) anios.push(y);

      const faltaCalendario = anios.some((y) => !calendarioPorAnio[y]);
      if (faltaCalendario) {
        renderFilaError(
          { ...item, error: "No se pudo cargar el calendario del año requerido" },
          resultadoMasivoDiv
        );
        return;
      }

      const calendarioData = anios.flatMap((y) => calendarioPorAnio[y]);
      const resultado = calcularAusentismo(calendarioData, item.turno, item.inicioISO, item.finISO);
      renderTablaMasiva(item, resultado, resultadoMasivoDiv);
    });
  } catch (err) {
    resultadoMasivoDiv.innerHTML = `<p class="placeholder">Error al procesar el archivo: ${err.message}</p>`;
  } finally {
    btnProcesar.disabled = false;
    btnProcesar.textContent = "Procesar Carga Masiva";
  }
});

function leerExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: "array", cellDates: true });
        const primeraHoja = workbook.Sheets[workbook.SheetNames[0]];
        const filas = XLSX.utils.sheet_to_json(primeraHoja, { defval: "" });
        resolve(filas);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("No se pudo leer el archivo."));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Busca el valor de una columna probando varios nombres posibles
 * (insensible a mayúsculas/minúsculas y espacios extra).
 */
function obtenerValorColumna(fila, nombresPosibles) {
  const claves = Object.keys(fila);
  for (const nombre of nombresPosibles) {
    const claveEncontrada = claves.find(
      (k) => k.trim().toLowerCase() === nombre.trim().toLowerCase()
    );
    if (claveEncontrada !== undefined) return fila[claveEncontrada];
  }
  return null;
}

/**
 * Convierte una celda (Date, string dd-mm-yyyy, dd/mm/yyyy o yyyy-mm-dd) a "YYYY-MM-DD".
 * Retorna null si no se puede interpretar.
 */
function celdaAFechaISO(valor) {
  if (!valor && valor !== 0) return null;

  if (valor instanceof Date && !isNaN(valor)) {
    const y = valor.getFullYear();
    const m = String(valor.getMonth() + 1).padStart(2, "0");
    const d = String(valor.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  const texto = valor.toString().trim();

  // yyyy-mm-dd
  let match = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) {
    const [, y, m, d] = match;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // dd-mm-yyyy o dd/mm/yyyy
  match = texto.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (match) {
    const [, d, m, y] = match;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  return null;
}

function renderFilaError(item, container) {
  const div = document.createElement("div");
  div.className = "fila-masiva fila-masiva-error";
  div.innerHTML = `
    <h3>Fila ${item.fila}${item.nombre ? " — " + item.nombre : ""}</h3>
    <p class="placeholder">⚠️ ${item.error}</p>
  `;
  container.appendChild(div);
}

function renderTablaMasiva(item, data, container) {
  const div = document.createElement("div");
  div.className = "fila-masiva";

  const keys = Object.keys(data);

  let html = `<h3>${item.nombre} — Turno ${item.turno} (${item.fila === undefined ? "" : "Fila " + item.fila})</h3>`;

  if (keys.length === 0) {
    html += `<p class="placeholder">No hay días ausentes en el rango seleccionado.</p>`;
    div.innerHTML = html;
    container.appendChild(div);
    return;
  }

  html += `
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
          <td>${item.turno}</td>
        </tr>
      `;
    });

  html += "</tbody></table>";
  div.innerHTML = html;
  container.appendChild(div);
}