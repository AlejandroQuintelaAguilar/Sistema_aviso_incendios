import { useEffect, useState } from "react";
import * as estacionesService from "../../services/estacionesService";
import { FOTO_ESTACION_PREDETERMINADA } from "./fotoEstacion";

// Las fotos se descargan una sola vez por estación y se comparten entre tarjetas y modal.
const urlsEnCache = new Map();

function urlDe(idEstacion) {
  if (!urlsEnCache.has(idEstacion)) {
    const descarga = estacionesService
      .foto(idEstacion)
      .then((blob) => URL.createObjectURL(blob))
      .catch(() => null);
    urlsEnCache.set(idEstacion, descarga);
  }
  return urlsEnCache.get(idEstacion);
}

export function useImagenEstacion(estacion) {
  const id = estacion?.id_estacion;
  const tieneFoto = Boolean(estacion?.tiene_foto ?? estacion?.foto_url);
  const [url, setUrl] = useState(FOTO_ESTACION_PREDETERMINADA);

  useEffect(() => {
    if (!id || !tieneFoto) {
      setUrl(FOTO_ESTACION_PREDETERMINADA);
      return undefined;
    }
    let activo = true;
    urlDe(id).then((resultado) => {
      if (activo && resultado) setUrl(resultado);
    });
    return () => {
      activo = false;
    };
  }, [id, tieneFoto]);

  return url;
}

export default function ImagenEstacion({ estacion, ...props }) {
  const url = useImagenEstacion(estacion);
  return <img src={url} alt={`Foto de ${estacion?.nombre || "la estación"}`} {...props} />;
}
