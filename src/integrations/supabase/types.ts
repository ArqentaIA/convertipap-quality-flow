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
          nombre: string
          rol_visible: string | null
          updated_at: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          email: string
          id: string
          nombre: string
          rol_visible?: string | null
          updated_at?: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          email?: string
          id?: string
          nombre?: string
          rol_visible?: string | null
          updated_at?: string
        }
        Relationships: []
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
      app_role:
        | "administrador"
        | "gerente_general"
        | "direccion"
        | "calidad"
        | "capturista"
      shift_code: "1" | "2" | "3"
      spec_status: "borrador" | "vigente" | "obsoleta"
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
      ],
      app_role: [
        "administrador",
        "gerente_general",
        "direccion",
        "calidad",
        "capturista",
      ],
      shift_code: ["1", "2", "3"],
      spec_status: ["borrador", "vigente", "obsoleta"],
    },
  },
} as const
