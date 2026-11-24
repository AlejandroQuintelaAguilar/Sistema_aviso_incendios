import { useEffect, useRef, useState } from 'react';
import { StatusBadge } from '../../components/common/StatusBadge';

const URGENCIAS = ['BAJO', 'MEDIO', 'ALTO', 'CRITICO'];

const OBSERVACIONES_RAPIDAS = [
  'Llamas visibles',
  'Humo denso',
  'Cerca de viviendas',
  'Viento fuerte',
  'Vegetación seca',
  'Acceso difícil',
];

function getSpeechRecognitionCtor() {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export function MensajeIncendioPanel({
  ultimoAviso = null,
  pickedPoint = null,
  onEnviarDescripcion,
  onCrearConDescripcion,
  onDesvincularAviso,
  loading = false,
}) {
  const [mensaje, setMensaje] = useState('');
  const [etiquetas, setEtiquetas] = useState([]);
  const [nivelUrgencia, setNivelUrgencia] = useState('ALTO');
  const [referencia, setReferencia] = useState('');

  const [estadoVoz, setEstadoVoz] = useState('idle');
  const [vozParcial, setVozParcial] = useState('');
  const [vozError, setVozError] = useState('');

  const recognitionRef = useRef(null);
  const startupTimerRef = useRef(null);
  const restartTimerRef = useRef(null);
  const baseMensajeRef = useRef('');
  const finalizadoRef = useRef('');
  const parcialRef = useRef('');
  const activoRef = useRef(false);
  const errorFatalRef = useRef(false);
  const cerradoManualRef = useRef(false);

  const esEdge =
    typeof navigator !== 'undefined' && /Edg\//i.test(navigator.userAgent || '');
  const vozSoportada = Boolean(getSpeechRecognitionCtor());
  const escuchando = estadoVoz !== 'idle';

  function limpiarTimers() {
    if (startupTimerRef.current) {
      clearTimeout(startupTimerRef.current);
      startupTimerRef.current = null;
    }
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  }

  function construirTextoDictado() {
    return [baseMensajeRef.current, finalizadoRef.current, parcialRef.current]
      .filter((parte) => typeof parte === 'string' && parte.trim())
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  useEffect(() => {
    return () => {
      activoRef.current = false;
      cerradoManualRef.current = true;
      limpiarTimers();
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // Ignorar errores al abortar durante desmontaje
        }
        recognitionRef.current = null;
      }
    };
  }, []);

  function detenerDictado() {
    activoRef.current = false;
    cerradoManualRef.current = true;
    limpiarTimers();
    const textoConsolidado = construirTextoDictado();
    if (textoConsolidado || mensaje.trim()) {
      setMensaje(textoConsolidado || mensaje.trim());
    }
    baseMensajeRef.current = textoConsolidado || mensaje.trim();
    finalizadoRef.current = '';
    parcialRef.current = '';

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Ignorar si ya estaba detenido
      }
    }
    setEstadoVoz('idle');
    setVozParcial('');
  }

  function iniciarInstanciaReconocimiento(SpeechRecognitionCtor) {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // Ignorar al limpiar instancia previa
      }
      recognitionRef.current = null;
    }

    try {
      const recognition = new SpeechRecognitionCtor();
      recognition.lang = 'es-ES';
      recognition.continuous = !esEdge;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      if (startupTimerRef.current) {
        clearTimeout(startupTimerRef.current);
      }
      startupTimerRef.current = setTimeout(() => {
        if (recognitionRef.current !== recognition) return;
        activoRef.current = false;
        errorFatalRef.current = true;
        try {
          recognition.abort();
        } catch {
          // Ignorar error al abortar por timeout
        }
        recognitionRef.current = null;
        setEstadoVoz('idle');
        setVozParcial('');
        setVozError(
          'El servicio de voz del navegador no respondió a tiempo [código: timeout]. Verifica permisos de micrófono, privacidad del navegador y conexión a internet (o usa Win + H dentro del cuadro de texto).'
        );
      }, 12000);

      recognition.onstart = () => {
        if (startupTimerRef.current) {
          clearTimeout(startupTimerRef.current);
          startupTimerRef.current = null;
        }
        setEstadoVoz('listening');
      };

      recognition.onaudiostart = () => {
        if (startupTimerRef.current) {
          clearTimeout(startupTimerRef.current);
          startupTimerRef.current = null;
        }
        setEstadoVoz((prev) => (prev === 'speech' ? prev : 'listening'));
      };

      recognition.onspeechstart = () => {
        if (startupTimerRef.current) {
          clearTimeout(startupTimerRef.current);
          startupTimerRef.current = null;
        }
        setEstadoVoz('speech');
      };

      recognition.onspeechend = () => {
        setEstadoVoz((prev) => (prev === 'idle' ? 'idle' : 'listening'));
      };

      recognition.onresult = (event) => {
        let textoFinalNuevo = '';
        let textoInterino = '';
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const res = event.results[i];
          const transcript = res[0]?.transcript || '';
          if (res.isFinal) {
            textoFinalNuevo += `${transcript} `;
          } else {
            textoInterino += transcript;
          }
        }
        if (textoFinalNuevo.trim()) {
          finalizadoRef.current = [finalizadoRef.current, textoFinalNuevo.trim()]
            .filter(Boolean)
            .join(' ')
            .trim();
        }
        parcialRef.current = textoInterino.trim();
        setVozParcial(textoInterino.trim());
        setMensaje(construirTextoDictado());
      };

      recognition.onnomatch = () => {
        setVozError(
          'No se entendió lo dictado. Intenta hablar más claro cerca del micrófono [código: nomatch].'
        );
      };

      recognition.onerror = (event) => {
        limpiarTimers();
        const textoActual = construirTextoDictado();
        if (textoActual) {
          setMensaje(textoActual);
        }

        if (event.error !== 'aborted') {
          errorFatalRef.current = true;
          activoRef.current = false;
        }

        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          setVozError(
            `Permiso de micrófono denegado. Habilítalo desde el ícono de candado junto a la barra de direcciones [código: ${event.error}].`
          );
        } else if (event.error === 'audio-capture') {
          setVozError(
            `No se detectó ningún micrófono disponible o está siendo usado por otra aplicación [código: ${event.error}].`
          );
        } else if (event.error === 'no-speech') {
          setVozError(
            `No se detectó voz en el micrófono. Acércate e intenta dictar nuevamente [código: ${event.error}].`
          );
        } else if (event.error === 'network') {
          setVozError(
            'Error de conexión con el servicio de voz del navegador [código: network]. En Microsoft Edge esto ocurre si el servicio de voz de Microsoft está bloqueado por red/privacidad/VPN. Puedes probar en Google Chrome o usar el dictado nativo de Windows (Win + H) dentro del cuadro de texto.'
          );
        } else if (event.error === 'language-not-supported') {
          setVozError(
            `Idioma de voz no soportado en este navegador; intenta en Chrome o Edge [código: ${event.error}].`
          );
        } else if (event.error !== 'aborted') {
          setVozError(`Error de dictado por voz [código: ${event.error}].`);
        }

        setEstadoVoz('idle');
        setVozParcial('');
        recognitionRef.current = null;
      };

      recognition.onend = () => {
        if (startupTimerRef.current) {
          clearTimeout(startupTimerRef.current);
          startupTimerRef.current = null;
        }
        if (parcialRef.current.trim()) {
          finalizadoRef.current = [finalizadoRef.current, parcialRef.current.trim()]
            .filter(Boolean)
            .join(' ')
            .trim();
          parcialRef.current = '';
        }
        const textoConsolidado = construirTextoDictado();
        if (!cerradoManualRef.current && textoConsolidado) {
          setMensaje(textoConsolidado);
        }
        setVozParcial('');
        recognitionRef.current = null;

        if (
          esEdge &&
          activoRef.current &&
          !cerradoManualRef.current &&
          !errorFatalRef.current
        ) {
          setEstadoVoz('listening');
          if (restartTimerRef.current) {
            clearTimeout(restartTimerRef.current);
          }
          restartTimerRef.current = setTimeout(() => {
            restartTimerRef.current = null;
            if (
              activoRef.current &&
              !cerradoManualRef.current &&
              !errorFatalRef.current
            ) {
              iniciarInstanciaReconocimiento(SpeechRecognitionCtor);
            }
          }, 180);
          return;
        }

        activoRef.current = false;
        cerradoManualRef.current = false;
        baseMensajeRef.current = textoConsolidado || baseMensajeRef.current;
        finalizadoRef.current = '';
        setEstadoVoz('idle');
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      limpiarTimers();
      activoRef.current = false;
      errorFatalRef.current = true;
      recognitionRef.current = null;
      setEstadoVoz('idle');
      setVozParcial('');
      setVozError(
        `No se pudo iniciar el dictado (${err.message || 'error'}) [código: start-exception].`
      );
    }
  }

  function toggleDictado() {
    if (escuchando || activoRef.current) {
      detenerDictado();
      return;
    }

    setVozError('');

    if (typeof window !== 'undefined' && !window.isSecureContext) {
      setVozError(
        'El dictado por voz requiere abrir la app en http://localhost:5173, http://127.0.0.1:5173 o HTTPS (no funciona en IP local sin HTTPS).'
      );
      return;
    }

    const SpeechRecognitionCtor = getSpeechRecognitionCtor();
    if (!SpeechRecognitionCtor) {
      setVozError(
        'Tu navegador no soporta dictado por voz (Web Speech API). Usa Google Chrome o Microsoft Edge, o escribe/selecciona las observaciones rápidas.'
      );
      return;
    }

    baseMensajeRef.current = mensaje.trim();
    finalizadoRef.current = '';
    parcialRef.current = '';
    cerradoManualRef.current = false;
    errorFatalRef.current = false;
    activoRef.current = true;
    setVozParcial('');
    setEstadoVoz('starting');

    iniciarInstanciaReconocimiento(SpeechRecognitionCtor);
  }

  function toggleEtiqueta(tag) {
    setEtiquetas((prev) =>
      prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag]
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    let textoMensaje = mensaje;
    if (escuchando) {
      textoMensaje = construirTextoDictado() || mensaje;
      detenerDictado();
    }

    const partes = [];
    if (etiquetas.length > 0) {
      partes.push(`[${etiquetas.join(', ')}]`);
    }
    if (textoMensaje.trim()) {
      partes.push(textoMensaje.trim());
    }
    const textoFinal = partes.join(' ').trim();
    if (!textoFinal) return;

    if (ultimoAviso) {
      await onEnviarDescripcion(ultimoAviso.id_aviso, {
        descripcion: textoFinal,
        nivel_urgencia: nivelUrgencia,
        append: true,
      });
    } else {
      await onCrearConDescripcion({
        ubicacion: referencia.trim() || undefined,
        descripcion: textoFinal,
        nivel_urgencia: nivelUrgencia,
        pickedPoint,
      });
    }

    baseMensajeRef.current = '';
    finalizadoRef.current = '';
    parcialRef.current = '';
    setMensaje('');
    setEtiquetas([]);
    setReferencia('');
  }

  return (
    <section className="card">
      <div className="card-header">
        <div>
          <h2>Mensaje de Descripción del Incendio</h2>
          <p className="subtitle">
            Envía detalles sobre lo que observas para ayudar a los bomberos a responder mejor
          </p>
        </div>
      </div>

      {ultimoAviso ? (
        <div className="linked-report-banner">
          <div>
            <strong>Adjuntando al Reporte #{ultimoAviso.id_aviso}</strong>
            <span className="banner-sub"> — {ultimoAviso.ubicacion}</span>
          </div>
          <div className="item-actions">
            <StatusBadge value={ultimoAviso.estado_aviso} />
            <button
              type="button"
              className="btn-secondary"
              onClick={onDesvincularAviso}
              disabled={loading}
            >
              Nuevo reporte
            </button>
          </div>
        </div>
      ) : (
        <div className="gps-status">
          Si ya enviaste una alerta SOS, el mensaje se adjuntará automáticamente; si no, se enviará un nuevo aviso con tu ubicación actual o punto del mapa.
        </div>
      )}

      <div className="obs-chips" role="group" aria-label="Observaciones rápidas del incendio">
        {OBSERVACIONES_RAPIDAS.map((tag) => {
          const active = etiquetas.includes(tag);
          return (
            <button
              key={tag}
              type="button"
              className={`obs-chip ${active ? 'selected' : ''}`}
              onClick={() => toggleEtiqueta(tag)}
              disabled={loading}
            >
              {active ? `✓ ${tag}` : `+ ${tag}`}
            </button>
          );
        })}
      </div>

      <form className="stack-form" onSubmit={handleSubmit}>
        <div className="voice-toolbar">
          <button
            type="button"
            className={escuchando ? 'btn-voice-active' : 'btn-secondary'}
            onClick={toggleDictado}
            disabled={loading}
            title={
              vozSoportada
                ? 'Dictar descripción del incendio con tu micrófono'
                : 'Dictado por voz no disponible en este navegador'
            }
          >
            {estadoVoz === 'starting'
              ? '⏳ Iniciando micrófono...'
              : escuchando
              ? '⏹️ Detener dictado'
              : '🎙️ Dictar por voz'}
          </button>
          {estadoVoz === 'starting' && (
            <span className="voice-live-hint">
              Solicitando acceso al micrófono...
            </span>
          )}
          {estadoVoz === 'listening' && (
            <span className="voice-live-hint">
              Micrófono activo — habla ahora
            </span>
          )}
          {estadoVoz === 'speech' && (
            <span className="voice-live-hint">
              Escuchando tu voz... {vozParcial ? `"${vozParcial}"` : ''}
            </span>
          )}
          {!vozSoportada && !escuchando && (
            <span className="banner-sub">
              Dictado por voz no compatible con este navegador (usa Chrome/Edge).
            </span>
          )}
        </div>

        {vozError && <div className="alert-warn">{vozError}</div>}

        <textarea
          rows={4}
          className="textarea-field"
          placeholder="Describe el incendio: altura de llamas, color/dirección del humo, si hay casas o personas cerca, referencias de camino..."
          value={mensaje}
          onChange={(e) => {
            const val = e.target.value;
            setMensaje(val);
            baseMensajeRef.current = val;
            finalizadoRef.current = '';
            parcialRef.current = '';
            setVozParcial('');
          }}
        />

        <div className="form-grid">
          {!ultimoAviso && (
            <input
              type="text"
              placeholder="Referencia del lugar (opcional si usas GPS/mapa)"
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
            />
          )}
          <select
            value={nivelUrgencia}
            onChange={(e) => setNivelUrgencia(e.target.value)}
            aria-label="Nivel de urgencia observado"
          >
            {URGENCIAS.map((u) => (
              <option key={u} value={u}>
                Urgencia percibida: {u}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={loading || (!mensaje.trim() && etiquetas.length === 0)}
          >
            ✉️ Enviar Mensaje de Descripción
          </button>
        </div>
      </form>

      {ultimoAviso?.descripcion && (
        <div className="sent-description-box">
          <span className="kpi-label">Descripción registrada en tu reporte #{ultimoAviso.id_aviso}:</span>
          <p className="sent-description-text">{ultimoAviso.descripcion}</p>
        </div>
      )}
    </section>
  );
}
