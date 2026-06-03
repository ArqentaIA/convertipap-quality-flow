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
            foreignKeyName: "ajustes_calidad_muestra_verificacion_id_fkey"
            columns: ["muestra_verificacion_id"]
            isOneToOne: false
            referencedRelation: "muestras_calidad"
            referencedColumns: ["id"]
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
          id: string
          ip_address: string | null
          modulo: string | null
          operacion: string
          registro_id: string | null
          rol: string | null
          tabla_afectada: string | null
          timestamp: string
          usuario_email: string | null
          usuario_id: string | null
        }
        Insert: {
          datos_anteriores?: Json | null
          datos_nuevos?: Json | null
          descripcion_accion?: string | null
          id?: string
          ip_address?: string | null
          modulo?: string | null
          operacion: string
          registro_id?: string | null
          rol?: string | null
          tabla_afectada?: string | null
          timestamp?: string
          usuario_email?: string | null
          usuario_id?: string | null
        }
        Update: {
          datos_anteriores?: Json | null
          datos_nuevos?: Json | null
          descripcion_accion?: string | null
          id?: string
          ip_address?: string | null
          modulo?: string | null
          operacion?: string
          registro_id?: string | null
          rol?: string | null
          tabla_afectada?: string | null
          timestamp?: string
          usuario_email?: string | null
          usuario_id?: string | null
        }
        Relationships: []
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
          defectos: string[]
          dictamen: Database["public"]["Enums"]["qc_dictamen"] | null
          dictamen_at: string | null
          dictamen_motivo: string | null
          dictamen_observaciones: string | null
          especificacion_id: string
          especificacion_version: string
          estado: Database["public"]["Enums"]["qc_muestra_estado"]
          estatus_liberacion: string | null
          evidencia_url: string | null
          hora_muestreo: string
          id: string
          jefe_maquina: string | null
          maquina_id: string
          mediciones_modificacion_motivo: string | null
          mediciones_modificadas_at: string | null
          mediciones_modificadas_por: string | null
          numero_rollo: string
          observaciones_generales: string
          operador: string | null
          operario_id: string | null
          orden_id: string | null
          planta_id: string
          prensero: string | null
          producto_id: string
          revisado_at: string | null
          revisado_por: string | null
          rol_autorizador: Database["public"]["Enums"]["app_role"] | null
          tipo_muestreo: Database["public"]["Enums"]["qc_tipo_muestreo"]
          turno: string
          updated_at: string
          variables_snapshot_json: Json
        }
        Insert: {
          analista?: string | null
          autorizado_at?: string | null
          autorizado_por?: string | null
          capturado_at?: string
          capturado_por: string
          created_at?: string
          defectos?: string[]
          dictamen?: Database["public"]["Enums"]["qc_dictamen"] | null
          dictamen_at?: string | null
          dictamen_motivo?: string | null
          dictamen_observaciones?: string | null
          especificacion_id: string
          especificacion_version: string
          estado?: Database["public"]["Enums"]["qc_muestra_estado"]
          estatus_liberacion?: string | null
          evidencia_url?: string | null
          hora_muestreo?: string
          id?: string
          jefe_maquina?: string | null
          maquina_id: string
          mediciones_modificacion_motivo?: string | null
          mediciones_modificadas_at?: string | null
          mediciones_modificadas_por?: string | null
          numero_rollo: string
          observaciones_generales?: string
          operador?: string | null
          operario_id?: string | null
          orden_id?: string | null
          planta_id: string
          prensero?: string | null
          producto_id: string
          revisado_at?: string | null
          revisado_por?: string | null
          rol_autorizador?: Database["public"]["Enums"]["app_role"] | null
          tipo_muestreo: Database["public"]["Enums"]["qc_tipo_muestreo"]
          turno: string
          updated_at?: string
          variables_snapshot_json?: Json
        }
        Update: {
          analista?: string | null
          autorizado_at?: string | null
          autorizado_por?: string | null
          capturado_at?: string
          capturado_por?: string
          created_at?: string
          defectos?: string[]
          dictamen?: Database["public"]["Enums"]["qc_dictamen"] | null
          dictamen_at?: string | null
          dictamen_motivo?: string | null
          dictamen_observaciones?: string | null
          especificacion_id?: string
          especificacion_version?: string
          estado?: Database["public"]["Enums"]["qc_muestra_estado"]
          estatus_liberacion?: string | null
          evidencia_url?: string | null
          hora_muestreo?: string
          id?: string
          jefe_maquina?: string | null
          maquina_id?: string
          mediciones_modificacion_motivo?: string | null
          mediciones_modificadas_at?: string | null
          mediciones_modificadas_por?: string | null
          numero_rollo?: string
          observaciones_generales?: string
          operador?: string | null
          operario_id?: string | null
          orden_id?: string | null
          planta_id?: string
          prensero?: string | null
          producto_id?: string
          revisado_at?: string | null
          revisado_por?: string | null
          rol_autorizador?: Database["public"]["Enums"]["app_role"] | null
          tipo_muestreo?: Database["public"]["Enums"]["qc_tipo_muestreo"]
          turno?: string
          updated_at?: string
          variables_snapshot_json?: Json
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
      producto_especificaciones: {
        Row: {
          aprobado_at: string | null
          aprobado_por: string | null
          created_at: string
          estado: Database["public"]["Enums"]["spec_status"]
          id: string
          notas: string | null
          producto_id: string
          updated_at: string
          version: string
          vigente_desde: string | null
          vigente_hasta: string | null
        }
        Insert: {
          aprobado_at?: string | null
          aprobado_por?: string | null
          created_at?: string
          estado?: Database["public"]["Enums"]["spec_status"]
          id?: string
          notas?: string | null
          producto_id: string
          updated_at?: string
          version: string
          vigente_desde?: string | null
          vigente_hasta?: string | null
        }
        Update: {
          aprobado_at?: string | null
          aprobado_por?: string | null
          created_at?: string
          estado?: Database["public"]["Enums"]["spec_status"]
          id?: string
          notas?: string | null
          producto_id?: string
          updated_at?: string
          version?: string
          vigente_desde?: string | null
          vigente_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "producto_especificaciones_producto_id_fkey"
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
          valor_nuevo: number | null
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
          valor_nuevo?: number | null
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
          valor_nuevo?: number | null
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
      [_ in never]: never
    }
    Functions: {
      audit_action: {
        Args: {
          p_datos?: Json
          p_descripcion: string
          p_modulo: string
          p_registro_id?: string
        }
        Returns: string
      }
      can_access_module: {
        Args: {
          _module: Database["public"]["Enums"]["app_module"]
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
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
      app_role:
        | "administrador"
        | "gerente_general"
        | "direccion"
        | "calidad"
        | "capturista"
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
      qc_ajuste_flujo:
        | "solicitado"
        | "autorizado"
        | "en_ejecucion"
        | "cerrado"
        | "rechazado"
      qc_dictamen: "liberada" | "rechazada" | "concesion"
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
      qc_resultado_ajuste: "pendiente" | "exitoso" | "parcial" | "fallido"
      qc_spec_audit_field: "min" | "objetivo" | "max"
      qc_tipo_ajuste:
        | "ajuste_calidad"
        | "ajuste_maquina"
        | "ajuste_parametros"
        | "cambio_materia_prima"
        | "reproceso"
        | "otro"
      qc_tipo_muestreo: "por_rollo" | "por_tiempo"
      shift_code: "1" | "2" | "3"
      spec_status: "borrador" | "vigente" | "obsoleta"
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
      ],
      app_role: [
        "administrador",
        "gerente_general",
        "direccion",
        "calidad",
        "capturista",
      ],
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
      qc_ajuste_flujo: [
        "solicitado",
        "autorizado",
        "en_ejecucion",
        "cerrado",
        "rechazado",
      ],
      qc_dictamen: ["liberada", "rechazada", "concesion"],
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
      ],
      qc_resultado_ajuste: ["pendiente", "exitoso", "parcial", "fallido"],
      qc_spec_audit_field: ["min", "objetivo", "max"],
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
      spec_status: ["borrador", "vigente", "obsoleta"],
      unidad_objetivo: ["kg", "rollos", "ambos"],
    },
  },
} as const
