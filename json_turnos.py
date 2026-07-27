import os
import pandas as pd
import json

# ==============================
# CONFIGURACIÓN DINÁMICA
# ==============================

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# El Excel está un nivel arriba del script
RUTA_EXCEL = os.path.abspath(
    os.path.join(BASE_DIR, "..", "calendario_ausentismos.xlsx")
)

HOJA = "Hoja1"

# ==============================
# FUNCIONES
# ==============================

def normalizar_nombre_columna(nombre):
    """
    Reemplaza espacios por '_' y elimina espacios al inicio/final.
    """
    return nombre.strip().replace(" ", "_")


def generar_json_desde_excel(ruta_excel, hoja):
    # Leer Excel
    df = pd.read_excel(ruta_excel, sheet_name=hoja)

    # Normalizar nombres columnas
    df.columns = [normalizar_nombre_columna(col) for col in df.columns]

    # Verificar columna Fecha
    if "Fecha" not in df.columns:
        raise ValueError("No se encontró la columna 'Fecha' en el archivo.")

    # Convertir Fecha a datetime (formato dd-mm-aaaa)
    df["Fecha"] = pd.to_datetime(df["Fecha"], format="%d-%m-%Y")

    # Crear campos requeridos
    df["fecha_str"] = df["Fecha"].dt.strftime("%d-%m-%Y")
    df["fecha_iso"] = df["Fecha"].dt.strftime("%Y-%m-%d")

    # Detectar año automáticamente (primer registro)
    anio = df["Fecha"].dt.year.iloc[0]

    # Columnas de turnos (todo lo que no sea auxiliar)
    columnas_excluir = [
        "Año",
        "Mes",
        "Fecha",
        "DiaSemanaNum",
        "DiaSemana"
    ]

    columnas_turnos = [
        col for col in df.columns
        if col not in columnas_excluir + ["fecha_str", "fecha_iso"]
    ]

    # Asegurar que turnos sean enteros 0/1
    for col in columnas_turnos:
        df[col] = df[col].astype(int)

    # Construir dataframe final
    df_final = df[["fecha_str", "fecha_iso"] + columnas_turnos]

    # Convertir a lista de diccionarios
    data = df_final.to_dict(orient="records")

    # Nombre archivo salida (mismo directorio del excel)
    directorio = os.path.dirname(ruta_excel)
    nombre_salida = os.path.join(directorio, f"calendario_{anio}.json")

    # Guardar JSON
    with open(nombre_salida, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"✅ JSON generado correctamente:")
    print(nombre_salida)


# ==============================
# EJECUCIÓN
# ==============================

if __name__ == "__main__":
    generar_json_desde_excel(RUTA_EXCEL, HOJA)