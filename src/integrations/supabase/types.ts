export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      _backup_eliminacion_captura_prueba: {
        Row: {
          created_at: string
          eliminado_at: string
          eliminado_por: string | null
          id: string
          motivo_eliminacion: string
          payload: Json
          registro_id: string
          tabla_origen: string
        }
        Insert: {
          created_at?: string
          eliminado_at?: string
          eliminado_por?: string | null
          id?: string
          motivo_eliminacion: string
          payload: Json
          registro_id: string
          tabla_origen: string
        }
        Update: {
          created_at?: string
          eliminado_at?: string
          eliminado_por?: string | null
          id?: string
          motivo_eliminacion?: string
          payload?: Json
          registro_id?: string
          tabla_origen?: string
        }
        Relationships: []
      }
      _backup_normalizacion_estado_qc: {
        Row: {
          autorizado_por: string | null
          capturado_at: string | null
          dictamen: string | null
          estado: string | null
          estado_nuevo: string | null
          estatus_liberacion: string | null
          id: string
          numero_rollo: string | null
          respaldado_at: string
        }
        Insert: {
          autorizado_por?: string | null
          capturado_at?: string | null
          dictamen?: string | null
          estado?: string | null
          estado_nuevo?: string | null
          estatus_liberacion?: string | null
          id: string
          numero_rollo?: string | null
          respaldado_at?: string
        }
        Update: {
          autorizado_por?: string | null
          capturado_at?: string | null
          dictamen?: string | null
          estado?: string | null
          estado_nuevo?: string | null
          estatus_liberacion?: string | null
          id?: string
          numero_rollo?: string | null
          respaldado_at?: string
        }
        Relationships: []
      }
      _backup_sufijo_numero_rollo: {
        Row: {
          capturado_at: string | null
          created_at: string
          id: string
          maquina_id: string
          numero_rollo_anterior: string
          numero_rollo_nuevo: string
          operador: string | null
        }
        Insert: {
          capturado_at?: string | null
          created_at?: string
          id: string
          maquina_id: string
          numero_rollo_anterior: string
          numero_rollo_nuevo: string
          operador?: string | null
        }
        Update: {
          capturado_at?: string | null
          created_at?: string
          id?: string
          maquina_id?: string
          numero_rollo_anterior?: string
          numero_rollo_nuevo?: string
          operador?: string | null
        }
        Relationships: []
      }
      _excepciones_normalizacion_estado_qc: {
        Row: {
          autorizado_por: string | null
          capturado_at: string | null
          detectado_at: string
          dictamen: string | null
          estado: string | null
          estatus_liberacion: string | null
          id: string
          motivo_excepcion: string
          numero_rollo: string | null
        }
        Insert: {
          autorizado_por?: string | null
          capturado_at?: string | null
          detectado_at?: string
          dictamen?: string | null
          estado?: string | null
          estatus_liberacion?: string | null
          id: string
          motivo_excepcion: string
          numero_rollo?: string | null
        }
        Update: {
          autorizado_por?: string | null
          capturado_at?: string | null
          detectado_at?: string
          dictamen?: string | null
          estado?: string | null
          estatus_liberacion?: string | null
          id?: string
          motivo_excepcion?: string
          numero_rollo?: string | null
        }
        Relationships: []
      }
      _excepciones_sufijo_numero_rollo: {
        Row: {
          capturado_at: string | null
          estatus_revision: string
          id: string
          maquina_id: string
          motivo_exclusion: string
          motivo_revision: string | null
          numero_rollo_actual: string
          numero_rollo_propuesto: string
          operador: string | null
          orden_id: string | null
          registrado_at: string
          revisado_at: string | null
          revisado_por: string | null
          secuencia_captura: number | null
          turno: string | null
        }
        Insert: {
          capturado_at?: string | null
          estatus_revision?: string
          id: string
          maquina_id: string
          motivo_exclusion: string
          motivo_revision?: string | null
          numero_rollo_actual: string
          numero_rollo_propuesto: string
          operador?: string | null
          orden_id?: string | null
          registrado_at?: string
          revisado_at?: string | null
          revisado_por?: string | null
          secuencia_captura?: number | null
          turno?: string | null
        }
        Update: {
          capturado_at?: string | null
          estatus_revision?: string
          id?: string
          maquina_id?: string
          motivo_exclusion?: string
          motivo_revision?: string | null
          numero_rollo_actual?: string
          numero_rollo_propuesto?: string
          operador?: string | null
          orden_id?: string | null
          registrado_at?: string
          revisado_at?: string | null
          revisado_por?: string | null
          secuencia_captura?: number | null
          turno?: string | null
        }
        Relationships: []
      }
      ajustes_calidad: {
        Row: {
          accion_realizada: string | null
          ajustado_at: string | null
          ajustado_por: string | null
          autorizado_at: string | null
          autorizado_por: string | null
          created_at: string
          detectado_en: string
          estado_flujo: Database["public"]["Enums"]["qc_ajuste_flujo"]
          evidencia_url: string | null
          id: string
          maquina_id: string
          motivo: string
          muestra_id: string | null
          muestra_verificacion_id: string | null
          observacion_ajuste: string | null
          orden_id: string | null
          planta_id: string
          resultado: Database["public"]["Enums"]["qc_resultado_ajuste"]
          sla_objetivo_horas: number
          solicitado_at: string
          solicitado_por: string
          tipo_ajuste: Database["public"]["Enums"]["qc_tipo_ajuste"]
          updated_at: string
        }
        Insert: {
          accion_realizada?: string | null
          ajustado_at?: string | null
          ajustado_por?: string | null
          autorizado_at?: string | null
          autorizado_por?: string | null
          created_at?: string
          detectado_en?: string
          estado_flujo?: Database["public"]["Enums"]["qc_ajuste_flujo"]
          evidencia_url?: string | null
          id?: string
          maquina_id: string
          motivo: string
          muestra_id?: string | null
          muestra_verificacion_id?: string | null
          observacion_ajuste?: string | null
          orden_id?: string | null
          planta_id: string
          resultado?: Database["public"]["Enums"]["qc_resultado_ajuste"]
          sla_objetivo_horas?: number
          solicitado_at?: string
          solicitado_por: string
          tipo_ajuste: Database["public"]["Enums"]["qc_tipo_ajuste"]
          updated_at?: string
        }
        Update: {
          accion_realizada?: string | null
          ajustado_at?: string | null
          ajustado_por?: string | null
          autorizado_at?: string | null
          autorizado_por?: string | null
          created_at?: string
          detectado_en?: string
          estado_flujo?: Database["public"]["Enums"]["qc_ajuste_flujo"]
          evidencia_url?: string | null
          id?: string
          maquina_id?: string
          motivo?: string
          muestra_id?: string | null
          muestra_verificacion_id?: string | null
          observacion_ajuste?: string | null
          orden_id?: string | null
          planta_id?: string
          resultado?: Database["public"]["Enums"]["qc_resultado_ajuste"]
          sla_objetivo_horas?: number
          solicitado_at?: string
          solicitado_por?: string
          tipo_ajuste?: Database["public"]["Enums"]["qc_tipo_ajuste"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ajustes_calidad_maquina_id_fkey"
            columns: ["maquina_id"]
            isOneToOne: false
            referencedRelation: "maquinas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ajustes_calidad_muestra_id_fkey"
            columns: ["muestra_id"]
            isOneToOne: false
            referencedRelation: "muestras_calidad"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ajustes_calidad_muestra_id_fkey"
            columns: ["muestra_id"]
            isOneToOne: false
            referencedRelation: "v_muestra_kpis_v2"
            referencedColumns: ["muestra_id"]
          },
          {
            foreignKeyName: "ajustes_calidad_muestra_id_fkey"
            columns: ["muestra_id"]
            isOneToOne: false
            referencedRelation: "vw_muestras_calidad_estado_oficial"
            referencedColumns: ["muestra_id"]
          },
          {
            foreignKeyName: "ajustes_calidad_muestra_verificacion_id_fkey"
            columns: ["muestra_verificacion_id"]
            isOneToOne: false
            referencedRelation: "muestras_calidad"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ajustes_calidad_muestra_verificacion_id_fkey"
            columns: ["muestra_verificacion_id"]
            isOneToOne: false
            referencedRelation: "v_muestra_kpis_v2"
            referencedColumns: ["muestra_id"]
          },
          {
            foreignKeyName: "ajustes_calidad_muestra_verificacion_id_fkey"
            columns: ["muestra_verificacion_id"]
            isOneToOne: false
            referencedRelation: "vw_muestras_calidad_estado_oficial"
            referencedColumns: ["muestra_id"]
          },
          {
            foreignKeyName: "ajustes_calidad_orden_id_fkey"
            columns: ["orden_id"]
            isOneToOne: false
            referencedRelation: "ordenes_fabricacion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ajustes_calidad_planta_id_fkey"
            columns: ["planta_id"]
            isOneToOne: false
            referencedRelation: "plantas"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          ceo_report_destinatarios: string
          ceo_report_enabled: boolean
          ceo_report_hora: string
          costo_no_calidad_kg: number
          created_at: string
          frecuencia_muestreo_min: number
          id: string
          notif_fuera_rango: boolean
          notif_no_conformidades: boolean
          notif_resumen_diario: boolean
          notif_resumen_semanal: boolean
          singleton: boolean
          spec_evidencia_obligatoria: boolean
          tolerancia_advertencia_pct: number
          turno1_fin: string
          turno1_inicio: string
          turno2_fin: string
          turno2_inicio: string
          turno3_fin: string
          turno3_inicio: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          ceo_report_destinatarios?: string
          ceo_report_enabled?: boolean
          ceo_report_hora?: string
          costo_no_calidad_kg?: number
          created_at?: string
          frecuencia_muestreo_min?: number
          id?: string
          notif_fuera_rango?: boolean
          notif_no_conformidades?: boolean
          notif_resumen_diario?: boolean
          notif_resumen_semanal?: boolean
          singleton?: boolean
          spec_evidencia_obligatoria?: boolean
          tolerancia_advertencia_pct?: number
          turno1_fin?: string
          turno1_inicio?: string
          turno2_fin?: string
          turno2_inicio?: string
          turno3_fin?: string
          turno3_inicio?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          ceo_report_destinatarios?: string
          ceo_report_enabled?: boolean
          ceo_report_hora?: string
          costo_no_calidad_kg?: number
          created_at?: string
          frecuencia_muestreo_min?: number
          id?: string
          notif_fuera_rango?: boolean
          notif_no_conformidades?: boolean
          notif_resumen_diario?: boolean
          notif_resumen_semanal?: boolean
          singleton?: boolean
          spec_evidencia_obligatoria?: boolean
          tolerancia_advertencia_pct?: number
          turno1_fin?: string
          turno1_inicio?: string
          turno2_fin?: string
          turno2_inicio?: string
          turno3_fin?: string
          turno3_inicio?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          datos_anteriores: Json | null
          datos_nuevos: Json | null
          descripcion_accion: string | null
          estatus_anterior: string | null
          estatus_nuevo: string | null
          folio_rollo: string | null
          id: string
          ip_address: string | null
          laboratorio: string | null
          maquina_id: string | null
          modulo: string | null
          motivo: string | null
          operacion: string
          planta_id: string | null
          registro_id: string | null
          rol: string | null
          tabla_afectada: string | null
          timestamp: string
          user_agent: string | null
          usuario_email: string | null
          usuario_id: string | null
        }
        Insert: {
          datos_anteriores?: Json | null
          datos_nuevos?: Json | null
          descripcion_accion?: string | null
          estatus_anterior?: string | null
          estatus_nuevo?: string | null
          folio_rollo?: string | null
          id?: string
          ip_address?: string | null
          laboratorio?: string | null
          maquina_id?: string | null
          modulo?: string | null
          motivo?: string | null
          operacion: string
          planta_id?: string | null
          registro_id?: string | null
          rol?: string | null
          tabla_afectada?: string | null
          timestamp?: string
          user_agent?: string | null
          usuario_email?: string | null
          usuario_id?: string | null
        }
        Update: {
          datos_anteriores?: Json | null
          datos_nuevos?: Json | null
          descripcion_accion?: string | null
          estatus_anterior?: string | null
          estatus_nuevo?: string | null
          folio_rollo?: string | null
          id?: string
          ip_address?: string | null
          laboratorio?: string | null
          maquina_id?: string | null
          modulo?: string | null
          motivo?: string | null
          operacion?: string
          planta_id?: string | null
          registro_id?: string | null
          rol?: string | null
          tabla_afectada?: string | null
          timestamp?: string
          user_agent?: string | null
          usuario_email?: string | null
          usuario_id?: string | null
        }
        Relationships: []
      }
      catalog_import_batches: {
        Row: {
          completed_at: string | null
          conflicts: number
          created_products: number
          created_profiles: number
          created_specifications: number
          errors: number
          executed_by: string | null
          id: string
          notes: string | null
          skipped_records: number
          source_file: string
          source_hash: string | null
          started_at: string
          status: string
          updated_products: number
        }
        Insert: {
          completed_at?: string | null
          conflicts?: number
          created_products?: number
          created_profiles?: number
          created_specifications?: number
          errors?: number
          executed_by?: string | null
          id?: string
          notes?: string | null
          skipped_records?: number
          source_file: string
          source_hash?: string | null
          started_at?: string
          status?: string
          updated_products?: number
        }
        Update: {
          completed_at?: string | null
          conflicts?: number
          created_products?: number
          created_profiles?: number
          created_specifications?: number
          errors?: number
          executed_by?: string | null
          id?: string
          notes?: string | null
          skipped_records?: number
          source_file?: string
          source_hash?: string | null
          started_at?: string
          status?: string
          updated_products?: number
        }
        Relationships: []
      }
      catalogo_bobinadoras: {
        Row: {
          activo: boolean
          actualizado_por: string | null
          codigo: string
          creado_por: string | null
          created_at: string
          id: string
          nombre: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          actualizado_por?: string | null
          codigo: string
          creado_por?: string | null
          created_at?: string
          id?: string
          nombre: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          actualizado_por?: string | null
          codigo?: string
          creado_por?: string | null
          created_at?: string
          id?: string
          nombre?: string
          updated_at?: string
        }
        Relationships: []
      }
      enlaces_pesaje_publico: {
        Row: {
          activo: boolean
          creado_por: string | null
          created_at: string
          descripcion: string | null
          expira_at: string
          id: string
          maquina_id: string
          token: string
        }
        Insert: {
          activo?: boolean
          creado_por?: string | null
          created_at?: string
          descripcion?: string | null
          expira_at: string
          id?: string
          maquina_id: string
          token: string
        }
        Update: {
          activo?: boolean
          creado_por?: string | null
          created_at?: string
          descripcion?: string | null
          expira_at?: string
          id?: string
          maquina_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "enlaces_pesaje_publico_maquina_id_fkey"
            columns: ["maquina_id"]
            isOneToOne: false
            referencedRelation: "maquinas"
            referencedColumns: ["id"]
          },
        ]
      }
      familias_producto: {
        Row: {
          activo: boolean
          codigo: string
          created_at: string
          descripcion: string | null
          id: string
          nombre: string
          orden: number
          updated_at: string
        }
        Insert: {
          activo?: boolean
          codigo: string
          created_at?: string
          descripcion?: string | null
          id?: string
          nombre: string
          orden?: number
          updated_at?: string
        }
        Update: {
          activo?: boolean
          codigo?: string
          created_at?: string
          descripcion?: string | null
          id?: string
          nombre?: string
          orden?: number
          updated_at?: string
        }
        Relationships: []
      }
      impresiones_etiquetas_cintas: {
        Row: {
          cantidad_etiquetas: number
          cinta_id: string | null
          datos_impresion_snapshot: Json
          folio_impresion: string
          id: string
          impreso_en: string
          impreso_por: string
          lote_id: string
          motivo_reimpresion: string | null
          numero_impresion: number
          posiciones_impresas: number[]
          qr_contenido: Json | null
          tipo: Database["public"]["Enums"]["impresion_cinta_tipo"]
          total_uniones_cintas: number | null
          version_etiqueta: number | null
        }
        Insert: {
          cantidad_etiquetas: number
          cinta_id?: string | null
          datos_impresion_snapshot: Json
          folio_impresion: string
          id?: string
          impreso_en?: string
          impreso_por: string
          lote_id: string
          motivo_reimpresion?: string | null
          numero_impresion?: number
          posiciones_impresas: number[]
          qr_contenido?: Json | null
          tipo: Database["public"]["Enums"]["impresion_cinta_tipo"]
          total_uniones_cintas?: number | null
          version_etiqueta?: number | null
        }
        Update: {
          cantidad_etiquetas?: number
          cinta_id?: string | null
          datos_impresion_snapshot?: Json
          folio_impresion?: string
          id?: string
          impreso_en?: string
          impreso_por?: string
          lote_id?: string
          motivo_reimpresion?: string | null
          numero_impresion?: number
          posiciones_impresas?: number[]
          qr_contenido?: Json | null
          tipo?: Database["public"]["Enums"]["impresion_cinta_tipo"]
          total_uniones_cintas?: number | null
          version_etiqueta?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "impresiones_etiquetas_cintas_cinta_id_fkey"
            columns: ["cinta_id"]
            isOneToOne: false
            referencedRelation: "pesajes_cintas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "impresiones_etiquetas_cintas_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "pesajes_cintas_lotes"
            referencedColumns: ["id"]
          },
        ]
      }
      maquina_access_codes: {
        Row: {
          access_code: string
          created_at: string
          maquina_id: string
          updated_at: string
        }
        Insert: {
          access_code: string
          created_at?: string
          maquina_id: string
          updated_at?: string
        }
        Update: {
          access_code?: string
          created_at?: string
          maquina_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "maquina_access_codes_maquina_id_fkey"
            columns: ["maquina_id"]
            isOneToOne: true
            referencedRelation: "maquinas"
            referencedColumns: ["id"]
          },
        ]
      }
      maquina_estado_actual: {
        Row: {
          actualizado_por: string | null
          estado: Database["public"]["Enums"]["maquina_estado"]
          maquina_id: string
          orden_activa_id: string | null
          paro_activo_id: string | null
          ultimo_cambio: string
          updated_at: string
        }
        Insert: {
          actualizado_por?: string | null
          estado?: Database["public"]["Enums"]["maquina_estado"]
          maquina_id: string
          orden_activa_id?: string | null
          paro_activo_id?: string | null
          ultimo_cambio?: string
          updated_at?: string
        }
        Update: {
          actualizado_por?: string | null
          estado?: Database["public"]["Enums"]["maquina_estado"]
          maquina_id?: string
          orden_activa_id?: string | null
          paro_activo_id?: string | null
          ultimo_cambio?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_mea_paro_activo"
            columns: ["paro_activo_id"]
            isOneToOne: false
            referencedRelation: "paros_maquina"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maquina_estado_actual_maquina_id_fkey"
            columns: ["maquina_id"]
            isOneToOne: true
            referencedRelation: "maquinas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maquina_estado_actual_orden_activa_id_fkey"
            columns: ["orden_activa_id"]
            isOneToOne: false
            referencedRelation: "ordenes_fabricacion"
            referencedColumns: ["id"]
          },
        ]
      }
      maquinas: {
        Row: {
          access_code: string | null
          activo: boolean
          area: string | null
          codigo: string
          created_at: string
          id: string
          nombre: string
          planta_id: string
          updated_at: string
        }
        Insert: {
          access_code?: string | null
          activo?: boolean
          area?: string | null
          codigo: string
          created_at?: string
          id?: string
          nombre: string
          planta_id: string
          updated_at?: string
        }
        Update: {
          access_code?: string | null
          activo?: boolean
          area?: string | null
          codigo?: string
          created_at?: string
          id?: string
          nombre?: string
          planta_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "maquinas_planta_id_fkey"
            columns: ["planta_id"]
            isOneToOne: false
            referencedRelation: "plantas"
            referencedColumns: ["id"]
          },
        ]
      }
      mediciones_calidad: {
        Row: {
          capturado_por: string | null
          created_at: string
          estado: Database["public"]["Enums"]["qc_medicion_estado"]
          id: string
          max_snapshot: number
          min_snapshot: number
          muestra_id: string
          objetivo_snapshot: number
          observacion: string
          valor: number
          variable_clave: string
          variable_id: string
        }
        Insert: {
          capturado_por?: string | null
          created_at?: string
          estado?: Database["public"]["Enums"]["qc_medicion_estado"]
          id?: string
          max_snapshot: number
          min_snapshot: number
          muestra_id: string
          objetivo_snapshot: number
          observacion?: string
          valor: number
          variable_clave: string
          variable_id: string
        }
        Update: {
          capturado_por?: string | null
          created_at?: string
          estado?: Database["public"]["Enums"]["qc_medicion_estado"]
          id?: string
          max_snapshot?: number
          min_snapshot?: number
          muestra_id?: string
          objetivo_snapshot?: number
          observacion?: string
          valor?: number
          variable_clave?: string
          variable_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mediciones_calidad_muestra_id_fkey"
            columns: ["muestra_id"]
            isOneToOne: false
            referencedRelation: "muestras_calidad"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mediciones_calidad_muestra_id_fkey"
            columns: ["muestra_id"]
            isOneToOne: false
            referencedRelation: "v_muestra_kpis_v2"
            referencedColumns: ["muestra_id"]
          },
          {
            foreignKeyName: "mediciones_calidad_muestra_id_fkey"
            columns: ["muestra_id"]
            isOneToOne: false
            referencedRelation: "vw_muestras_calidad_estado_oficial"
            referencedColumns: ["muestra_id"]
          },
          {
            foreignKeyName: "mediciones_calidad_variable_id_fkey"
            columns: ["variable_id"]
            isOneToOne: false
            referencedRelation: "variables_calidad"
            referencedColumns: ["id"]
          },
        ]
      }
      module_permissions: {
        Row: {
          module: Database["public"]["Enums"]["app_module"]
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          module: Database["public"]["Enums"]["app_module"]
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          module?: Database["public"]["Enums"]["app_module"]
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
      muestras_calidad: {
        Row: {
          analista: string | null
          autorizado_at: string | null
          autorizado_por: string | null
          capturado_at: string
          capturado_por: string
          created_at: string
          crepado_pct: number | null
          criterio_defecto: string | null
          cumplimiento_pct: number | null
          defecto_visual_conversion: string | null
          defectos: string[]
          descripcion_sap: string | null
          destino: string | null
          dictamen: Database["public"]["Enums"]["qc_dictamen"] | null
          dictamen_at: string | null
          dictamen_motivo: string | null
          dictamen_observaciones: string | null
          especificacion_id: string
          especificacion_version: string
          estado: Database["public"]["Enums"]["qc_muestra_estado"]
          estatus_liberacion: string | null
          evidencia_url: string | null
          fuera_de_turno: boolean
          fuera_de_turno_motivo: string | null
          hora_muestreo: string
          id: string
          idempotency_key: string | null
          jefe_maquina: string | null
          liberacion_justificacion: string | null
          liberado_at: string | null
          liberado_con_justificacion: boolean
          liberado_por: string | null
          lote_logistico: string | null
          maquina_id: string
          mediciones_modificacion_motivo: string | null
          mediciones_modificadas_at: string | null
          mediciones_modificadas_por: string | null
          numero_rollo: string
          observaciones_generales: string
          operador: string | null
          operario_id: string | null
          orden_id: string | null
          pesaje_id: string | null
          planta_id: string
          porcentaje_rupturas_pct: number | null
          prensero: string | null
          producto_id: string
          revisado_at: string | null
          revisado_por: string | null
          rol_autorizador: Database["public"]["Enums"]["app_role"] | null
          secuencia_captura: number
          sku_sap: string | null
          tipo_muestreo: Database["public"]["Enums"]["qc_tipo_muestreo"]
          turno: string
          updated_at: string
          variable_tecnica_dimensional: string | null
          variables_fuera_spec: Json
          variables_snapshot_json: Json
          velocidad_enrollador: number | null
          velocidad_maquina: number | null
        }
        Insert: {
          analista?: string | null
          autorizado_at?: string | null
          autorizado_por?: string | null
          capturado_at?: string
          capturado_por: string
          created_at?: string
          crepado_pct?: number | null
          criterio_defecto?: string | null
          cumplimiento_pct?: number | null
          defecto_visual_conversion?: string | null
          defectos?: string[]
          descripcion_sap?: string | null
          destino?: string | null
          dictamen?: Database["public"]["Enums"]["qc_dictamen"] | null
          dictamen_at?: string | null
          dictamen_motivo?: string | null
          dictamen_observaciones?: string | null
          especificacion_id: string
          especificacion_version: string
          estado?: Database["public"]["Enums"]["qc_muestra_estado"]
          estatus_liberacion?: string | null
          evidencia_url?: string | null
          fuera_de_turno?: boolean
          fuera_de_turno_motivo?: string | null
          hora_muestreo?: string
          id?: string
          idempotency_key?: string | null
          jefe_maquina?: string | null
          liberacion_justificacion?: string | null
          liberado_at?: string | null
          liberado_con_justificacion?: boolean
          liberado_por?: string | null
          lote_logistico?: string | null
          maquina_id: string
          mediciones_modificacion_motivo?: string | null
          mediciones_modificadas_at?: string | null
          mediciones_modificadas_por?: string | null
          numero_rollo: string
          observaciones_generales?: string
          operador?: string | null
          operario_id?: string | null
          orden_id?: string | null
          pesaje_id?: string | null
          planta_id: string
          porcentaje_rupturas_pct?: number | null
          prensero?: string | null
          producto_id: string
          revisado_at?: string | null
          revisado_por?: string | null
          rol_autorizador?: Database["public"]["Enums"]["app_role"] | null
          secuencia_captura?: number
          sku_sap?: string | null
          tipo_muestreo: Database["public"]["Enums"]["qc_tipo_muestreo"]
          turno: string
          updated_at?: string
          variable_tecnica_dimensional?: string | null
          variables_fuera_spec?: Json
          variables_snapshot_json?: Json
          velocidad_enrollador?: number | null
          velocidad_maquina?: number | null
        }
        Update: {
          analista?: string | null
          autorizado_at?: string | null
          autorizado_por?: string | null
          capturado_at?: string
          capturado_por?: string
          created_at?: string
          crepado_pct?: number | null
          criterio_defecto?: string | null
          cumplimiento_pct?: number | null
          defecto_visual_conversion?: string | null
          defectos?: string[]
          descripcion_sap?: string | null
          destino?: string | null
          dictamen?: Database["public"]["Enums"]["qc_dictamen"] | null
          dictamen_at?: string | null
          dictamen_motivo?: string | null
          dictamen_observaciones?: string | null
          especificacion_id?: string
          especificacion_version?: string
          estado?: Database["public"]["Enums"]["qc_muestra_estado"]
          estatus_liberacion?: string | null
          evidencia_url?: string | null
          fuera_de_turno?: boolean
          fuera_de_turno_motivo?: string | null
          hora_muestreo?: string
          id?: string
          idempotency_key?: string | null
          jefe_maquina?: string | null
          liberacion_justificacion?: string | null
          liberado_at?: string | null
          liberado_con_justificacion?: boolean
          liberado_por?: string | null
          lote_logistico?: string | null
          maquina_id?: string
          mediciones_modificacion_motivo?: string | null
          mediciones_modificadas_at?: string | null
          mediciones_modificadas_por?: string | null
          numero_rollo?: string
          observaciones_generales?: string
          operador?: string | null
          operario_id?: string | null
          orden_id?: string | null
          pesaje_id?: string | null
          planta_id?: string
          porcentaje_rupturas_pct?: number | null
          prensero?: string | null
          producto_id?: string
          revisado_at?: string | null
          revisado_por?: string | null
          rol_autorizador?: Database["public"]["Enums"]["app_role"] | null
          secuencia_captura?: number
          sku_sap?: string | null
          tipo_muestreo?: Database["public"]["Enums"]["qc_tipo_muestreo"]
          turno?: string
          updated_at?: string
          variable_tecnica_dimensional?: string | null
          variables_fuera_spec?: Json
          variables_snapshot_json?: Json
          velocidad_enrollador?: number | null
          velocidad_maquina?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "muestras_calidad_especificacion_id_fkey"
            columns: ["especificacion_id"]
            isOneToOne: false
            referencedRelation: "producto_especificaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "muestras_calidad_maquina_id_fkey"
            columns: ["maquina_id"]
            isOneToOne: false
            referencedRelation: "maquinas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "muestras_calidad_orden_id_fkey"
            columns: ["orden_id"]
            isOneToOne: false
            referencedRelation: "ordenes_fabricacion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "muestras_calidad_pesaje_id_fkey"
            columns: ["pesaje_id"]
            isOneToOne: false
            referencedRelation: "pesajes_bobina_madre"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "muestras_calidad_planta_id_fkey"
            columns: ["planta_id"]
            isOneToOne: false
            referencedRelation: "plantas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "muestras_calidad_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      numeracion_rollos: {
        Row: {
          activo: boolean
          created_at: string
          maquina_codigo: string
          maquina_id: string
          numero_inicial: number
          proximo_numero: number
          relleno_digitos: number
          sufijo: string
          updated_at: string
          vigente_desde: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          maquina_codigo: string
          maquina_id: string
          numero_inicial: number
          proximo_numero: number
          relleno_digitos?: number
          sufijo: string
          updated_at?: string
          vigente_desde: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          maquina_codigo?: string
          maquina_id?: string
          numero_inicial?: number
          proximo_numero?: number
          relleno_digitos?: number
          sufijo?: string
          updated_at?: string
          vigente_desde?: string
        }
        Relationships: [
          {
            foreignKeyName: "numeracion_rollos_maquina_id_fkey"
            columns: ["maquina_id"]
            isOneToOne: true
            referencedRelation: "maquinas"
            referencedColumns: ["id"]
          },
        ]
      }
      operarios: {
        Row: {
          activo: boolean
          created_at: string
          id: string
          nombre: string
          planta_id: string | null
          puesto: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          activo?: boolean
          created_at?: string
          id?: string
          nombre: string
          planta_id?: string | null
          puesto?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          activo?: boolean
          created_at?: string
          id?: string
          nombre?: string
          planta_id?: string | null
          puesto?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "operarios_planta_id_fkey"
            columns: ["planta_id"]
            isOneToOne: false
            referencedRelation: "plantas"
            referencedColumns: ["id"]
          },
        ]
      }
      ordenes_fabricacion: {
        Row: {
          cerrado_por: string | null
          creado_por: string | null
          created_at: string
          especificacion_id: string
          estado: Database["public"]["Enums"]["orden_estado"]
          fecha_fin: string | null
          fecha_inicio: string | null
          fecha_programada: string | null
          folio: string
          id: string
          iniciado_por: string | null
          maquina_id: string
          notas: string | null
          objetivo_kg: number | null
          objetivo_rollos: number | null
          planta_id: string
          producido_kg: number
          producido_rollos: number
          producto_id: string
          turno: string | null
          unidad_objetivo: Database["public"]["Enums"]["unidad_objetivo"]
          updated_at: string
        }
        Insert: {
          cerrado_por?: string | null
          creado_por?: string | null
          created_at?: string
          especificacion_id: string
          estado?: Database["public"]["Enums"]["orden_estado"]
          fecha_fin?: string | null
          fecha_inicio?: string | null
          fecha_programada?: string | null
          folio: string
          id?: string
          iniciado_por?: string | null
          maquina_id: string
          notas?: string | null
          objetivo_kg?: number | null
          objetivo_rollos?: number | null
          planta_id: string
          producido_kg?: number
          producido_rollos?: number
          producto_id: string
          turno?: string | null
          unidad_objetivo?: Database["public"]["Enums"]["unidad_objetivo"]
          updated_at?: string
        }
        Update: {
          cerrado_por?: string | null
          creado_por?: string | null
          created_at?: string
          especificacion_id?: string
          estado?: Database["public"]["Enums"]["orden_estado"]
          fecha_fin?: string | null
          fecha_inicio?: string | null
          fecha_programada?: string | null
          folio?: string
          id?: string
          iniciado_por?: string | null
          maquina_id?: string
          notas?: string | null
          objetivo_kg?: number | null
          objetivo_rollos?: number | null
          planta_id?: string
          producido_kg?: number
          producido_rollos?: number
          producto_id?: string
          turno?: string | null
          unidad_objetivo?: Database["public"]["Enums"]["unidad_objetivo"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ordenes_fabricacion_especificacion_id_fkey"
            columns: ["especificacion_id"]
            isOneToOne: false
            referencedRelation: "producto_especificaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordenes_fabricacion_maquina_id_fkey"
            columns: ["maquina_id"]
            isOneToOne: false
            referencedRelation: "maquinas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordenes_fabricacion_planta_id_fkey"
            columns: ["planta_id"]
            isOneToOne: false
            referencedRelation: "plantas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordenes_fabricacion_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      ordenes_produccion: {
        Row: {
          archivo_origen: string | null
          cerrada_por: string | null
          creado_por: string | null
          created_at: string
          estado: string
          estado_sap: string | null
          fecha_cierre: string | null
          fecha_registro: string
          id: string
          numero_orden: string
          peso_registrado: number
          updated_at: string
        }
        Insert: {
          archivo_origen?: string | null
          cerrada_por?: string | null
          creado_por?: string | null
          created_at?: string
          estado?: string
          estado_sap?: string | null
          fecha_cierre?: string | null
          fecha_registro?: string
          id?: string
          numero_orden: string
          peso_registrado: number
          updated_at?: string
        }
        Update: {
          archivo_origen?: string | null
          cerrada_por?: string | null
          creado_por?: string | null
          created_at?: string
          estado?: string
          estado_sap?: string | null
          fecha_cierre?: string | null
          fecha_registro?: string
          id?: string
          numero_orden?: string
          peso_registrado?: number
          updated_at?: string
        }
        Relationships: []
      }
      paros_maquina: {
        Row: {
          abierto_por: string | null
          cerrado_por: string | null
          created_at: string
          descripcion: string | null
          duracion_min: number | null
          fin: string | null
          id: string
          inicio: string
          maquina_id: string
          orden_id: string | null
          tipo_paro_id: string
          updated_at: string
        }
        Insert: {
          abierto_por?: string | null
          cerrado_por?: string | null
          created_at?: string
          descripcion?: string | null
          duracion_min?: number | null
          fin?: string | null
          id?: string
          inicio?: string
          maquina_id: string
          orden_id?: string | null
          tipo_paro_id: string
          updated_at?: string
        }
        Update: {
          abierto_por?: string | null
          cerrado_por?: string | null
          created_at?: string
          descripcion?: string | null
          duracion_min?: number | null
          fin?: string | null
          id?: string
          inicio?: string
          maquina_id?: string
          orden_id?: string | null
          tipo_paro_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "paros_maquina_maquina_id_fkey"
            columns: ["maquina_id"]
            isOneToOne: false
            referencedRelation: "maquinas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paros_maquina_orden_id_fkey"
            columns: ["orden_id"]
            isOneToOne: false
            referencedRelation: "ordenes_fabricacion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paros_maquina_tipo_paro_id_fkey"
            columns: ["tipo_paro_id"]
            isOneToOne: false
            referencedRelation: "tipos_paro"
            referencedColumns: ["id"]
          },
        ]
      }
      pesajes_bobina_madre: {
        Row: {
          capturado_por: string | null
          created_at: string
          evidencia_path: string
          fecha_hora_pesaje: string
          id: string
          maquina_codigo: string
          maquina_id: string
          numero_orden: string | null
          numero_rollo: string
          ocr_confianza: number | null
          ocr_raw: Json | null
          orden_produccion_id: string | null
          peso_bruto_kg: number
          peso_eje_kg: number
          peso_neto_kg: number
          updated_at: string
        }
        Insert: {
          capturado_por?: string | null
          created_at?: string
          evidencia_path: string
          fecha_hora_pesaje?: string
          id?: string
          maquina_codigo: string
          maquina_id: string
          numero_orden?: string | null
          numero_rollo: string
          ocr_confianza?: number | null
          ocr_raw?: Json | null
          orden_produccion_id?: string | null
          peso_bruto_kg: number
          peso_eje_kg?: number
          peso_neto_kg: number
          updated_at?: string
        }
        Update: {
          capturado_por?: string | null
          created_at?: string
          evidencia_path?: string
          fecha_hora_pesaje?: string
          id?: string
          maquina_codigo?: string
          maquina_id?: string
          numero_orden?: string | null
          numero_rollo?: string
          ocr_confianza?: number | null
          ocr_raw?: Json | null
          orden_produccion_id?: string | null
          peso_bruto_kg?: number
          peso_eje_kg?: number
          peso_neto_kg?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pesajes_bobina_madre_maquina_id_fkey"
            columns: ["maquina_id"]
            isOneToOne: false
            referencedRelation: "maquinas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pesajes_bobina_madre_orden_produccion_id_fkey"
            columns: ["orden_produccion_id"]
            isOneToOne: false
            referencedRelation: "ordenes_produccion"
            referencedColumns: ["id"]
          },
        ]
      }
      pesajes_cintas: {
        Row: {
          actualizado_por: string | null
          ancho_util: number
          ancho_util_unidad: string | null
          anulado_at: string | null
          anulado_por: string | null
          creado_por: string
          created_at: string
          estado: Database["public"]["Enums"]["pesaje_cinta_estado"]
          estatus_liberacion: string | null
          id: string
          idempotency_key: string
          lote_id: string
          lote_logistico_pza: string | null
          motivo_anulacion: string | null
          observaciones: string | null
          peso_cinta_kg: number
          posicion: number
          rollo_id: string | null
          sustituye_a_cinta_id: string | null
          uniones: number
          updated_at: string
          version_etiqueta: number
        }
        Insert: {
          actualizado_por?: string | null
          ancho_util: number
          ancho_util_unidad?: string | null
          anulado_at?: string | null
          anulado_por?: string | null
          creado_por: string
          created_at?: string
          estado?: Database["public"]["Enums"]["pesaje_cinta_estado"]
          estatus_liberacion?: string | null
          id?: string
          idempotency_key: string
          lote_id: string
          lote_logistico_pza?: string | null
          motivo_anulacion?: string | null
          observaciones?: string | null
          peso_cinta_kg: number
          posicion: number
          rollo_id?: string | null
          sustituye_a_cinta_id?: string | null
          uniones?: number
          updated_at?: string
          version_etiqueta?: number
        }
        Update: {
          actualizado_por?: string | null
          ancho_util?: number
          ancho_util_unidad?: string | null
          anulado_at?: string | null
          anulado_por?: string | null
          creado_por?: string
          created_at?: string
          estado?: Database["public"]["Enums"]["pesaje_cinta_estado"]
          estatus_liberacion?: string | null
          id?: string
          idempotency_key?: string
          lote_id?: string
          lote_logistico_pza?: string | null
          motivo_anulacion?: string | null
          observaciones?: string | null
          peso_cinta_kg?: number
          posicion?: number
          rollo_id?: string | null
          sustituye_a_cinta_id?: string | null
          uniones?: number
          updated_at?: string
          version_etiqueta?: number
        }
        Relationships: [
          {
            foreignKeyName: "pesajes_cintas_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "pesajes_cintas_lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pesajes_cintas_rollo_id_fkey"
            columns: ["rollo_id"]
            isOneToOne: false
            referencedRelation: "rollos_cintas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pesajes_cintas_sustituye_a_cinta_id_fkey"
            columns: ["sustituye_a_cinta_id"]
            isOneToOne: false
            referencedRelation: "pesajes_cintas"
            referencedColumns: ["id"]
          },
        ]
      }
      pesajes_cintas_auditoria: {
        Row: {
          accion: string
          cinta_id: string | null
          contexto: Json | null
          id: string
          lote_id: string | null
          motivo: string | null
          realizado_en: string
          realizado_por: string | null
          valores_anteriores: Json | null
          valores_nuevos: Json | null
        }
        Insert: {
          accion: string
          cinta_id?: string | null
          contexto?: Json | null
          id?: string
          lote_id?: string | null
          motivo?: string | null
          realizado_en?: string
          realizado_por?: string | null
          valores_anteriores?: Json | null
          valores_nuevos?: Json | null
        }
        Update: {
          accion?: string
          cinta_id?: string | null
          contexto?: Json | null
          id?: string
          lote_id?: string | null
          motivo?: string | null
          realizado_en?: string
          realizado_por?: string | null
          valores_anteriores?: Json | null
          valores_nuevos?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "pesajes_cintas_auditoria_cinta_id_fkey"
            columns: ["cinta_id"]
            isOneToOne: false
            referencedRelation: "pesajes_cintas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pesajes_cintas_auditoria_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "pesajes_cintas_lotes"
            referencedColumns: ["id"]
          },
        ]
      }
      pesajes_cintas_lotes: {
        Row: {
          actualizado_por: string | null
          anulado_at: string | null
          anulado_por: string | null
          bobinador_nombre: string | null
          bobinadora_id: string | null
          bobinadora_nombre_snapshot: string
          cantidad_cintas: number
          conductor_id: string | null
          conductor_nombre_snapshot: string
          creado_por: string
          created_at: string
          datos_calidad_snapshot: Json
          es_manual: boolean
          estado: Database["public"]["Enums"]["pesaje_cintas_lote_estado"]
          fabricacion: string
          fecha_produccion: string | null
          finalizado_at: string | null
          finalizado_por: string | null
          id: string
          idempotency_key: string
          merma_kg: number | null
          merma_porcentaje: number | null
          merma_real_kg: number | null
          motivo_anulacion: string | null
          muestra_calidad_id: string | null
          numero_bajada: number | null
          numero_orden: string | null
          numero_rollo: string
          orden_produccion_id: string | null
          pesaje_bobina_madre_id: string | null
          peso_bobina_madre_neto_kg: number
          peso_mermas_kg: number | null
          peso_pendiente_kg: number
          peso_total_cintas_kg: number
          producto_codigo: string | null
          producto_id: string | null
          producto_nombre: string | null
          rollo_id: string | null
          updated_at: string
        }
        Insert: {
          actualizado_por?: string | null
          anulado_at?: string | null
          anulado_por?: string | null
          bobinador_nombre?: string | null
          bobinadora_id?: string | null
          bobinadora_nombre_snapshot: string
          cantidad_cintas?: number
          conductor_id?: string | null
          conductor_nombre_snapshot: string
          creado_por: string
          created_at?: string
          datos_calidad_snapshot?: Json
          es_manual?: boolean
          estado?: Database["public"]["Enums"]["pesaje_cintas_lote_estado"]
          fabricacion: string
          fecha_produccion?: string | null
          finalizado_at?: string | null
          finalizado_por?: string | null
          id?: string
          idempotency_key: string
          merma_kg?: number | null
          merma_porcentaje?: number | null
          merma_real_kg?: number | null
          motivo_anulacion?: string | null
          muestra_calidad_id?: string | null
          numero_bajada?: number | null
          numero_orden?: string | null
          numero_rollo: string
          orden_produccion_id?: string | null
          pesaje_bobina_madre_id?: string | null
          peso_bobina_madre_neto_kg: number
          peso_mermas_kg?: number | null
          peso_pendiente_kg: number
          peso_total_cintas_kg?: number
          producto_codigo?: string | null
          producto_id?: string | null
          producto_nombre?: string | null
          rollo_id?: string | null
          updated_at?: string
        }
        Update: {
          actualizado_por?: string | null
          anulado_at?: string | null
          anulado_por?: string | null
          bobinador_nombre?: string | null
          bobinadora_id?: string | null
          bobinadora_nombre_snapshot?: string
          cantidad_cintas?: number
          conductor_id?: string | null
          conductor_nombre_snapshot?: string
          creado_por?: string
          created_at?: string
          datos_calidad_snapshot?: Json
          es_manual?: boolean
          estado?: Database["public"]["Enums"]["pesaje_cintas_lote_estado"]
          fabricacion?: string
          fecha_produccion?: string | null
          finalizado_at?: string | null
          finalizado_por?: string | null
          id?: string
          idempotency_key?: string
          merma_kg?: number | null
          merma_porcentaje?: number | null
          merma_real_kg?: number | null
          motivo_anulacion?: string | null
          muestra_calidad_id?: string | null
          numero_bajada?: number | null
          numero_orden?: string | null
          numero_rollo?: string
          orden_produccion_id?: string | null
          pesaje_bobina_madre_id?: string | null
          peso_bobina_madre_neto_kg?: number
          peso_mermas_kg?: number | null
          peso_pendiente_kg?: number
          peso_total_cintas_kg?: number
          producto_codigo?: string | null
          producto_id?: string | null
          producto_nombre?: string | null
          rollo_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pesajes_cintas_lotes_bobinadora_id_fkey"
            columns: ["bobinadora_id"]
            isOneToOne: false
            referencedRelation: "catalogo_bobinadoras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pesajes_cintas_lotes_conductor_id_fkey"
            columns: ["conductor_id"]
            isOneToOne: false
            referencedRelation: "operarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pesajes_cintas_lotes_muestra_calidad_id_fkey"
            columns: ["muestra_calidad_id"]
            isOneToOne: false
            referencedRelation: "muestras_calidad"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pesajes_cintas_lotes_muestra_calidad_id_fkey"
            columns: ["muestra_calidad_id"]
            isOneToOne: false
            referencedRelation: "v_muestra_kpis_v2"
            referencedColumns: ["muestra_id"]
          },
          {
            foreignKeyName: "pesajes_cintas_lotes_muestra_calidad_id_fkey"
            columns: ["muestra_calidad_id"]
            isOneToOne: false
            referencedRelation: "vw_muestras_calidad_estado_oficial"
            referencedColumns: ["muestra_id"]
          },
          {
            foreignKeyName: "pesajes_cintas_lotes_orden_produccion_id_fkey"
            columns: ["orden_produccion_id"]
            isOneToOne: false
            referencedRelation: "ordenes_produccion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pesajes_cintas_lotes_pesaje_bobina_madre_id_fkey"
            columns: ["pesaje_bobina_madre_id"]
            isOneToOne: false
            referencedRelation: "pesajes_bobina_madre"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pesajes_cintas_lotes_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pesajes_cintas_lotes_rollo_id_fkey"
            columns: ["rollo_id"]
            isOneToOne: false
            referencedRelation: "rollos_cintas"
            referencedColumns: ["id"]
          },
        ]
      }
      plantas: {
        Row: {
          activo: boolean
          codigo: string
          created_at: string
          id: string
          nombre: string
          ubicacion: string | null
          updated_at: string
        }
        Insert: {
          activo?: boolean
          codigo: string
          created_at?: string
          id?: string
          nombre: string
          ubicacion?: string | null
          updated_at?: string
        }
        Update: {
          activo?: boolean
          codigo?: string
          created_at?: string
          id?: string
          nombre?: string
          ubicacion?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      producto_especificacion_maquinas: {
        Row: {
          created_at: string
          especificacion_id: string
          id: string
          maquina_id: string
        }
        Insert: {
          created_at?: string
          especificacion_id: string
          id?: string
          maquina_id: string
        }
        Update: {
          created_at?: string
          especificacion_id?: string
          id?: string
          maquina_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "producto_especificacion_maquinas_especificacion_id_fkey"
            columns: ["especificacion_id"]
            isOneToOne: false
            referencedRelation: "producto_especificaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "producto_especificacion_maquinas_maquina_id_fkey"
            columns: ["maquina_id"]
            isOneToOne: false
            referencedRelation: "maquinas"
            referencedColumns: ["id"]
          },
        ]
      }
      producto_especificaciones: {
        Row: {
          aprobado_at: string | null
          aprobado_por: string | null
          borrador_de: string | null
          caracteristicas_atributos: string | null
          created_at: string
          descartado_at: string | null
          descartado_por: string | null
          enviado_revision_at: string | null
          enviado_revision_por: string | null
          estado: Database["public"]["Enums"]["spec_status"]
          id: string
          motivo_cambio: string | null
          motivo_descarte: string | null
          notas: string | null
          perfil_key: string | null
          producto_id: string
          publicado_at: string | null
          publicado_por: string | null
          updated_at: string
          version: string
          vigente_desde: string | null
          vigente_hasta: string | null
        }
        Insert: {
          aprobado_at?: string | null
          aprobado_por?: string | null
          borrador_de?: string | null
          caracteristicas_atributos?: string | null
          created_at?: string
          descartado_at?: string | null
          descartado_por?: string | null
          enviado_revision_at?: string | null
          enviado_revision_por?: string | null
          estado?: Database["public"]["Enums"]["spec_status"]
          id?: string
          motivo_cambio?: string | null
          motivo_descarte?: string | null
          notas?: string | null
          perfil_key?: string | null
          producto_id: string
          publicado_at?: string | null
          publicado_por?: string | null
          updated_at?: string
          version: string
          vigente_desde?: string | null
          vigente_hasta?: string | null
        }
        Update: {
          aprobado_at?: string | null
          aprobado_por?: string | null
          borrador_de?: string | null
          caracteristicas_atributos?: string | null
          created_at?: string
          descartado_at?: string | null
          descartado_por?: string | null
          enviado_revision_at?: string | null
          enviado_revision_por?: string | null
          estado?: Database["public"]["Enums"]["spec_status"]
          id?: string
          motivo_cambio?: string | null
          motivo_descarte?: string | null
          notas?: string | null
          perfil_key?: string | null
          producto_id?: string
          publicado_at?: string | null
          publicado_por?: string | null
          updated_at?: string
          version?: string
          vigente_desde?: string | null
          vigente_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "producto_especificaciones_borrador_de_fkey"
            columns: ["borrador_de"]
            isOneToOne: false
            referencedRelation: "producto_especificaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "producto_especificaciones_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      producto_skus_sap: {
        Row: {
          clave_sku_sap: string
          created_at: string
          descripcion_sap: string
          id: string
          producto_id: string
        }
        Insert: {
          clave_sku_sap: string
          created_at?: string
          descripcion_sap: string
          id?: string
          producto_id: string
        }
        Update: {
          clave_sku_sap?: string
          created_at?: string
          descripcion_sap?: string
          id?: string
          producto_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "producto_skus_sap_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      producto_variables: {
        Row: {
          created_at: string
          especificacion_id: string
          id: string
          max_valor: number
          min_valor: number
          objetivo: number
          tolerancia: string | null
          updated_at: string
          variable_id: string
        }
        Insert: {
          created_at?: string
          especificacion_id: string
          id?: string
          max_valor: number
          min_valor: number
          objetivo: number
          tolerancia?: string | null
          updated_at?: string
          variable_id: string
        }
        Update: {
          created_at?: string
          especificacion_id?: string
          id?: string
          max_valor?: number
          min_valor?: number
          objetivo?: number
          tolerancia?: string | null
          updated_at?: string
          variable_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "producto_variables_especificacion_id_fkey"
            columns: ["especificacion_id"]
            isOneToOne: false
            referencedRelation: "producto_especificaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "producto_variables_variable_id_fkey"
            columns: ["variable_id"]
            isOneToOne: false
            referencedRelation: "variables_calidad"
            referencedColumns: ["id"]
          },
        ]
      }
      productos: {
        Row: {
          activo: boolean
          capas: number | null
          codigo: string
          created_at: string
          descripcion: string | null
          gramaje: number | null
          id: string
          nombre: string
          tipo_id: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          capas?: number | null
          codigo: string
          created_at?: string
          descripcion?: string | null
          gramaje?: number | null
          id?: string
          nombre: string
          tipo_id: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          capas?: number | null
          codigo?: string
          created_at?: string
          descripcion?: string | null
          gramaje?: number | null
          id?: string
          nombre?: string
          tipo_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "productos_tipo_id_fkey"
            columns: ["tipo_id"]
            isOneToOne: false
            referencedRelation: "tipos_producto"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          activo: boolean
          created_at: string
          email: string
          id: string
          laboratorio: string | null
          nombre: string
          rol_visible: string | null
          updated_at: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          email: string
          id: string
          laboratorio?: string | null
          nombre: string
          rol_visible?: string | null
          updated_at?: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          email?: string
          id?: string
          laboratorio?: string | null
          nombre?: string
          rol_visible?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      quality_catalog_audit: {
        Row: {
          action: string
          after_data: Json | null
          batch_id: string | null
          before_data: Json | null
          changed_at: string
          changed_by: string | null
          entity_id: string | null
          entity_type: string
          id: string
          product_key: string | null
          reason: string | null
          source_file: string | null
        }
        Insert: {
          action: string
          after_data?: Json | null
          batch_id?: string | null
          before_data?: Json | null
          changed_at?: string
          changed_by?: string | null
          entity_id?: string | null
          entity_type: string
          id?: string
          product_key?: string | null
          reason?: string | null
          source_file?: string | null
        }
        Update: {
          action?: string
          after_data?: Json | null
          batch_id?: string | null
          before_data?: Json | null
          changed_at?: string
          changed_by?: string | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          product_key?: string | null
          reason?: string | null
          source_file?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quality_catalog_audit_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "catalog_import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      rollos_cintas: {
        Row: {
          cerrado: boolean
          cerrado_at: string | null
          cerrado_por: string | null
          created_at: string
          id: string
          motivo_cierre: string | null
          numero_rollo: string
          updated_at: string
        }
        Insert: {
          cerrado?: boolean
          cerrado_at?: string | null
          cerrado_por?: string | null
          created_at?: string
          id?: string
          motivo_cierre?: string | null
          numero_rollo: string
          updated_at?: string
        }
        Update: {
          cerrado?: boolean
          cerrado_at?: string | null
          cerrado_por?: string | null
          created_at?: string
          id?: string
          motivo_cierre?: string | null
          numero_rollo?: string
          updated_at?: string
        }
        Relationships: []
      }
      rollos_producidos: {
        Row: {
          created_at: string
          diametro_mm: number | null
          id: string
          numero: number
          observaciones: string | null
          orden_id: string
          peso_kg: number | null
          registrado_at: string
          registrado_por: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          diametro_mm?: number | null
          id?: string
          numero: number
          observaciones?: string | null
          orden_id: string
          peso_kg?: number | null
          registrado_at?: string
          registrado_por?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          diametro_mm?: number | null
          id?: string
          numero?: number
          observaciones?: string | null
          orden_id?: string
          peso_kg?: number | null
          registrado_at?: string
          registrado_por?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rollos_producidos_orden_id_fkey"
            columns: ["orden_id"]
            isOneToOne: false
            referencedRelation: "ordenes_fabricacion"
            referencedColumns: ["id"]
          },
        ]
      }
      roster_turnos: {
        Row: {
          activo: boolean
          created_at: string
          id: string
          jefe_maquina_id: string | null
          maquina_id: string
          operador_id: string | null
          prensero_id: string | null
          turno: Database["public"]["Enums"]["shift_code"]
          updated_at: string
          vigente_desde: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          id?: string
          jefe_maquina_id?: string | null
          maquina_id: string
          operador_id?: string | null
          prensero_id?: string | null
          turno: Database["public"]["Enums"]["shift_code"]
          updated_at?: string
          vigente_desde?: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          id?: string
          jefe_maquina_id?: string | null
          maquina_id?: string
          operador_id?: string | null
          prensero_id?: string | null
          turno?: Database["public"]["Enums"]["shift_code"]
          updated_at?: string
          vigente_desde?: string
        }
        Relationships: [
          {
            foreignKeyName: "roster_turnos_jefe_maquina_id_fkey"
            columns: ["jefe_maquina_id"]
            isOneToOne: false
            referencedRelation: "operarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roster_turnos_maquina_id_fkey"
            columns: ["maquina_id"]
            isOneToOne: false
            referencedRelation: "maquinas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roster_turnos_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "operarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roster_turnos_prensero_id_fkey"
            columns: ["prensero_id"]
            isOneToOne: false
            referencedRelation: "operarios"
            referencedColumns: ["id"]
          },
        ]
      }
      spec_audit_log: {
        Row: {
          campo: Database["public"]["Enums"]["qc_spec_audit_field"]
          especificacion_id: string
          id: string
          modificado_at: string
          modificado_por: string
          modificado_por_nombre: string | null
          modificado_por_rol: Database["public"]["Enums"]["app_role"] | null
          motivo: string
          planta_id: string | null
          producto_id: string
          valor_anterior: number | null
          valor_anterior_texto: string | null
          valor_nuevo: number | null
          valor_nuevo_texto: string | null
          variable_clave: string
          variable_etiqueta: string
          variable_id: string | null
        }
        Insert: {
          campo: Database["public"]["Enums"]["qc_spec_audit_field"]
          especificacion_id: string
          id?: string
          modificado_at?: string
          modificado_por: string
          modificado_por_nombre?: string | null
          modificado_por_rol?: Database["public"]["Enums"]["app_role"] | null
          motivo: string
          planta_id?: string | null
          producto_id: string
          valor_anterior?: number | null
          valor_anterior_texto?: string | null
          valor_nuevo?: number | null
          valor_nuevo_texto?: string | null
          variable_clave: string
          variable_etiqueta: string
          variable_id?: string | null
        }
        Update: {
          campo?: Database["public"]["Enums"]["qc_spec_audit_field"]
          especificacion_id?: string
          id?: string
          modificado_at?: string
          modificado_por?: string
          modificado_por_nombre?: string | null
          modificado_por_rol?: Database["public"]["Enums"]["app_role"] | null
          motivo?: string
          planta_id?: string | null
          producto_id?: string
          valor_anterior?: number | null
          valor_anterior_texto?: string | null
          valor_nuevo?: number | null
          valor_nuevo_texto?: string | null
          variable_clave?: string
          variable_etiqueta?: string
          variable_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "spec_audit_log_especificacion_id_fkey"
            columns: ["especificacion_id"]
            isOneToOne: false
            referencedRelation: "producto_especificaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spec_audit_log_planta_id_fkey"
            columns: ["planta_id"]
            isOneToOne: false
            referencedRelation: "plantas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spec_audit_log_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spec_audit_log_variable_id_fkey"
            columns: ["variable_id"]
            isOneToOne: false
            referencedRelation: "variables_calidad"
            referencedColumns: ["id"]
          },
        ]
      }
      spec_documentos: {
        Row: {
          archivado_at: string | null
          archivado_por: string | null
          bucket_path: string
          created_at: string
          descripcion: string | null
          especificacion_id: string
          hash_sha256: string | null
          id: string
          mime_type: string
          motivo_archivado: string | null
          nombre_archivo: string
          subido_at: string
          subido_por: string
          tamano_bytes: number
          updated_at: string
          vigente: boolean
        }
        Insert: {
          archivado_at?: string | null
          archivado_por?: string | null
          bucket_path: string
          created_at?: string
          descripcion?: string | null
          especificacion_id: string
          hash_sha256?: string | null
          id?: string
          mime_type: string
          motivo_archivado?: string | null
          nombre_archivo: string
          subido_at?: string
          subido_por: string
          tamano_bytes: number
          updated_at?: string
          vigente?: boolean
        }
        Update: {
          archivado_at?: string | null
          archivado_por?: string | null
          bucket_path?: string
          created_at?: string
          descripcion?: string | null
          especificacion_id?: string
          hash_sha256?: string | null
          id?: string
          mime_type?: string
          motivo_archivado?: string | null
          nombre_archivo?: string
          subido_at?: string
          subido_por?: string
          tamano_bytes?: number
          updated_at?: string
          vigente?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "spec_documentos_especificacion_id_fkey"
            columns: ["especificacion_id"]
            isOneToOne: false
            referencedRelation: "producto_especificaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      tipos_paro: {
        Row: {
          activo: boolean
          categoria: Database["public"]["Enums"]["paro_categoria"]
          codigo: string
          created_at: string
          descripcion: string | null
          id: string
          nombre: string
          orden: number
          updated_at: string
        }
        Insert: {
          activo?: boolean
          categoria: Database["public"]["Enums"]["paro_categoria"]
          codigo: string
          created_at?: string
          descripcion?: string | null
          id?: string
          nombre: string
          orden?: number
          updated_at?: string
        }
        Update: {
          activo?: boolean
          categoria?: Database["public"]["Enums"]["paro_categoria"]
          codigo?: string
          created_at?: string
          descripcion?: string | null
          id?: string
          nombre?: string
          orden?: number
          updated_at?: string
        }
        Relationships: []
      }
      tipos_producto: {
        Row: {
          activo: boolean
          codigo: string
          created_at: string
          descripcion: string | null
          familia_id: string
          id: string
          nombre: string
          orden: number
          updated_at: string
        }
        Insert: {
          activo?: boolean
          codigo: string
          created_at?: string
          descripcion?: string | null
          familia_id: string
          id?: string
          nombre: string
          orden?: number
          updated_at?: string
        }
        Update: {
          activo?: boolean
          codigo?: string
          created_at?: string
          descripcion?: string | null
          familia_id?: string
          id?: string
          nombre?: string
          orden?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tipos_producto_familia_id_fkey"
            columns: ["familia_id"]
            isOneToOne: false
            referencedRelation: "familias_producto"
            referencedColumns: ["id"]
          },
        ]
      }
      user_plantas: {
        Row: {
          created_at: string
          id: string
          planta_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          planta_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          planta_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_plantas_planta_id_fkey"
            columns: ["planta_id"]
            isOneToOne: false
            referencedRelation: "plantas"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      variables_calidad: {
        Row: {
          activo: boolean
          clave: string
          created_at: string
          etiqueta: string
          id: string
          max_default: number | null
          min_default: number | null
          objetivo_default: number | null
          orden: number
          unidad: string | null
          updated_at: string
        }
        Insert: {
          activo?: boolean
          clave: string
          created_at?: string
          etiqueta: string
          id?: string
          max_default?: number | null
          min_default?: number | null
          objetivo_default?: number | null
          orden?: number
          unidad?: string | null
          updated_at?: string
        }
        Update: {
          activo?: boolean
          clave?: string
          created_at?: string
          etiqueta?: string
          id?: string
          max_default?: number | null
          min_default?: number | null
          objetivo_default?: number | null
          orden?: number
          unidad?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_muestra_kpis_v2: {
        Row: {
          autorizado_por: string | null
          capturado_at: string | null
          cumplimiento_variables_pct: number | null
          dictamen: Database["public"]["Enums"]["qc_dictamen"] | null
          estado_workflow:
            | Database["public"]["Enums"]["qc_muestra_estado"]
            | null
          estatus_oficial: string | null
          maquina_id: string | null
          muestra_id: string | null
          numero_rollo: string | null
          op_date: string | null
          orden_id: string | null
          producto_id: string | null
          tiene_variables_fuera_spec: boolean | null
          turno: string | null
          variables_conformes: number | null
          variables_evaluables: number | null
          variables_no_conformes: number | null
        }
        Relationships: [
          {
            foreignKeyName: "muestras_calidad_maquina_id_fkey"
            columns: ["maquina_id"]
            isOneToOne: false
            referencedRelation: "maquinas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "muestras_calidad_orden_id_fkey"
            columns: ["orden_id"]
            isOneToOne: false
            referencedRelation: "ordenes_fabricacion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "muestras_calidad_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      v_turno_kpis_v2: {
        Row: {
          cumplimiento_turno_pct: number | null
          maquina_id: string | null
          op_date: string | null
          rollos_capturados: number | null
          rollos_concesion: number | null
          rollos_liberados: number | null
          rollos_no_conformes: number | null
          rollos_sin_estatus: number | null
          turno: string | null
        }
        Relationships: [
          {
            foreignKeyName: "muestras_calidad_maquina_id_fkey"
            columns: ["maquina_id"]
            isOneToOne: false
            referencedRelation: "maquinas"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_muestras_calidad_estado_oficial: {
        Row: {
          capturado_at: string | null
          dictamen: Database["public"]["Enums"]["qc_dictamen"] | null
          es_concesion: boolean | null
          es_liberado: boolean | null
          es_liberado_normal: boolean | null
          es_no_conforme: boolean | null
          esta_pendiente: boolean | null
          estado_nombre: string | null
          estado_workflow:
            | Database["public"]["Enums"]["qc_muestra_estado"]
            | null
          estatus_liberacion: string | null
          hora_muestreo: string | null
          maquina_id: string | null
          muestra_id: string | null
          numero_rollo: string | null
          orden_id: string | null
          planta_id: string | null
          producto_id: string | null
          turno: string | null
        }
        Insert: {
          capturado_at?: string | null
          dictamen?: Database["public"]["Enums"]["qc_dictamen"] | null
          es_concesion?: never
          es_liberado?: never
          es_liberado_normal?: never
          es_no_conforme?: never
          esta_pendiente?: never
          estado_nombre?: never
          estado_workflow?:
            | Database["public"]["Enums"]["qc_muestra_estado"]
            | null
          estatus_liberacion?: string | null
          hora_muestreo?: string | null
          maquina_id?: string | null
          muestra_id?: string | null
          numero_rollo?: string | null
          orden_id?: string | null
          planta_id?: string | null
          producto_id?: string | null
          turno?: string | null
        }
        Update: {
          capturado_at?: string | null
          dictamen?: Database["public"]["Enums"]["qc_dictamen"] | null
          es_concesion?: never
          es_liberado?: never
          es_liberado_normal?: never
          es_no_conforme?: never
          esta_pendiente?: never
          estado_nombre?: never
          estado_workflow?:
            | Database["public"]["Enums"]["qc_muestra_estado"]
            | null
          estatus_liberacion?: string | null
          hora_muestreo?: string | null
          maquina_id?: string | null
          muestra_id?: string | null
          numero_rollo?: string | null
          orden_id?: string | null
          planta_id?: string | null
          producto_id?: string | null
          turno?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "muestras_calidad_maquina_id_fkey"
            columns: ["maquina_id"]
            isOneToOne: false
            referencedRelation: "maquinas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "muestras_calidad_orden_id_fkey"
            columns: ["orden_id"]
            isOneToOne: false
            referencedRelation: "ordenes_fabricacion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "muestras_calidad_planta_id_fkey"
            columns: ["planta_id"]
            isOneToOne: false
            referencedRelation: "plantas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "muestras_calidad_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _pc_pesaje_desde_calidad: {
        Args: { _muestra_id: string }
        Returns: string
      }
      _pc_require_access: { Args: { _uid: string }; Returns: undefined }
      _spec_audit_estado: {
        Args: {
          _campo: Database["public"]["Enums"]["qc_spec_audit_field"]
          _motivo: string
          _producto_id: string
          _spec_id: string
          _texto_anterior: string
          _texto_nuevo: string
          _user: string
        }
        Returns: undefined
      }
      actualizar_datos_operativos_lote_cintas: {
        Args: {
          _bobinadora_id: string
          _conductor_id: string
          _lote_id: string
          _motivo: string
        }
        Returns: Json
      }
      anular_cinta: {
        Args: { _cinta_id: string; _motivo: string }
        Returns: undefined
      }
      asignar_numero_rollo: { Args: { _maquina_id: string }; Returns: string }
      audit_action: {
        Args: {
          p_datos?: Json
          p_descripcion: string
          p_modulo: string
          p_registro_id?: string
        }
        Returns: string
      }
      buscar_contexto_rollo_cintas: {
        Args: { _numero_rollo: string }
        Returns: Json
      }
      can_access_module: {
        Args: {
          _module: Database["public"]["Enums"]["app_module"]
          _user_id: string
        }
        Returns: boolean
      }
      can_change_roll_status: { Args: { _user_id: string }; Returns: boolean }
      can_edit_module: {
        Args: {
          _module: Database["public"]["Enums"]["app_module"]
          _user_id: string
        }
        Returns: boolean
      }
      cerrar_rollo_cintas: {
        Args: { _motivo: string; _numero_rollo: string }
        Returns: Json
      }
      change_roll_status: {
        Args: {
          p_dictamen: string
          p_ip?: string
          p_motivo: string
          p_muestra_id: string
          p_nuevo_estado: string
          p_observaciones?: string
          p_user_agent?: string
        }
        Returns: string
      }
      corregir_cinta: {
        Args: {
          _ancho_util: number
          _cinta_id: string
          _idempotency: string
          _motivo: string
          _observaciones: string
          _peso_cinta_kg: number
          _uniones: number
        }
        Returns: Json
      }
      crear_borrador_especificacion: {
        Args: { _motivo: string; _producto_id: string }
        Returns: string
      }
      crear_lote_pesaje_cintas: {
        Args: {
          _bobinadora_id: string
          _conductor_id: string
          _idempotency: string
          _numero_rollo: string
        }
        Returns: string
      }
      crear_lote_pesaje_cintas_manual: {
        Args: {
          _bobinadora_id: string
          _conductor_id: string
          _idempotency: string
          _numero_rollo: string
          _peso_neto_kg: number
        }
        Returns: string
      }
      crear_lote_pesaje_cintas_manual_v2: {
        Args: {
          _diametro_cm: number
          _idempotency: string
          _numero_rollo: string
          _orden_manual: string
          _peso_neto_kg: number
          _uniones: number
        }
        Returns: string
      }
      crear_muestra_con_mediciones: {
        Args: { _idempotency: string; _mediciones: Json; _muestra: Json }
        Returns: Json
      }
      descartar_borrador: {
        Args: { _motivo: string; _spec_id: string }
        Returns: undefined
      }
      ensure_orden_auto: {
        Args: {
          _maquina_id: string
          _op_date: string
          _planta_id: string
          _producto_id: string
          _turno: string
          _user_id: string
        }
        Returns: string
      }
      enviar_a_revision: {
        Args: { _motivo: string; _spec_id: string }
        Returns: undefined
      }
      estado_numeracion_rollo: { Args: { _maquina_id: string }; Returns: Json }
      finalizar_lote_cintas:
        | { Args: { _lote_id: string }; Returns: Json }
        | { Args: { _lote_id: string; _peso_mermas_kg: number }; Returns: Json }
      fn_cumplimiento_turno_v2: {
        Args: { _maquina_id: string; _op_date: string; _turno: string }
        Returns: {
          cumplimiento_turno_pct: number
          maquina_id: string
          op_date: string
          rollos_capturados: number
          rollos_concesion: number
          rollos_liberados: number
          rollos_no_conformes: number
          rollos_sin_estatus: number
          turno: string
        }[]
      }
      fn_cumplimiento_variables_rollo_v2: {
        Args: { _muestra_id: string }
        Returns: {
          cumplimiento_variables_pct: number
          muestra_id: string
          variables_conformes: number
          variables_evaluables: number
          variables_no_conformes: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      pc_bajadas_rollo: { Args: { _numero_rollo: string }; Returns: Json }
      pc_get_or_create_rollo: {
        Args: { _numero_rollo: string }
        Returns: string
      }
      pc_set_bobinador_nombre: {
        Args: { _lote_id: string; _nombre: string }
        Returns: undefined
      }
      pc_set_bobinadora: {
        Args: { _bobinadora_id: string; _lote_id: string }
        Returns: undefined
      }
      pc_set_estatus_cinta: {
        Args: { _cinta_id: string; _estatus: string }
        Returns: undefined
      }
      pc_set_nombres_operativos: {
        Args: { _conductor: string; _lote_id: string; _maquina: string }
        Returns: undefined
      }
      pc_set_orden_manual: {
        Args: { _lote_id: string; _orden: string }
        Returns: undefined
      }
      preparar_impresion_etiquetas: {
        Args: { _cinta_id?: string; _lote_id: string; _motivo?: string }
        Returns: Json
      }
      publicar_especificacion: {
        Args: { _motivo: string; _spec_id: string }
        Returns: undefined
      }
      qc_eval_liberacion: { Args: { _muestra_id: string }; Returns: Json }
      qc_eval_regla_oro: { Args: { _muestra_id: string }; Returns: Json }
      qc_recalc_estatus_muestra: {
        Args: { _muestra_id: string }
        Returns: undefined
      }
      qc_tiene_defecto: { Args: { _muestra_id: string }; Returns: boolean }
      reabrir_lote_cintas: {
        Args: { _lote_id: string; _motivo: string }
        Returns: Json
      }
      registrar_cinta: {
        Args: {
          _ancho_util: number
          _idempotency: string
          _lote_id: string
          _observaciones: string
          _peso_cinta_kg: number
          _uniones: number
        }
        Returns: Json
      }
      registrar_cinta_v2: {
        Args: {
          _ancho_util: number
          _idempotency: string
          _lote_id: string
          _lote_logistico_pza: string
          _observaciones: string
          _peso_cinta_kg: number
          _uniones: number
        }
        Returns: Json
      }
      registrar_pesaje_bobina_numerado: {
        Args: { _registro: Json }
        Returns: Json
      }
      shift_op_date: { Args: { _ts: string; _turno: string }; Returns: string }
      spec_tiene_evidencia_vigente: {
        Args: { _spec_id: string }
        Returns: boolean
      }
      trazabilidad_lote_cintas: { Args: { _lote_id: string }; Returns: Json }
      user_allowed_machine_codes: {
        Args: { _user_id: string }
        Returns: string[]
      }
      user_allowed_planta_ids: { Args: { _user_id: string }; Returns: string[] }
      user_can_use_machine: {
        Args: { _maquina_id: string; _user_id: string }
        Returns: boolean
      }
      validate_maquina_access: {
        Args: { _codigo: string; _pin: string }
        Returns: boolean
      }
      vincular_pesaje_a_muestra: {
        Args: { _muestra_id: string; _pesaje_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_module:
        | "dashboard"
        | "produccion"
        | "control_calidad"
        | "variables_calidad"
        | "reportes"
        | "configuracion"
        | "usuarios_permisos"
        | "auditoria"
        | "catalogos"
        | "ordenes_produccion"
        | "pesaje_bobina_madre"
        | "pesaje_cintas"
      app_role:
        | "administrador"
        | "gerente_general"
        | "direccion"
        | "calidad"
        | "capturista"
        | "reportes_consulta"
        | "calidad_operativo"
        | "planeacion"
        | "direccion_general"
        | "pesaje_operativo"
        | "operador"
      impresion_cinta_tipo: "ORIGINAL" | "REIMPRESION"
      maquina_estado: "libre" | "produciendo" | "paro" | "mantenimiento"
      orden_estado:
        | "borrador"
        | "programada"
        | "en_proceso"
        | "pausada"
        | "finalizada"
        | "cancelada"
      paro_categoria:
        | "materiales"
        | "cambio_produccion"
        | "limpieza"
        | "mantenimiento"
        | "falla_tecnica"
        | "calidad"
        | "recursos_humanos"
        | "servicios"
        | "planeado"
        | "otro"
      pesaje_cinta_estado: "registrada" | "sustituida" | "anulada"
      pesaje_cintas_lote_estado: "abierto" | "finalizado" | "anulado"
      qc_ajuste_flujo:
        | "solicitado"
        | "autorizado"
        | "en_ejecucion"
        | "cerrado"
        | "rechazado"
      qc_dictamen:
        | "liberada"
        | "rechazada"
        | "concesion"
        | "correccion_solicitada"
      qc_medicion_estado:
        | "pendiente"
        | "conforme"
        | "no_conforme"
        | "fuera_rango_critico"
      qc_muestra_estado:
        | "borrador"
        | "pendiente_revision"
        | "en_ajuste"
        | "reproceso"
        | "liberada"
        | "rechazada"
        | "concesion"
        | "pendiente_dictamen"
      qc_resultado_ajuste: "pendiente" | "exitoso" | "parcial" | "fallido"
      qc_spec_audit_field: "min" | "objetivo" | "max" | "caracteristicas"
      qc_tipo_ajuste:
        | "ajuste_calidad"
        | "ajuste_maquina"
        | "ajuste_parametros"
        | "cambio_materia_prima"
        | "reproceso"
        | "otro"
      qc_tipo_muestreo: "por_rollo" | "por_tiempo"
      shift_code: "1" | "2" | "3"
      spec_status:
        | "borrador"
        | "vigente"
        | "obsoleta"
        | "en_revision"
        | "descartada"
      unidad_objetivo: "kg" | "rollos" | "ambos"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_module: [
        "dashboard",
        "produccion",
        "control_calidad",
        "variables_calidad",
        "reportes",
        "configuracion",
        "usuarios_permisos",
        "auditoria",
        "catalogos",
        "ordenes_produccion",
        "pesaje_bobina_madre",
        "pesaje_cintas",
      ],
      app_role: [
        "administrador",
        "gerente_general",
        "direccion",
        "calidad",
        "capturista",
        "reportes_consulta",
        "calidad_operativo",
        "planeacion",
        "direccion_general",
        "pesaje_operativo",
        "operador",
      ],
      impresion_cinta_tipo: ["ORIGINAL", "REIMPRESION"],
      maquina_estado: ["libre", "produciendo", "paro", "mantenimiento"],
      orden_estado: [
        "borrador",
        "programada",
        "en_proceso",
        "pausada",
        "finalizada",
        "cancelada",
      ],
      paro_categoria: [
        "materiales",
        "cambio_produccion",
        "limpieza",
        "mantenimiento",
        "falla_tecnica",
        "calidad",
        "recursos_humanos",
        "servicios",
        "planeado",
        "otro",
      ],
      pesaje_cinta_estado: ["registrada", "sustituida", "anulada"],
      pesaje_cintas_lote_estado: ["abierto", "finalizado", "anulado"],
      qc_ajuste_flujo: [
        "solicitado",
        "autorizado",
        "en_ejecucion",
        "cerrado",
        "rechazado",
      ],
      qc_dictamen: [
        "liberada",
        "rechazada",
        "concesion",
        "correccion_solicitada",
      ],
      qc_medicion_estado: [
        "pendiente",
        "conforme",
        "no_conforme",
        "fuera_rango_critico",
      ],
      qc_muestra_estado: [
        "borrador",
        "pendiente_revision",
        "en_ajuste",
        "reproceso",
        "liberada",
        "rechazada",
        "concesion",
        "pendiente_dictamen",
      ],
      qc_resultado_ajuste: ["pendiente", "exitoso", "parcial", "fallido"],
      qc_spec_audit_field: ["min", "objetivo", "max", "caracteristicas"],
      qc_tipo_ajuste: [
        "ajuste_calidad",
        "ajuste_maquina",
        "ajuste_parametros",
        "cambio_materia_prima",
        "reproceso",
        "otro",
      ],
      qc_tipo_muestreo: ["por_rollo", "por_tiempo"],
      shift_code: ["1", "2", "3"],
      spec_status: [
        "borrador",
        "vigente",
        "obsoleta",
        "en_revision",
        "descartada",
      ],
      unidad_objetivo: ["kg", "rollos", "ambos"],
    },
  },
} as const
