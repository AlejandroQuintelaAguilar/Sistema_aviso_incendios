"""Pruebas de integración y reglas de negocio para el módulo de Incidentes."""

import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app import create_app
from app.config.database import db
from app.models.estacion import Estacion
from app.models.referencias import (
    AlertaPreventivaRef,
    BrigadaMiembroRef,
    BrigadaRef,
    InspeccionRef,
    PersonaRef,
    ZonaRiesgoRef,
)


class IncidentesModuleTestCase(unittest.TestCase):
    """Prueba endpoints y reglas SOLID del módulo de incidentes de forma aislada."""

    def setUp(self) -> None:
        self.app = create_app(
            {
                "TESTING": True,
                "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
            }
        )
        self.client = self.app.test_client()
        self.ctx = self.app.app_context()
        self.ctx.push()
        db.create_all()
        self._seed_referencias()

    def tearDown(self) -> None:
        db.session.remove()
        db.drop_all()
        self.ctx.pop()

    def _seed_referencias(self) -> None:
        db.session.add_all(
            [
                PersonaRef(
                    id_persona=1,
                    nombres="Ana",
                    apellidos="Roca",
                    tipo_persona="CIUDADANO",
                ),
                PersonaRef(
                    id_persona=2,
                    nombres="Lucía",
                    apellidos="Fernández",
                    tipo_persona="OPERADOR",
                ),
                PersonaRef(
                    id_persona=3,
                    nombres="Jorge",
                    apellidos="Salazar",
                    tipo_persona="BOMBERO",
                ),
                ZonaRiesgoRef(
                    id_zona=1,
                    nombre="Parque Tunari",
                    ubicacion="-17.31, -66.18",
                    nivel_riesgo="ALTO",
                ),
                Estacion(
                    id_estacion=1,
                    nombre="Estación Sur",
                    direccion="Av. Petrolera (-17.4200, -66.1500)",
                ),
                BrigadaRef(
                    id_brigada=1,
                    nombre="Brigada Puma",
                    estado="ACTIVA",
                    id_estacion=1,
                ),
                BrigadaRef(
                    id_brigada=2,
                    nombre="Brigada Cóndor",
                    estado="DESCANSO",
                    id_estacion=1,
                ),
            ]
        )
        db.session.commit()

    def test_flujo_avisos_y_transiciones(self) -> None:
        resp = self.client.post(
            "/api/avisos",
            json={
                "id_ciudadano": 1,
                "ubicacion": "Cerro San Pedro",
                "descripcion": "Humo denso",
                "nivel_urgencia": "ALTO",
            },
        )
        self.assertEqual(resp.status_code, 201)
        aviso = resp.get_json()["data"]
        self.assertEqual(aviso["estado_aviso"], "PENDIENTE")

        # Transición válida a DESCARTADO
        resp_desc = self.client.patch(
            f"/api/avisos/{aviso['id_aviso']}/estado",
            json={"estado_aviso": "DESCARTADO"},
        )
        self.assertEqual(resp_desc.status_code, 200)
        self.assertEqual(resp_desc.get_json()["data"]["estado_aviso"], "DESCARTADO")

        # Transición inválida desde DESCARTADO
        resp_inv = self.client.patch(
            f"/api/avisos/{aviso['id_aviso']}/estado",
            json={"estado_aviso": "VERIFICADO"},
        )
        self.assertEqual(resp_inv.status_code, 409)

        # No permitir crear incidente desde aviso DESCARTADO
        resp_inc = self.client.post(
            "/api/incidentes",
            json={"id_aviso": aviso["id_aviso"], "ubicacion": "Cerro San Pedro"},
        )
        self.assertEqual(resp_inc.status_code, 409)

    def test_ciclo_completo_incidente_brigadas_informes_danos(self) -> None:
        # 1. Crear aviso y convertirlo en incidente
        aviso_resp = self.client.post(
            "/api/avisos",
            json={"ubicacion": "Tunari Km 5", "nivel_urgencia": "CRITICO"},
        )
        self.assertEqual(aviso_resp.status_code, 201)
        id_aviso = aviso_resp.get_json()["data"]["id_aviso"]

        inc_resp = self.client.post(
            "/api/incidentes",
            json={
                "id_aviso": id_aviso,
                "id_operador": 2,
                "id_zona": 1,
                "ubicacion": "Sector Tunari Km 5",
                "gravedad": "ALTA",
            },
        )
        self.assertEqual(inc_resp.status_code, 201)
        incidente = inc_resp.get_json()["data"]
        id_inc = incidente["id_incidente"]
        self.assertEqual(incidente["estado"], "ACTIVO")

        # El aviso asociado debe pasar a ATENDIDO
        aviso_check = self.client.get(f"/api/avisos/{id_aviso}").get_json()["data"]
        self.assertEqual(aviso_check["estado_aviso"], "ATENDIDO")

        # 2. Asignar brigada y evitar doble asignación activa
        asig_resp = self.client.post(
            f"/api/incidentes/{id_inc}/brigadas",
            json={"id_brigada": 1},
        )
        self.assertEqual(asig_resp.status_code, 201)
        self.assertEqual(asig_resp.get_json()["data"]["estado_asignacion"], "ASIGNADA")

        # No permitir asignar brigada no disponible (DESCANSO)
        no_disp = self.client.post(
            f"/api/incidentes/{id_inc}/brigadas",
            json={"id_brigada": 2},
        )
        self.assertEqual(no_disp.status_code, 409)

        dup_asig = self.client.post(
            f"/api/incidentes/{id_inc}/brigadas",
            json={"id_brigada": 1},
        )
        self.assertEqual(dup_asig.status_code, 409)

        # No permitir cerrar incidente sin informe de bombero (<<include>>)
        cierre_sin_informe = self.client.patch(
            f"/api/incidentes/{id_inc}/cerrar",
        )
        self.assertEqual(cierre_sin_informe.status_code, 409)

        # Actualizar estado de brigada
        upd_asig = self.client.patch(
            f"/api/incidentes/{id_inc}/brigadas/1/estado",
            json={"estado_asignacion": "EN_SITIO"},
        )
        self.assertEqual(upd_asig.status_code, 200)
        self.assertEqual(upd_asig.get_json()["data"]["estado_asignacion"], "EN_SITIO")

        # 3. Registrar informe de bombero
        inf_resp = self.client.post(
            f"/api/incidentes/{id_inc}/informes",
            json={
                "id_bombero": 3,
                "acciones": "Apertura de línea de defensa de 200m",
                "observaciones": "Viento moderado",
            },
        )
        self.assertEqual(inf_resp.status_code, 201)
        list_inf = self.client.get(f"/api/incidentes/{id_inc}/informes")
        self.assertEqual(len(list_inf.get_json()["data"]), 1)

        # 4. Evaluación de daños (1:1)
        eval_resp = self.client.post(
            f"/api/incidentes/{id_inc}/evaluacion-danos",
            json={
                "tipo_dano": "Vegetación nativa y pinos",
                "nivel_dano": "MODERADO",
                "costo_estimado": 15000.50,
            },
        )
        self.assertEqual(eval_resp.status_code, 201)
        self.assertEqual(eval_resp.get_json()["data"]["costo_estimado"], 15000.5)

        dup_eval = self.client.post(
            f"/api/incidentes/{id_inc}/evaluacion-danos",
            json={"tipo_dano": "Otro", "nivel_dano": "LEVE"},
        )
        self.assertEqual(dup_eval.status_code, 409)

        upd_eval = self.client.put(
            f"/api/incidentes/{id_inc}/evaluacion-danos",
            json={"nivel_dano": "SEVERO", "costo_estimado": 25000},
        )
        self.assertEqual(upd_eval.status_code, 200)
        self.assertEqual(upd_eval.get_json()["data"]["nivel_dano"], "SEVERO")

        # 5. Cerrar incidente y verificar fecha_cierre + bloqueo de brigadas
        cierre = self.client.patch(
            f"/api/incidentes/{id_inc}/estado",
            json={"estado": "CERRADO"},
        )
        self.assertEqual(cierre.status_code, 200)
        self.assertIsNotNone(cierre.get_json()["data"]["fecha_cierre"])

        reabrir = self.client.patch(
            f"/api/incidentes/{id_inc}/estado",
            json={"estado": "ACTIVO"},
        )
        self.assertEqual(reabrir.status_code, 409)

    def test_validaciones_y_no_encontrados(self) -> None:
        resp_bad = self.client.post("/api/avisos", json={"ubicacion": "   "})
        self.assertEqual(resp_bad.status_code, 400)

        resp_enum = self.client.post(
            "/api/incidentes",
            json={"ubicacion": "Zona X", "gravedad": "EXTREMA"},
        )
        self.assertEqual(resp_enum.status_code, 400)

        resp_404 = self.client.get("/api/incidentes/9999")
        self.assertEqual(resp_404.status_code, 404)

    def test_clasificacion_incidente_brigada_ocupada_y_referencias(self) -> None:
        refs = self.client.get("/api/incidentes/referencias")
        self.assertEqual(refs.status_code, 200)
        self.assertGreaterEqual(len(refs.get_json()["data"]["brigadas"]), 2)

        inc1 = self.client.post(
            "/api/incidentes",
            json={"ubicacion": "Sector A", "gravedad": "BAJA"},
        ).get_json()["data"]["id_incidente"]

        inc2 = self.client.post(
            "/api/incidentes",
            json={"ubicacion": "Sector B", "gravedad": "MEDIA"},
        ).get_json()["data"]["id_incidente"]

        # Clasificar/actualizar gravedad y zona del incidente 1
        upd = self.client.patch(
            f"/api/incidentes/{inc1}",
            json={"gravedad": "ALTA", "id_zona": 1},
        )
        self.assertEqual(upd.status_code, 200)
        self.assertEqual(upd.get_json()["data"]["gravedad"], "ALTA")
        self.assertEqual(upd.get_json()["data"]["id_zona"], 1)

        # Asignar brigada 1 a inc1 y verificar que no se puede asignar a inc2
        self.assertEqual(
            self.client.post(
                f"/api/incidentes/{inc1}/brigadas", json={"id_brigada": 1}
            ).status_code,
            201,
        )
        self.assertEqual(
            self.client.post(
                f"/api/incidentes/{inc2}/brigadas", json={"id_brigada": 1}
            ).status_code,
            409,
        )

    def test_geo_cercanos_autosugerencia_transaccional_autoliberacion_expediente(
        self,
    ) -> None:
        # 1. Crear aviso con lat/lng cercanas a Zona 1 (-17.31, -66.18)
        aviso_resp = self.client.post(
            "/api/avisos",
            json={
                "id_ciudadano": 1,
                "ubicacion": "Ladera Sur Tunari",
                "lat": -17.315,
                "lng": -66.182,
                "nivel_urgencia": "ALTO",
            },
        )
        self.assertEqual(aviso_resp.status_code, 201)
        aviso_data = aviso_resp.get_json()["data"]
        self.assertIsNotNone(aviso_data["coordenadas"])
        self.assertIn("Coord:", aviso_data["ubicacion"])

        # Detectar avisos cercanos dentro de 3 km
        cercanos = self.client.get(
            "/api/avisos/cercanos?lat=-17.316&lng=-66.183&radio_km=3"
        )
        self.assertEqual(cercanos.status_code, 200)
        self.assertEqual(len(cercanos.get_json()["data"]), 1)
        self.assertLessEqual(cercanos.get_json()["data"][0]["distancia_km"], 3.0)

        # 2. Crear incidente con coordenadas sin id_zona -> debe sugerir id_zona=1
        inc_resp = self.client.post(
            "/api/incidentes",
            json={
                "id_aviso": aviso_data["id_aviso"],
                "id_operador": 2,
                "ubicacion": "Quebrada Norte",
                "lat": -17.312,
                "lng": -66.185,
                "gravedad": "ALTA",
            },
        )
        self.assertEqual(inc_resp.status_code, 201)
        inc_data = inc_resp.get_json()["data"]
        self.assertEqual(inc_data["id_zona"], 1)
        id_inc = inc_data["id_incidente"]

        # 3. Asignar brigada 1 (ACTIVA)
        self.assertEqual(
            self.client.post(
                f"/api/incidentes/{id_inc}/brigadas", json={"id_brigada": 1}
            ).status_code,
            201,
        )

        # 4. Registrar informe con evaluación de daños embebida en la misma transacción
        inf_resp = self.client.post(
            f"/api/incidentes/{id_inc}/informes",
            json={
                "id_bombero": 3,
                "acciones": "Contención total del perímetro",
                "evidencia": "https://ejemplo.local/evidencia1.jpg",
                "evaluacion_danos": {
                    "tipo_dano": "Bosque de eucalipto",
                    "nivel_dano": "MODERADO",
                    "costo_estimado": 8500,
                    "descripcion": "2 hectáreas afectadas",
                },
            },
        )
        self.assertEqual(inf_resp.status_code, 201)

        eval_get = self.client.get(f"/api/incidentes/{id_inc}/evaluacion-danos")
        self.assertEqual(eval_get.status_code, 200)
        self.assertEqual(eval_get.get_json()["data"]["costo_estimado"], 8500.0)

        # 5. Cerrar incidente -> debe auto-liberar la brigada asignada
        cierre = self.client.patch(f"/api/incidentes/{id_inc}/cerrar")
        self.assertEqual(cierre.status_code, 200)
        brigadas_post = self.client.get(f"/api/incidentes/{id_inc}/brigadas").get_json()[
            "data"
        ]
        self.assertEqual(brigadas_post[0]["estado_asignacion"], "LIBERADA")

        # 6. Verificar expediente unificado + timeline y resumen operativo
        exp = self.client.get(f"/api/incidentes/{id_inc}/expediente")
        self.assertEqual(exp.status_code, 200)
        exp_data = exp.get_json()["data"]
        tipos_timeline = [e["tipo"] for e in exp_data["timeline"]]
        self.assertIn("AVISO_RECIBIDO", tipos_timeline)
        self.assertIn("INCIDENTE_APERTURADO", tipos_timeline)
        self.assertIn("BRIGADA_ASIGNADA", tipos_timeline)
        self.assertIn("INFORME_BOMBERO", tipos_timeline)
        self.assertIn("EVALUACION_DANOS", tipos_timeline)
        self.assertIn("INCIDENTE_CERRADO", tipos_timeline)

        resumen = self.client.get("/api/incidentes/resumen-operativo")
        self.assertEqual(resumen.status_code, 200)
        res_data = resumen.get_json()["data"]
        self.assertEqual(res_data["incidentes_por_estado"]["CERRADO"], 1)
        self.assertEqual(res_data["brigadas_desplegadas"], 0)
        self.assertEqual(res_data["costo_danos_estimado_total"], 8500.0)

    def test_reporte_sos_ciudadano_sin_login_gps_y_camara(self) -> None:
        sample_b64 = "data:image/jpeg;base64,/9j/4AAQSkZJRg=="
        resp = self.client.post(
            "/api/avisos",
            json={
                "lat": -17.314,
                "lng": -66.181,
                "nivel_urgencia": "CRITICO",
                "foto": sample_b64,
            },
        )
        self.assertEqual(resp.status_code, 201)
        data = resp.get_json()["data"]
        self.assertIsNone(data["id_ciudadano"])
        self.assertIn("Parque Tunari", data["ubicacion"])
        self.assertIn("Coord: -17.3140, -66.1810", data["ubicacion"])
        self.assertEqual(data["foto"], sample_b64)
        self.assertEqual(data["coordenadas"], {"lat": -17.314, "lng": -66.181})

    def test_enviar_mensaje_descripcion_incendio(self) -> None:
        sos = self.client.post(
            "/api/avisos",
            json={
                "lat": -17.314,
                "lng": -66.181,
                "descripcion": "Alerta SOS enviada en 1 toque sin sesión",
                "nivel_urgencia": "ALTO",
            },
        )
        self.assertEqual(sos.status_code, 201)
        id_aviso = sos.get_json()["data"]["id_aviso"]

        msg1 = self.client.patch(
            f"/api/avisos/{id_aviso}/descripcion",
            json={
                "descripcion": "Llamas visibles cerca de pinos",
                "nivel_urgencia": "CRITICO",
            },
        )
        self.assertEqual(msg1.status_code, 200)
        d1 = msg1.get_json()["data"]
        self.assertEqual(d1["descripcion"], "Llamas visibles cerca de pinos")
        self.assertEqual(d1["nivel_urgencia"], "CRITICO")

        msg2 = self.client.patch(
            f"/api/avisos/{id_aviso}/descripcion",
            json={"descripcion": "Viento fuerte hacia el este"},
        )
        self.assertEqual(msg2.status_code, 200)
        d2 = msg2.get_json()["data"]
        self.assertIn("Llamas visibles cerca de pinos", d2["descripcion"])
        self.assertIn("Viento fuerte hacia el este", d2["descripcion"])

        foto_resp = self.client.patch(
            f"/api/avisos/{id_aviso}/descripcion",
            json={"foto": "data:image/jpeg;base64,/9j/4AAQSkZJRg=="},
        )
        self.assertEqual(foto_resp.status_code, 200)
        self.assertEqual(
            foto_resp.get_json()["data"]["foto"],
            "data:image/jpeg;base64,/9j/4AAQSkZJRg==",
        )

    def test_agrupar_10_alarmas_triangulacion_y_consolidar_en_1_incidente(self) -> None:
        ids_creados = []
        for idx in range(10):
            lat = -17.3100 - (idx * 0.0008)
            lng = -66.1800 - (idx * 0.0008)
            resp = self.client.post(
                "/api/avisos",
                json={
                    "lat": round(lat, 4),
                    "lng": round(lng, 4),
                    "descripcion": f"Alarma ciudadana #{idx + 1} en sector Tunari",
                    "nivel_urgencia": "CRITICO" if idx == 0 else "ALTO",
                },
            )
            self.assertEqual(resp.status_code, 201)
            ids_creados.append(resp.get_json()["data"]["id_aviso"])

        agrupados_resp = self.client.get("/api/avisos/agrupados?radio_km=2.5")
        self.assertEqual(agrupados_resp.status_code, 200)
        grupos = agrupados_resp.get_json()["data"]
        self.assertEqual(len(grupos), 1)
        self.assertEqual(grupos[0]["cantidad_avisos"], 10)
        self.assertEqual(grupos[0]["nivel_urgencia_max"], "CRITICO")
        self.assertIsNotNone(grupos[0]["centroide"])

        consolidar_resp = self.client.post(
            "/api/avisos/consolidar-grupo",
            json={"ids_avisos": ids_creados},
        )
        self.assertEqual(consolidar_resp.status_code, 201)
        cons_data = consolidar_resp.get_json()["data"]
        self.assertEqual(cons_data["avisos_consolidados"], 10)
        self.assertEqual(cons_data["incidente"]["gravedad"], "CATASTROFICA")
        self.assertIn("Zona Triangulada (10 alarmas)", cons_data["incidente"]["ubicacion"])

        # Verificar que ya no quedan grupos pendientes
        agrupados_post = self.client.get("/api/avisos/agrupados?radio_km=2.5")
        self.assertEqual(len(agrupados_post.get_json()["data"]), 0)

    def test_bloqueo_informe_y_danos_en_cerrado_y_filtro_q(self) -> None:
        inc_a = self.client.post(
            "/api/incidentes",
            json={"ubicacion": "Quebrada Pintumayu", "gravedad": "MEDIA"},
        ).get_json()["data"]["id_incidente"]
        inc_b = self.client.post(
            "/api/incidentes",
            json={"ubicacion": "Bosque Pairumani", "gravedad": "ALTA"},
        ).get_json()["data"]["id_incidente"]

        # Filtro ?q= por texto y por #id
        por_texto = self.client.get("/api/incidentes?q=Pintumayu").get_json()["data"]
        self.assertEqual(len(por_texto), 1)
        self.assertEqual(por_texto[0]["id_incidente"], inc_a)

        por_id = self.client.get(f"/api/incidentes?q=%23{inc_b}").get_json()["data"]
        self.assertEqual(len(por_id), 1)
        self.assertEqual(por_id[0]["id_incidente"], inc_b)

        # Registrar 1 informe y cerrar inc_a
        self.assertEqual(
            self.client.post(
                f"/api/incidentes/{inc_a}/informes",
                json={"id_bombero": 3, "acciones": "Control inicial"},
            ).status_code,
            201,
        )
        self.assertEqual(
            self.client.patch(f"/api/incidentes/{inc_a}/cerrar").status_code, 200
        )

        # No permitir nuevos informes ni evaluación de daños tras el cierre
        inf_cerrado = self.client.post(
            f"/api/incidentes/{inc_a}/informes",
            json={"id_bombero": 3, "acciones": "Intento tardío"},
        )
        self.assertEqual(inf_cerrado.status_code, 409)

        eval_cerrado = self.client.post(
            f"/api/incidentes/{inc_a}/evaluacion-danos",
            json={"tipo_dano": "Pastizal", "nivel_dano": "LEVE", "costo_estimado": 100},
        )
        self.assertEqual(eval_cerrado.status_code, 409)

    def test_referencias_enriquecidas_y_despacho_sugerido_por_cercania(self) -> None:
        # Agregar sub-estación cercana (id_estacion=2) y tercera brigada; id_estacion=1 ya existe en _seed_referencias
        est_cercana = Estacion(
            id_estacion=2,
            nombre="Sub-estación Tunari",
            direccion="Acceso Tunari (-17.3180, -66.1820)",
        )
        db.session.add(est_cercana)

        b1 = db.session.get(BrigadaRef, 1)
        b1.motivo_estado = "Base Sur lista"

        b3 = BrigadaRef(
            id_brigada=3,
            nombre="Brigada Tunari Alfa",
            estado="ACTIVA",
            motivo_estado="Guardia Tunari",
            id_estacion=2,
        )
        db.session.add(b3)
        db.session.add_all(
            [
                BrigadaMiembroRef(
                    id_brigada=3,
                    id_persona=3,
                    rol_en_brigada="JEFE_CUADRILLA",
                    estado="ACTIVO",
                ),
                BrigadaMiembroRef(
                    id_brigada=1,
                    id_persona=2,
                    rol_en_brigada="JEFE_CUADRILLA",
                    estado="ACTIVO",
                ),
            ]
        )
        db.session.commit()

        # Incidente cercano a Sub-estación Tunari (-17.3140, -66.1840)
        inc_tunari = self.client.post(
            "/api/incidentes",
            json={
                "ubicacion": "Parque Tunari Sector Norte",
                "lat": -17.3140,
                "lng": -66.1840,
                "gravedad": "ALTA",
            },
        ).get_json()["data"]["id_incidente"]

        # Referencias enriquecidas
        refs = self.client.get("/api/incidentes/referencias").get_json()["data"]
        self.assertEqual(len(refs["estaciones_geo"]), 2)
        b3_ref = next(b for b in refs["brigadas"] if b["id_brigada"] == 3)
        self.assertTrue(b3_ref["disponible"])
        self.assertEqual(b3_ref["cantidad_miembros"], 1)
        self.assertEqual(b3_ref["jefe_cuadrilla"], "Jorge Salazar")
        self.assertEqual(b3_ref["estacion_nombre"], "Sub-estación Tunari")
        self.assertIsNotNone(b3_ref["estacion_coordenadas"])

        # Despacho sugerido debe recomendar primero a Brigada 3 (más cercana)
        sug_resp = self.client.get(f"/api/incidentes/{inc_tunari}/despacho-sugerido")
        self.assertEqual(sug_resp.status_code, 200)
        sug = sug_resp.get_json()["data"]
        self.assertEqual(sug["meta_brigadas"], 2)
        self.assertEqual(sug["faltantes"], 2)
        self.assertEqual(sug["brigada_recomendada"]["id_brigada"], 3)
        self.assertLess(
            sug["brigada_recomendada"]["distancia_km"],
            next(b for b in sug["brigadas"] if b["id_brigada"] == 1)["distancia_km"],
        )
        self.assertGreaterEqual(sug["brigada_recomendada"]["eta_min"], 3)

        # Ocupar Brigada 3 en otro incidente -> debe dejar de estar disponible en referencias y sugerencia
        inc_otro = self.client.post(
            "/api/incidentes",
            json={"ubicacion": "Valle Alto", "gravedad": "MEDIA"},
        ).get_json()["data"]["id_incidente"]
        self.assertEqual(
            self.client.post(
                f"/api/incidentes/{inc_otro}/brigadas", json={"id_brigada": 3}
            ).status_code,
            201,
        )

        refs_post = self.client.get("/api/incidentes/referencias").get_json()["data"]
        b3_post = next(b for b in refs_post["brigadas"] if b["id_brigada"] == 3)
        self.assertFalse(b3_post["disponible"])
        self.assertEqual(b3_post["ocupada_en_incidente"], inc_otro)

        sug_post = self.client.get(
            f"/api/incidentes/{inc_tunari}/despacho-sugerido"
        ).get_json()["data"]
        self.assertEqual(sug_post["brigada_recomendada"]["id_brigada"], 1)

    def test_validar_y_descartar_aviso_con_motivo(self) -> None:
        av1 = self.client.post(
            "/api/avisos",
            json={
                "ubicacion": "Valle Alto Km 12",
                "descripcion": "Columna de humo reportada",
                "nivel_urgencia": "MEDIO",
            },
        ).get_json()["data"]["id_aviso"]

        resp_desc = self.client.patch(
            f"/api/avisos/{av1}/estado",
            json={
                "estado_aviso": "DESCARTADO",
                "motivo": "Quema agrícola controlada",
            },
        )
        self.assertEqual(resp_desc.status_code, 200)
        av1_data = resp_desc.get_json()["data"]
        self.assertEqual(av1_data["estado_aviso"], "DESCARTADO")
        self.assertIn("[Motivo de descarte: Quema agrícola controlada]", av1_data["descripcion"])

        av2 = self.client.post(
            "/api/avisos",
            json={"ubicacion": "Cerro San Pedro", "nivel_urgencia": "ALTO"},
        ).get_json()["data"]["id_aviso"]

        resp_ver = self.client.patch(
            f"/api/avisos/{av2}/estado",
            json={
                "estado_aviso": "VERIFICADO",
                "motivo": "Confirmado por cámara municipal",
            },
        )
        self.assertEqual(resp_ver.status_code, 200)
        av2_data = resp_ver.get_json()["data"]
        self.assertEqual(av2_data["estado_aviso"], "VERIFICADO")
        self.assertIn("[Verificación CAD: Confirmado por cámara municipal]", av2_data["descripcion"])

    def test_historial_avisos_ciudadano_y_seguimiento_estado(self) -> None:
        a1 = self.client.post(
            "/api/avisos",
            json={
                "id_ciudadano": 1,
                "lat": -17.315,
                "lng": -66.182,
                "descripcion": "Humo detrás del parque",
                "nivel_urgencia": "ALTO",
            },
        ).get_json()["data"]["id_aviso"]

        a2 = self.client.post(
            "/api/avisos",
            json={
                "id_ciudadano": 1,
                "lat": -17.319,
                "lng": -66.186,
                "descripcion": "Fuego en pastizal cercano",
                "nivel_urgencia": "CRITICO",
            },
        ).get_json()["data"]["id_aviso"]

        a_anon = self.client.post(
            "/api/avisos",
            json={
                "lat": -17.330,
                "lng": -66.190,
                "descripcion": "Alerta anónima en carretera",
                "nivel_urgencia": "MEDIO",
            },
        ).get_json()["data"]["id_aviso"]

        resp_mios = self.client.get("/api/avisos/mios?id_ciudadano=1")
        self.assertEqual(resp_mios.status_code, 200)
        mios = resp_mios.get_json()["data"]
        self.assertEqual([item["id_aviso"] for item in mios], [a2, a1])
        self.assertNotIn(a_anon, [item["id_aviso"] for item in mios])

        # Transición de estado PENDIENTE -> VERIFICADO -> ATENDIDO y seguimiento vivo
        self.assertEqual(
            self.client.patch(
                f"/api/avisos/{a1}/estado", json={"estado_aviso": "VERIFICADO"}
            ).status_code,
            200,
        )
        self.assertEqual(
            self.client.patch(
                f"/api/avisos/{a1}/estado", json={"estado_aviso": "ATENDIDO"}
            ).status_code,
            200,
        )

        # Consulta pública individual (SOS anónimo / seguimiento directo)
        seguimiento_ind = self.client.get(f"/api/avisos/{a1}")
        self.assertEqual(seguimiento_ind.status_code, 200)
        self.assertEqual(seguimiento_ind.get_json()["data"]["estado_aviso"], "ATENDIDO")

        # Consulta historial ciudadano
        mios_post = self.client.get("/api/avisos/mios?id_ciudadano=1").get_json()["data"]
        a1_post = next(item for item in mios_post if item["id_aviso"] == a1)
        self.assertEqual(a1_post["estado_aviso"], "ATENDIDO")

    def test_buscar_avisos_por_texto_y_folio(self) -> None:
        a1 = self.client.post(
            "/api/avisos",
            json={
                "ubicacion": "Quebrada Tiquipaya",
                "descripcion": "[Canal: Llamada 119 / Teléfono] Columna de humo visible",
                "nivel_urgencia": "ALTO",
            },
        ).get_json()["data"]["id_aviso"]
        a2 = self.client.post(
            "/api/avisos",
            json={
                "ubicacion": "Loma Sacaba",
                "descripcion": "[Canal: Radio VHF / Estación] Quema de pastizal",
                "nivel_urgencia": "MEDIO",
            },
        ).get_json()["data"]["id_aviso"]

        por_ubi = self.client.get("/api/avisos?q=Tiquipaya").get_json()["data"]
        self.assertEqual([x["id_aviso"] for x in por_ubi], [a1])

        por_desc = self.client.get("/api/avisos?q=Llamada%20119").get_json()["data"]
        self.assertEqual([x["id_aviso"] for x in por_desc], [a1])

        por_folio = self.client.get(f"/api/avisos?q=%23{a2}").get_json()["data"]
        self.assertEqual([x["id_aviso"] for x in por_folio], [a2])

    def test_sincronizacion_estado_brigadas_al_asignar_liberar_y_cerrar(self) -> None:
        inc_a = self.client.post(
            "/api/incidentes",
            json={"ubicacion": "Quebrada Pintumayu", "gravedad": "ALTA"},
        ).get_json()["data"]["id_incidente"]
        inc_b = self.client.post(
            "/api/incidentes",
            json={"ubicacion": "Ladera Sacaba", "gravedad": "MEDIA"},
        ).get_json()["data"]["id_incidente"]

        # 1. Al asignar brigada ACTIVA -> debe pasar a EN_OPERACION en brigadas
        asig_a = self.client.post(
            f"/api/incidentes/{inc_a}/brigadas", json={"id_brigada": 1}
        )
        self.assertEqual(asig_a.status_code, 201)
        b1 = db.session.get(BrigadaRef, 1)
        self.assertEqual(b1.estado, "EN_OPERACION")
        self.assertIn(f"Incidente #{inc_a}", b1.motivo_estado or "")

        # 2. Al liberar asignación -> debe regresar a ACTIVA
        lib_a = self.client.patch(
            f"/api/incidentes/{inc_a}/brigadas/1/estado",
            json={"estado_asignacion": "LIBERADA"},
        )
        self.assertEqual(lib_a.status_code, 200)
        db.session.expire_all()
        b1 = db.session.get(BrigadaRef, 1)
        self.assertEqual(b1.estado, "ACTIVA")

        # 3. Al asignar a inc_b, registrar informe y cerrar inc_b -> auto-libera y vuelve a ACTIVA
        self.assertEqual(
            self.client.post(
                f"/api/incidentes/{inc_b}/brigadas", json={"id_brigada": 1}
            ).status_code,
            201,
        )
        self.assertEqual(
            db.session.get(BrigadaRef, 1).estado, "EN_OPERACION"
        )
        self.assertEqual(
            self.client.post(
                f"/api/incidentes/{inc_b}/informes",
                json={"id_bombero": 3, "acciones": "Liquidación completa"},
            ).status_code,
            201,
        )
        self.assertEqual(
            self.client.patch(f"/api/incidentes/{inc_b}/cerrar").status_code, 200
        )

        db.session.expire_all()
        self.assertEqual(db.session.get(BrigadaRef, 1).estado, "ACTIVA")

        # 4. Expediente y referencias enriquecidas
        exp = self.client.get(f"/api/incidentes/{inc_b}/expediente").get_json()["data"]
        self.assertEqual(exp["brigadas"][0]["estacion_nombre"], "Estación Sur")
        self.assertEqual(exp["brigadas"][0]["cantidad_miembros"], 0)

        refs = self.client.get("/api/incidentes/referencias").get_json()["data"]
        b1_ref = next(b for b in refs["brigadas"] if b["id_brigada"] == 1)
        self.assertIn("jefe_cuadrilla_id", b1_ref)
        self.assertEqual(b1_ref["invitaciones_pendientes"], 0)

    def test_satelite_firms_sin_clave_simulacion_y_parseo_csv_con_cache(self) -> None:
        from app.services.firms_service import FirmsService, limpiar_cache_firms

        limpiar_cache_firms()

        # 1. Sin MAP_KEY -> responde estado_fuente='sin_clave' sin romper el mapa
        with patch.dict(os.environ, {"NASA_FIRMS_MAP_KEY": ""}, clear=False):
            resp_sin_clave = self.client.get("/api/incidentes/satelite-firms")
            self.assertEqual(resp_sin_clave.status_code, 200)
            data_sin = resp_sin_clave.get_json()["data"]
            self.assertEqual(data_sin["estado_fuente"], "sin_clave")
            self.assertFalse(data_sin["configurado"])
            self.assertEqual(data_sin["focos"], [])

        # 2. Pasada simulada con cruce geográfico real contra aviso e incidente local
        self.client.post(
            "/api/avisos",
            json={
                "ubicacion": "Ladera Norte Tunari",
                "lat": -17.3140,
                "lng": -66.1835,
                "nivel_urgencia": "ALTO",
            },
        )
        self.client.post(
            "/api/incidentes",
            json={
                "ubicacion": "Reserva Serranía Sector Alto",
                "lat": -17.2112,
                "lng": -66.2940,
                "gravedad": "ALTA",
            },
        )

        resp_sim = self.client.get("/api/incidentes/satelite-firms?simulado=1")
        self.assertEqual(resp_sim.status_code, 200)
        sim_data = resp_sim.get_json()["data"]
        self.assertEqual(sim_data["estado_fuente"], "simulacion")
        self.assertTrue(sim_data["es_simulado"])
        self.assertEqual(len(sim_data["focos"]), 4)
        correlaciones = [f["correlacion"] for f in sim_data["focos"]]
        self.assertIn("AVISO_EN_TRIAGE", correlaciones)
        self.assertIn("INCIDENTE_ACTIVO", correlaciones)
        self.assertEqual(correlaciones.count("FOCO_NO_REPORTADO"), 2)

        # 3. Parseo CSV real + caché en memoria (segunda consulta no vuelve a descargar)
        csv_ejemplo = (
            "latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight\n"
            "-17.3125,-66.1842,368.15,0.4,0.4,2026-11-23,1830,N20,VIIRS,h,2.0NRT,301.2,42.5,D\n"
        )
        with (
            patch.dict(os.environ, {"NASA_FIRMS_MAP_KEY": "TEST_KEY"}, clear=False),
            patch.object(FirmsService, "_descargar_csv", return_value=csv_ejemplo) as mock_dl,
        ):
            r1 = self.client.get("/api/incidentes/satelite-firms")
            self.assertEqual(r1.status_code, 200)
            d1 = r1.get_json()["data"]
            self.assertEqual(d1["estado_fuente"], "en_vivo")
            self.assertEqual(len(d1["focos"]), 1)
            foco = d1["focos"][0]
            self.assertEqual(foco["temperatura_brillo_c"], 95.0)
            self.assertEqual(foco["confianza"], "ALTA")
            self.assertEqual(foco["frp_mw"], 42.5)
            self.assertEqual(mock_dl.call_count, 1)

            r2 = self.client.get("/api/incidentes/satelite-firms")
            self.assertEqual(r2.status_code, 200)
            d2 = r2.get_json()["data"]
            self.assertEqual(d2["estado_fuente"], "cache")
            self.assertEqual(len(d2["focos"]), 1)
            self.assertEqual(mock_dl.call_count, 1)

    def test_integracion_zonas_riesgo_poligono_clima_inactiva_e_inspecciones(self) -> None:
        from app.services.referencias_service import SQLAlchemyReferenciaValidator

        zona_poly = ZonaRiesgoRef(
            id_zona=10,
            nombre="Valle Sur Poligonal",
            ubicacion="Coord: -17.5500, -66.1000",
            nivel_riesgo="EXTREMO",
            estado="Alerta Emitida",
            tipo_vegetacion="Bosque seco",
            area_hectareas=420.0,
            temperatura=33.5,
            humedad=22.0,
            velocidad_viento=36.0,
            coordenadas=[
                {"lat": -17.54, "lng": -66.11},
                {"lat": -17.54, "lng": -66.09},
                {"lat": -17.56, "lng": -66.09},
                {"lat": -17.56, "lng": -66.11},
            ],
        )
        zona_inactiva = ZonaRiesgoRef(
            id_zona=11,
            nombre="Zona Suspendida",
            ubicacion="-17.60, -66.20",
            nivel_riesgo="BAJO",
            estado="Inactiva",
        )
        db.session.add_all([zona_poly, zona_inactiva])
        db.session.flush()

        db.session.add(
            AlertaPreventivaRef(
                id_zona=10,
                nivel_alerta="Roja",
                mensaje="Riesgo extremo 30-30-30 vigente",
            )
        )
        db.session.add(
            InspeccionRef(
                id_zona=10,
                id_inspector=3,
                nivel_riesgo_observado="EXTREMO",
                observaciones="Material combustible seco en laderas",
                recomendaciones="Priorizar ataque aéreo",
            )
        )
        db.session.commit()

        # 1. Sugerencia detecta el punto dentro del polígono (distancia 0.0 km)
        sug = SQLAlchemyReferenciaValidator().sugerir_zona_cercana(-17.55, -66.10)
        self.assertIsNotNone(sug)
        self.assertEqual(sug["id_zona"], 10)
        self.assertEqual(sug["distancia_km"], 0.0)
        self.assertTrue(sug["en_poligono"])

        # 2. Zona Inactiva rechaza nuevos incidentes con 409
        res_inactiva = self.client.post(
            "/api/incidentes",
            json={
                "ubicacion": "Sector oeste -17.60, -66.20",
                "id_zona": 11,
                "gravedad": "BAJA",
            },
        )
        self.assertEqual(res_inactiva.status_code, 409)

        # 3. Referencias, Expediente y Resumen exponen geometría, clima, alerta COE e inspección
        refs = self.client.get("/api/incidentes/referencias").get_json()["data"]
        z10 = next(z for z in refs["zonas"] if z["id_zona"] == 10)
        self.assertEqual(len(z10["poligono"]), 4)
        self.assertEqual(z10["temperatura"], 33.5)
        self.assertEqual(z10["alerta_preventiva"]["nivel_alerta"], "Roja")
        self.assertEqual(z10["ultima_inspeccion"]["recomendaciones"], "Priorizar ataque aéreo")

        inc = self.client.post(
            "/api/incidentes",
            json={"ubicacion": "Foco Valle Sur -17.55, -66.10", "gravedad": "ALTA"},
        ).get_json()["data"]
        self.assertEqual(inc["id_zona"], 10)

        exp = self.client.get(f"/api/incidentes/{inc['id_incidente']}/expediente").get_json()["data"]
        self.assertEqual(exp["zona"]["tipo_vegetacion"], "Bosque seco")
        self.assertEqual(exp["zona"]["alerta_preventiva"]["nivel_alerta"], "Roja")

        resumen = self.client.get("/api/incidentes/resumen-operativo").get_json()["data"]
        self.assertEqual(resumen["zonas_con_alerta_coe"], 1)
        self.assertGreaterEqual(resumen["zonas_criticas"], 2)

    def test_reverse_geocode_nominatim_y_ubicacion_legible(self) -> None:
        from app.utils import geo_utils

        geo_utils.limpiar_cache_reverse_geocode()
        mock_payload = {
            "address": {
                "road": "Avenida América",
                "neighbourhood": "Cala Cala",
                "city": "Cochabamba",
                "state": "Cochabamba",
            }
        }

        with patch.object(
            geo_utils, "_consultar_nominatim_json", return_value=mock_payload
        ) as mock_nom:
            dir_resuelta = geo_utils.reverse_geocode_ubicacion(
                -17.3720, -66.1560, allow_in_testing=True
            )
            self.assertEqual(dir_resuelta, "Avenida América, Cala Cala, Cochabamba")
            # Segunda consulta cercana debe salir de caché sin volver a consultar HTTP
            dir_cache = geo_utils.reverse_geocode_ubicacion(
                -17.3721, -66.1561, allow_in_testing=True
            )
            self.assertEqual(dir_cache, "Avenida América, Cala Cala, Cochabamba")
            self.assertEqual(mock_nom.call_count, 1)

        with patch(
            "app.services.aviso_service.reverse_geocode_ubicacion",
            return_value="Avenida América, Cala Cala, Cochabamba",
        ):
            resp_av = self.client.post(
                "/api/avisos",
                json={"lat": -17.3720, "lng": -66.1560, "nivel_urgencia": "ALTO"},
            )
            self.assertEqual(resp_av.status_code, 201)
            av = resp_av.get_json()["data"]
            self.assertIn("Avenida América, Cala Cala, Cochabamba", av["ubicacion"])
            self.assertIn("Coord: -17.3720, -66.1560", av["ubicacion"])
            self.assertIn("Avenida América, Cala Cala, Cochabamba", av["ubicacion_legible"])
            self.assertNotIn("Coord:", av["ubicacion_legible"])

            # Al convertir a incidente pasando solo la ubicación legible, mantiene coordenadas
            resp_inc = self.client.post(
                "/api/incidentes",
                json={
                    "id_aviso": av["id_aviso"],
                    "ubicacion": av["ubicacion_legible"],
                    "gravedad": "ALTA",
                },
            )
            self.assertEqual(resp_inc.status_code, 201)
            inc = resp_inc.get_json()["data"]
            self.assertEqual(inc["coordenadas"]["lat"], -17.372)
            self.assertEqual(inc["ubicacion_legible"], av["ubicacion_legible"])

    def test_crear_incidente_directo_solo_con_coordenadas_del_mapa(self) -> None:
        with patch(
            "app.services.incidente_service.reverse_geocode_ubicacion",
            return_value="Avenida Heroínas, Centro, Cochabamba",
        ):
            resp = self.client.post(
                "/api/incidentes",
                json={"lat": -17.3935, "lng": -66.1570, "gravedad": "ALTA"},
            )
            self.assertEqual(resp.status_code, 201)
            inc = resp.get_json()["data"]
            self.assertEqual(inc["coordenadas"], {"lat": -17.3935, "lng": -66.157})
            self.assertIn("Avenida Heroínas, Centro, Cochabamba", inc["ubicacion_legible"])
            self.assertNotIn("Coord:", inc["ubicacion_legible"])
            self.assertIn("Coord: -17.3935, -66.1570", inc["ubicacion"])


if __name__ == "__main__":
    unittest.main()
