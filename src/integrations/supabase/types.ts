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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      active_sessions: {
        Row: {
          created_at: string | null
          device_info: string | null
          id: string
          last_activity: string | null
          session_token: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          device_info?: string | null
          id?: string
          last_activity?: string | null
          session_token: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          device_info?: string | null
          id?: string
          last_activity?: string | null
          session_token?: string
          user_id?: string
        }
        Relationships: []
      }
      admin_crm_followup_template: {
        Row: {
          offset_days: number
          step: number
        }
        Insert: {
          offset_days: number
          step: number
        }
        Update: {
          offset_days?: number
          step?: number
        }
        Relationships: []
      }
      admin_crm_stages: {
        Row: {
          color: string
          created_at: string
          id: string
          is_lost: boolean
          is_won: boolean
          name: string
          position: number
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          is_lost?: boolean
          is_won?: boolean
          name: string
          position?: number
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          is_lost?: boolean
          is_won?: boolean
          name?: string
          position?: number
          updated_at?: string
        }
        Relationships: []
      }
      admin_financial_categories: {
        Row: {
          color: string
          created_at: string
          icon: string | null
          id: string
          is_active: boolean
          is_system: boolean
          label: string
          name: string
          sort_order: number
          type: string
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          label: string
          name: string
          sort_order?: number
          type: string
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          label?: string
          name?: string
          sort_order?: number
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      admin_financial_transactions: {
        Row: {
          amount: number
          asaas_transaction_id: string | null
          category: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          notes: string | null
          reference_id: string | null
          reference_type: string | null
          transaction_date: string
          type: string
        }
        Insert: {
          amount?: number
          asaas_transaction_id?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          notes?: string | null
          reference_id?: string | null
          reference_type?: string | null
          transaction_date?: string
          type: string
        }
        Update: {
          amount?: number
          asaas_transaction_id?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          notes?: string | null
          reference_id?: string | null
          reference_type?: string | null
          transaction_date?: string
          type?: string
        }
        Relationships: []
      }
      admin_lead_interactions: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          interaction_type: string
          lead_id: string
          next_action: string | null
          next_action_date: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          interaction_type: string
          lead_id: string
          next_action?: string | null
          next_action_date?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          interaction_type?: string
          lead_id?: string
          next_action?: string | null
          next_action_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_lead_interactions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "admin_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_leads: {
        Row: {
          company_name: string | null
          contact_name: string | null
          created_at: string
          created_by: string | null
          email: string | null
          expected_close_date: string | null
          id: string
          loss_reason: string | null
          notes: string | null
          phone: string | null
          probability: number | null
          responsible_id: string | null
          segment: string | null
          source: string | null
          stage_id: string | null
          title: string
          updated_at: string
          value: number | null
        }
        Insert: {
          company_name?: string | null
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          expected_close_date?: string | null
          id?: string
          loss_reason?: string | null
          notes?: string | null
          phone?: string | null
          probability?: number | null
          responsible_id?: string | null
          segment?: string | null
          source?: string | null
          stage_id?: string | null
          title: string
          updated_at?: string
          value?: number | null
        }
        Update: {
          company_name?: string | null
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          expected_close_date?: string | null
          id?: string
          loss_reason?: string | null
          notes?: string | null
          phone?: string | null
          probability?: number | null
          responsible_id?: string | null
          segment?: string | null
          source?: string | null
          stage_id?: string | null
          title?: string
          updated_at?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_leads_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "admin_crm_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_notifications: {
        Row: {
          created_at: string
          data: Json | null
          id: string
          is_read: boolean
          message: string | null
          title: string | null
          type: string
        }
        Insert: {
          created_at?: string
          data?: Json | null
          id?: string
          is_read?: boolean
          message?: string | null
          title?: string | null
          type: string
        }
        Update: {
          created_at?: string
          data?: Json | null
          id?: string
          is_read?: boolean
          message?: string | null
          title?: string | null
          type?: string
        }
        Relationships: []
      }
      admin_permissions: {
        Row: {
          created_at: string
          id: string
          permission: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          permission: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          permission?: string
          user_id?: string
        }
        Relationships: []
      }
      admin_tasks: {
        Row: {
          assigned_to: string | null
          completed_by: string | null
          created_at: string
          created_by: string | null
          crm_lead_id: string | null
          description: string | null
          due_date: string | null
          followup_step: number | null
          id: string
          observation: string | null
          priority: Database["public"]["Enums"]["admin_task_priority"]
          resolved_at: string | null
          status: Database["public"]["Enums"]["admin_task_status"]
          title: string
          type: Database["public"]["Enums"]["admin_task_type"]
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          crm_lead_id?: string | null
          description?: string | null
          due_date?: string | null
          followup_step?: number | null
          id?: string
          observation?: string | null
          priority?: Database["public"]["Enums"]["admin_task_priority"]
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["admin_task_status"]
          title: string
          type?: Database["public"]["Enums"]["admin_task_type"]
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          crm_lead_id?: string | null
          description?: string | null
          due_date?: string | null
          followup_step?: number | null
          id?: string
          observation?: string | null
          priority?: Database["public"]["Enums"]["admin_task_priority"]
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["admin_task_status"]
          title?: string
          type?: Database["public"]["Enums"]["admin_task_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_tasks_crm_lead_id_fkey"
            columns: ["crm_lead_id"]
            isOneToOne: false
            referencedRelation: "admin_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          address: string | null
          address_number: string | null
          asaas_customer_id: string | null
          asaas_subscription_id: string | null
          billing_cycle: string | null
          city: string | null
          cnpj: string | null
          complement: string | null
          contact_name: string | null
          created_at: string | null
          custom_price: number | null
          custom_price_months: number | null
          custom_price_payments_made: number
          custom_price_permanent: boolean
          email: string | null
          extra_users: number | null
          ibge_municipality_code: string | null
          id: string
          logo_url: string | null
          ltv: number
          max_users: number | null
          name: string
          neighborhood: string | null
          nfse_tier: number
          notes: string | null
          origin: string | null
          payment_lock_bypass: boolean
          payment_method: string | null
          pending_billing_cycle: string | null
          pending_max_users: number | null
          pending_modules: Json | null
          pending_plan_code: string | null
          pending_subscription_value: number | null
          phone: string | null
          salesperson_id: string | null
          sdr_id: string | null
          segment: string | null
          state: string | null
          street_number: string | null
          subscription_expires_at: string | null
          subscription_plan: string | null
          subscription_status: string
          subscription_value: number | null
          trial_days: number | null
          updated_at: string | null
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          address_number?: string | null
          asaas_customer_id?: string | null
          asaas_subscription_id?: string | null
          billing_cycle?: string | null
          city?: string | null
          cnpj?: string | null
          complement?: string | null
          contact_name?: string | null
          created_at?: string | null
          custom_price?: number | null
          custom_price_months?: number | null
          custom_price_payments_made?: number
          custom_price_permanent?: boolean
          email?: string | null
          extra_users?: number | null
          ibge_municipality_code?: string | null
          id?: string
          logo_url?: string | null
          ltv?: number
          max_users?: number | null
          name: string
          neighborhood?: string | null
          nfse_tier?: number
          notes?: string | null
          origin?: string | null
          payment_lock_bypass?: boolean
          payment_method?: string | null
          pending_billing_cycle?: string | null
          pending_max_users?: number | null
          pending_modules?: Json | null
          pending_plan_code?: string | null
          pending_subscription_value?: number | null
          phone?: string | null
          salesperson_id?: string | null
          sdr_id?: string | null
          segment?: string | null
          state?: string | null
          street_number?: string | null
          subscription_expires_at?: string | null
          subscription_plan?: string | null
          subscription_status?: string
          subscription_value?: number | null
          trial_days?: number | null
          updated_at?: string | null
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          address_number?: string | null
          asaas_customer_id?: string | null
          asaas_subscription_id?: string | null
          billing_cycle?: string | null
          city?: string | null
          cnpj?: string | null
          complement?: string | null
          contact_name?: string | null
          created_at?: string | null
          custom_price?: number | null
          custom_price_months?: number | null
          custom_price_payments_made?: number
          custom_price_permanent?: boolean
          email?: string | null
          extra_users?: number | null
          ibge_municipality_code?: string | null
          id?: string
          logo_url?: string | null
          ltv?: number
          max_users?: number | null
          name?: string
          neighborhood?: string | null
          nfse_tier?: number
          notes?: string | null
          origin?: string | null
          payment_lock_bypass?: boolean
          payment_method?: string | null
          pending_billing_cycle?: string | null
          pending_max_users?: number | null
          pending_modules?: Json | null
          pending_plan_code?: string | null
          pending_subscription_value?: number | null
          phone?: string | null
          salesperson_id?: string | null
          sdr_id?: string | null
          segment?: string | null
          state?: string | null
          street_number?: string | null
          subscription_expires_at?: string | null
          subscription_plan?: string | null
          subscription_status?: string
          subscription_value?: number | null
          trial_days?: number | null
          updated_at?: string | null
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_nfse_tier_fkey"
            columns: ["nfse_tier"]
            isOneToOne: false
            referencedRelation: "nfse_tiers"
            referencedColumns: ["tier"]
          },
          {
            foreignKeyName: "companies_salesperson_id_fkey"
            columns: ["salesperson_id"]
            isOneToOne: false
            referencedRelation: "salespeople"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companies_salesperson_id_fkey"
            columns: ["salesperson_id"]
            isOneToOne: false
            referencedRelation: "salespeople_basic"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companies_sdr_id_fkey"
            columns: ["sdr_id"]
            isOneToOne: false
            referencedRelation: "salespeople"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companies_sdr_id_fkey"
            columns: ["sdr_id"]
            isOneToOne: false
            referencedRelation: "salespeople_basic"
            referencedColumns: ["id"]
          },
        ]
      }
      company_fiscal_settings: {
        Row: {
          certificate_expires_at: string | null
          codigo_nbs_default: string | null
          codigo_servico_default: string | null
          company_id: string
          created_at: string | null
          fiscal_ambiente: string
          fisqal_certificate_id: string | null
          fisqal_company_id: string | null
          id: string
          inscricao_estadual: string | null
          inscricao_municipal: string | null
          iss_aliquota: number | null
          item_lc116: string | null
          municipio_ibge: string | null
          pode_emitir: boolean
          regime_tributario: string | null
          serie_dps: string | null
          ultimo_numero_dps: number
          updated_at: string | null
        }
        Insert: {
          certificate_expires_at?: string | null
          codigo_nbs_default?: string | null
          codigo_servico_default?: string | null
          company_id: string
          created_at?: string | null
          fiscal_ambiente?: string
          fisqal_certificate_id?: string | null
          fisqal_company_id?: string | null
          id?: string
          inscricao_estadual?: string | null
          inscricao_municipal?: string | null
          iss_aliquota?: number | null
          item_lc116?: string | null
          municipio_ibge?: string | null
          pode_emitir?: boolean
          regime_tributario?: string | null
          serie_dps?: string | null
          ultimo_numero_dps?: number
          updated_at?: string | null
        }
        Update: {
          certificate_expires_at?: string | null
          codigo_nbs_default?: string | null
          codigo_servico_default?: string | null
          company_id?: string
          created_at?: string | null
          fiscal_ambiente?: string
          fisqal_certificate_id?: string | null
          fisqal_company_id?: string | null
          id?: string
          inscricao_estadual?: string | null
          inscricao_municipal?: string | null
          iss_aliquota?: number | null
          item_lc116?: string | null
          municipio_ibge?: string | null
          pode_emitir?: boolean
          regime_tributario?: string | null
          serie_dps?: string | null
          ultimo_numero_dps?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_fiscal_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_modules: {
        Row: {
          activated_at: string | null
          company_id: string
          id: string
          module_code: string
          quantity: number | null
        }
        Insert: {
          activated_at?: string | null
          company_id: string
          id?: string
          module_code: string
          quantity?: number | null
        }
        Update: {
          activated_at?: string | null
          company_id?: string
          id?: string
          module_code?: string
          quantity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "company_modules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_origins: {
        Row: {
          color: string | null
          created_at: string | null
          icon: string | null
          id: string
          name: string
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          icon?: string | null
          id?: string
          name: string
        }
        Update: {
          color?: string | null
          created_at?: string | null
          icon?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      company_payments: {
        Row: {
          amount: number
          asaas_payment_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          origin: string | null
          payment_date: string
          payment_method: string | null
          type: string
        }
        Insert: {
          amount?: number
          asaas_payment_id?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          origin?: string | null
          payment_date?: string
          payment_method?: string | null
          type?: string
        }
        Update: {
          amount?: number
          asaas_payment_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          origin?: string | null
          payment_date?: string
          payment_method?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_payments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_pmoc_document_templates: {
        Row: {
          certificado_content: string | null
          certificado_validity_months: number
          company_id: string
          created_at: string
          termo_rt_content: string | null
          termo_rt_validity_months: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          certificado_content?: string | null
          certificado_validity_months?: number
          company_id: string
          created_at?: string
          termo_rt_content?: string | null
          termo_rt_validity_months?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          certificado_content?: string | null
          certificado_validity_months?: number
          company_id?: string
          created_at?: string
          termo_rt_content?: string | null
          termo_rt_validity_months?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_pmoc_document_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_settings: {
        Row: {
          address: string | null
          address_number: string | null
          city: string | null
          company_id: string | null
          complement: string | null
          created_at: string
          document: string | null
          email: string | null
          id: string
          logo_url: string | null
          name: string
          neighborhood: string | null
          phone: string | null
          proposal_customization: Json | null
          report_header_bg_color: string | null
          report_header_logo_bg_color: string | null
          report_header_logo_size: number | null
          report_header_logo_type: string | null
          report_header_show_logo_bg: boolean | null
          report_header_text_color: string | null
          report_status_bar_color: string | null
          segment: string | null
          show_address_in_documents: boolean
          show_cnpj_in_documents: boolean
          show_email_in_documents: boolean
          show_name_in_documents: boolean
          show_phone_in_documents: boolean
          state: string | null
          updated_at: string
          white_label_enabled: boolean
          white_label_icon_url: string | null
          white_label_logo_url: string | null
          white_label_primary_color: string | null
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          address_number?: string | null
          city?: string | null
          company_id?: string | null
          complement?: string | null
          created_at?: string
          document?: string | null
          email?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          neighborhood?: string | null
          phone?: string | null
          proposal_customization?: Json | null
          report_header_bg_color?: string | null
          report_header_logo_bg_color?: string | null
          report_header_logo_size?: number | null
          report_header_logo_type?: string | null
          report_header_show_logo_bg?: boolean | null
          report_header_text_color?: string | null
          report_status_bar_color?: string | null
          segment?: string | null
          show_address_in_documents?: boolean
          show_cnpj_in_documents?: boolean
          show_email_in_documents?: boolean
          show_name_in_documents?: boolean
          show_phone_in_documents?: boolean
          state?: string | null
          updated_at?: string
          white_label_enabled?: boolean
          white_label_icon_url?: string | null
          white_label_logo_url?: string | null
          white_label_primary_color?: string | null
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          address_number?: string | null
          city?: string | null
          company_id?: string | null
          complement?: string | null
          created_at?: string
          document?: string | null
          email?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          neighborhood?: string | null
          phone?: string | null
          proposal_customization?: Json | null
          report_header_bg_color?: string | null
          report_header_logo_bg_color?: string | null
          report_header_logo_size?: number | null
          report_header_logo_type?: string | null
          report_header_show_logo_bg?: boolean | null
          report_header_text_color?: string | null
          report_status_bar_color?: string | null
          segment?: string | null
          show_address_in_documents?: boolean
          show_cnpj_in_documents?: boolean
          show_email_in_documents?: boolean
          show_name_in_documents?: boolean
          show_phone_in_documents?: boolean
          state?: string | null
          updated_at?: string
          white_label_enabled?: boolean
          white_label_icon_url?: string | null
          white_label_logo_url?: string | null
          white_label_primary_color?: string | null
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      compra_cotacao_precos: {
        Row: {
          company_id: string
          compra_material_id: string
          cotacao_id: string
          created_at: string
          id: string
          unit_price: number
        }
        Insert: {
          company_id: string
          compra_material_id: string
          cotacao_id: string
          created_at?: string
          id?: string
          unit_price: number
        }
        Update: {
          company_id?: string
          compra_material_id?: string
          cotacao_id?: string
          created_at?: string
          id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "compra_cotacao_precos_compra_material_id_fkey"
            columns: ["compra_material_id"]
            isOneToOne: false
            referencedRelation: "compra_materiais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compra_cotacao_precos_cotacao_id_fkey"
            columns: ["cotacao_id"]
            isOneToOne: false
            referencedRelation: "compra_cotacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      compra_cotacoes: {
        Row: {
          company_id: string
          compra_id: string
          created_at: string
          decided_at: string | null
          id: string
          notes: string | null
          status: string
          supplier_id: string
          updated_at: string
        }
        Insert: {
          company_id: string
          compra_id: string
          created_at?: string
          decided_at?: string | null
          id?: string
          notes?: string | null
          status?: string
          supplier_id: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          compra_id?: string
          created_at?: string
          decided_at?: string | null
          id?: string
          notes?: string | null
          status?: string
          supplier_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "compra_cotacoes_compra_id_fkey"
            columns: ["compra_id"]
            isOneToOne: false
            referencedRelation: "compras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compra_cotacoes_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      compra_materiais: {
        Row: {
          company_id: string
          compra_id: string
          created_at: string
          id: string
          inventory_id: string | null
          material_name: string | null
          quantity: number
          unit: string | null
        }
        Insert: {
          company_id: string
          compra_id: string
          created_at?: string
          id?: string
          inventory_id?: string | null
          material_name?: string | null
          quantity: number
          unit?: string | null
        }
        Update: {
          company_id?: string
          compra_id?: string
          created_at?: string
          id?: string
          inventory_id?: string | null
          material_name?: string | null
          quantity?: number
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compra_materiais_compra_id_fkey"
            columns: ["compra_id"]
            isOneToOne: false
            referencedRelation: "compras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compra_materiais_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "inventory"
            referencedColumns: ["id"]
          },
        ]
      }
      compras: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          numero: number
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          numero?: number
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          numero?: number
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      compras_number_counters: {
        Row: {
          company_id: string
          next_value: number
        }
        Insert: {
          company_id: string
          next_value?: number
        }
        Update: {
          company_id?: string
          next_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "compras_number_counters_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      compressor_specs: {
        Row: {
          aplicacao: string | null
          capacidade_btu: string | null
          capacitor_partida: string | null
          capacitor_trabalho: string | null
          conexoes: string | null
          created_at: string
          deslocamento_cm3: string | null
          equivalencias: string | null
          frequencia: string | null
          hp: string | null
          lra: string | null
          model_id: string
          observacoes: string | null
          oleo: string | null
          rele_protetor: string | null
          rla: string | null
          tensao: string | null
        }
        Insert: {
          aplicacao?: string | null
          capacidade_btu?: string | null
          capacitor_partida?: string | null
          capacitor_trabalho?: string | null
          conexoes?: string | null
          created_at?: string
          deslocamento_cm3?: string | null
          equivalencias?: string | null
          frequencia?: string | null
          hp?: string | null
          lra?: string | null
          model_id: string
          observacoes?: string | null
          oleo?: string | null
          rele_protetor?: string | null
          rla?: string | null
          tensao?: string | null
        }
        Update: {
          aplicacao?: string | null
          capacidade_btu?: string | null
          capacitor_partida?: string | null
          capacitor_trabalho?: string | null
          conexoes?: string | null
          created_at?: string
          deslocamento_cm3?: string | null
          equivalencias?: string | null
          frequencia?: string | null
          hp?: string | null
          lra?: string | null
          model_id?: string
          observacoes?: string | null
          oleo?: string | null
          rele_protetor?: string | null
          rla?: string | null
          tensao?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compressor_specs_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: true
            referencedRelation: "equipment_models"
            referencedColumns: ["id"]
          },
        ]
      }
      consent_records: {
        Row: {
          accepted_at: string
          company_id: string | null
          id: string
          ip_address: unknown
          purpose: string
          revoked_at: string | null
          user_agent: string | null
          user_id: string | null
          version: string
        }
        Insert: {
          accepted_at?: string
          company_id?: string | null
          id?: string
          ip_address?: unknown
          purpose: string
          revoked_at?: string | null
          user_agent?: string | null
          user_id?: string | null
          version?: string
        }
        Update: {
          accepted_at?: string
          company_id?: string | null
          id?: string
          ip_address?: unknown
          purpose?: string
          revoked_at?: string | null
          user_agent?: string | null
          user_id?: string | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "consent_records_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_environments: {
        Row: {
          area_climatizada_m2: number | null
          carga_termica_tr: number | null
          company_id: string
          contract_id: string
          created_at: string
          id: string
          identificacao: string | null
          ocupantes_fixos: number | null
          ocupantes_flutuantes: number | null
          photo_url: string | null
          sort_order: number
          tipo_atividade: string | null
          updated_at: string
        }
        Insert: {
          area_climatizada_m2?: number | null
          carga_termica_tr?: number | null
          company_id: string
          contract_id: string
          created_at?: string
          id?: string
          identificacao?: string | null
          ocupantes_fixos?: number | null
          ocupantes_flutuantes?: number | null
          photo_url?: string | null
          sort_order?: number
          tipo_atividade?: string | null
          updated_at?: string
        }
        Update: {
          area_climatizada_m2?: number | null
          carga_termica_tr?: number | null
          company_id?: string
          contract_id?: string
          created_at?: string
          id?: string
          identificacao?: string | null
          ocupantes_fixos?: number | null
          ocupantes_flutuantes?: number | null
          photo_url?: string | null
          sort_order?: number
          tipo_atividade?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_environments_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contract_health_status"
            referencedColumns: ["contract_id"]
          },
          {
            foreignKeyName: "contract_environments_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_items: {
        Row: {
          contract_id: string
          created_at: string
          environment_id: string | null
          equipment_id: string | null
          form_template_id: string | null
          id: string
          item_description: string | null
          item_name: string
          pmoc_scope: string
          pmoc_start_visit: number
          sort_order: number | null
        }
        Insert: {
          contract_id: string
          created_at?: string
          environment_id?: string | null
          equipment_id?: string | null
          form_template_id?: string | null
          id?: string
          item_description?: string | null
          item_name: string
          pmoc_scope?: string
          pmoc_start_visit?: number
          sort_order?: number | null
        }
        Update: {
          contract_id?: string
          created_at?: string
          environment_id?: string | null
          equipment_id?: string | null
          form_template_id?: string | null
          id?: string
          item_description?: string | null
          item_name?: string
          pmoc_scope?: string
          pmoc_start_visit?: number
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_items_environment_id_fkey"
            columns: ["environment_id"]
            isOneToOne: false
            referencedRelation: "contract_environments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_items_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contract_health_status"
            referencedColumns: ["contract_id"]
          },
          {
            foreignKeyName: "contract_items_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_items_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_items_form_template_id_fkey"
            columns: ["form_template_id"]
            isOneToOne: false
            referencedRelation: "form_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_plan_activities: {
        Row: {
          applies_per_equipment: boolean
          catalog_activity_id: string | null
          company_id: string
          component: string | null
          contract_id: string
          contract_item_id: string | null
          created_at: string
          description: string
          expected_max: number | null
          expected_min: number | null
          freq_code: string | null
          freq_months: number | null
          form_template_id: string | null
          guidance: string | null
          id: string
          is_active: boolean
          is_measurement: boolean
          section: string | null
          sort_order: number
          unit: string | null
          updated_at: string
        }
        Insert: {
          applies_per_equipment?: boolean
          catalog_activity_id?: string | null
          company_id: string
          component?: string | null
          contract_id: string
          contract_item_id?: string | null
          created_at?: string
          description: string
          expected_max?: number | null
          expected_min?: number | null
          freq_code?: string | null
          freq_months?: number | null
          form_template_id?: string | null
          guidance?: string | null
          id?: string
          is_active?: boolean
          is_measurement?: boolean
          section?: string | null
          sort_order?: number
          unit?: string | null
          updated_at?: string
        }
        Update: {
          applies_per_equipment?: boolean
          catalog_activity_id?: string | null
          company_id?: string
          component?: string | null
          contract_id?: string
          contract_item_id?: string | null
          created_at?: string
          description?: string
          expected_max?: number | null
          expected_min?: number | null
          freq_code?: string | null
          freq_months?: number | null
          form_template_id?: string | null
          guidance?: string | null
          id?: string
          is_active?: boolean
          is_measurement?: boolean
          section?: string | null
          sort_order?: number
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_plan_activities_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contract_health_status"
            referencedColumns: ["contract_id"]
          },
          {
            foreignKeyName: "contract_plan_activities_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_plan_activities_contract_item_id_fkey"
            columns: ["contract_item_id"]
            isOneToOne: false
            referencedRelation: "contract_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_plan_activities_form_template_id_fkey"
            columns: ["form_template_id"]
            isOneToOne: false
            referencedRelation: "form_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          billing_responsible_id: string | null
          billing_responsible_ids: string[] | null
          company_id: string
          created_at: string
          created_by: string | null
          customer_id: string
          form_template_id: string | null
          frequency_type: string
          frequency_value: number
          horizon_months: number
          id: string
          is_pmoc: boolean
          name: string
          next_pmoc_generation_date: string | null
          notes: string | null
          pmoc_area_climatizada_m2: number | null
          pmoc_carga_termica_tr: number | null
          pmoc_identificacao_ambiente: string | null
          pmoc_legal_compliance_text: string | null
          pmoc_ocupantes_fixos: number | null
          pmoc_ocupantes_flutuantes: number | null
          pmoc_tipo_atividade: string | null
          portal_documents_released: boolean
          portal_is_public: boolean
          public_pmoc_token: string | null
          public_short_code: string | null
          responsible_technician_id: string | null
          service_type_id: string | null
          show_billing_in_schedule: boolean
          start_date: string
          status: string
          team_id: string | null
          technician_id: string | null
          unidade_bairro: string | null
          unidade_cep: string | null
          unidade_cidade: string | null
          unidade_complemento: string | null
          unidade_endereco: string | null
          unidade_nome: string | null
          unidade_numero: string | null
          unidade_uf: string | null
          updated_at: string
        }
        Insert: {
          billing_responsible_id?: string | null
          billing_responsible_ids?: string[] | null
          company_id: string
          created_at?: string
          created_by?: string | null
          customer_id: string
          form_template_id?: string | null
          frequency_type?: string
          frequency_value?: number
          horizon_months?: number
          id?: string
          is_pmoc?: boolean
          name: string
          next_pmoc_generation_date?: string | null
          notes?: string | null
          pmoc_area_climatizada_m2?: number | null
          pmoc_carga_termica_tr?: number | null
          pmoc_identificacao_ambiente?: string | null
          pmoc_legal_compliance_text?: string | null
          pmoc_ocupantes_fixos?: number | null
          pmoc_ocupantes_flutuantes?: number | null
          pmoc_tipo_atividade?: string | null
          portal_documents_released?: boolean
          portal_is_public?: boolean
          public_pmoc_token?: string | null
          public_short_code?: string | null
          responsible_technician_id?: string | null
          service_type_id?: string | null
          show_billing_in_schedule?: boolean
          start_date: string
          status?: string
          team_id?: string | null
          technician_id?: string | null
          unidade_bairro?: string | null
          unidade_cep?: string | null
          unidade_cidade?: string | null
          unidade_complemento?: string | null
          unidade_endereco?: string | null
          unidade_nome?: string | null
          unidade_numero?: string | null
          unidade_uf?: string | null
          updated_at?: string
        }
        Update: {
          billing_responsible_id?: string | null
          billing_responsible_ids?: string[] | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string
          form_template_id?: string | null
          frequency_type?: string
          frequency_value?: number
          horizon_months?: number
          id?: string
          is_pmoc?: boolean
          name?: string
          next_pmoc_generation_date?: string | null
          notes?: string | null
          pmoc_area_climatizada_m2?: number | null
          pmoc_carga_termica_tr?: number | null
          pmoc_identificacao_ambiente?: string | null
          pmoc_legal_compliance_text?: string | null
          pmoc_ocupantes_fixos?: number | null
          pmoc_ocupantes_flutuantes?: number | null
          pmoc_tipo_atividade?: string | null
          portal_documents_released?: boolean
          portal_is_public?: boolean
          public_pmoc_token?: string | null
          public_short_code?: string | null
          responsible_technician_id?: string | null
          service_type_id?: string | null
          show_billing_in_schedule?: boolean
          start_date?: string
          status?: string
          team_id?: string | null
          technician_id?: string | null
          unidade_bairro?: string | null
          unidade_cep?: string | null
          unidade_cidade?: string | null
          unidade_complemento?: string | null
          unidade_endereco?: string | null
          unidade_nome?: string | null
          unidade_numero?: string | null
          unidade_uf?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contracts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_form_template_id_fkey"
            columns: ["form_template_id"]
            isOneToOne: false
            referencedRelation: "form_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_responsible_technician_id_fkey"
            columns: ["responsible_technician_id"]
            isOneToOne: false
            referencedRelation: "responsible_technicians"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_service_type_id_fkey"
            columns: ["service_type_id"]
            isOneToOne: false
            referencedRelation: "service_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_resource_items: {
        Row: {
          annual_value: number | null
          id: string
          is_monthly: boolean | null
          name: string
          qty_per_gift: number | null
          resource_id: string
          sort_order: number | null
          total_cost: number | null
          total_units: number | null
          value: number
        }
        Insert: {
          annual_value?: number | null
          id?: string
          is_monthly?: boolean | null
          name: string
          qty_per_gift?: number | null
          resource_id: string
          sort_order?: number | null
          total_cost?: number | null
          total_units?: number | null
          value?: number
        }
        Update: {
          annual_value?: number | null
          id?: string
          is_monthly?: boolean | null
          name?: string
          qty_per_gift?: number | null
          resource_id?: string
          sort_order?: number | null
          total_cost?: number | null
          total_units?: number | null
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "cost_resource_items_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "cost_resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_resource_items_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "cost_resources_with_rate"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_resources: {
        Row: {
          category: string
          company_id: string
          created_at: string | null
          id: string
          is_active: boolean | null
          monthly_hours: number | null
          name: string
          notes: string | null
          photo_url: string | null
          updated_at: string | null
        }
        Insert: {
          category: string
          company_id: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          monthly_hours?: number | null
          name: string
          notes?: string | null
          photo_url?: string | null
          updated_at?: string | null
        }
        Update: {
          category?: string
          company_id?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          monthly_hours?: number | null
          name?: string
          notes?: string | null
          photo_url?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cost_resources_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_card_bills: {
        Row: {
          account_id: string
          amount_paid: number
          closing_date: string
          company_id: string
          created_at: string
          due_date: string
          id: string
          notes: string | null
          paid_at: string | null
          payment_transaction_id: string | null
          reference_month: string
          status: string
          updated_at: string
        }
        Insert: {
          account_id: string
          amount_paid?: number
          closing_date: string
          company_id: string
          created_at?: string
          due_date: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          payment_transaction_id?: string | null
          reference_month: string
          status?: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          amount_paid?: number
          closing_date?: string
          company_id?: string
          created_at?: string
          due_date?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          payment_transaction_id?: string | null
          reference_month?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_card_bills_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_card_bills_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_card_bills_payment_transaction_id_fkey"
            columns: ["payment_transaction_id"]
            isOneToOne: false
            referencedRelation: "financial_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_stages: {
        Row: {
          color: string
          company_id: string
          created_at: string
          id: string
          is_lost: boolean
          is_won: boolean
          name: string
          position: number
          updated_at: string
        }
        Insert: {
          color?: string
          company_id: string
          created_at?: string
          id?: string
          is_lost?: boolean
          is_won?: boolean
          name: string
          position?: number
          updated_at?: string
        }
        Update: {
          color?: string
          company_id?: string
          created_at?: string
          id?: string
          is_lost?: boolean
          is_won?: boolean
          name?: string
          position?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_stages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_webhooks: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          origin: string | null
          token: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          origin?: string | null
          token?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          origin?: string | null
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_webhooks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_contacts: {
        Row: {
          created_at: string
          customer_id: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          position: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          position?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          position?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_contacts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_origins: {
        Row: {
          color: string | null
          company_id: string
          created_at: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          name: string
        }
        Insert: {
          color?: string | null
          company_id: string
          created_at?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name: string
        }
        Update: {
          color?: string | null
          company_id?: string
          created_at?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_origins_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_portals: {
        Row: {
          created_at: string
          customer_id: string
          id: string
          is_active: boolean
          is_public: boolean
          token: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          is_active?: boolean
          is_public?: boolean
          token?: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          is_active?: boolean
          is_public?: boolean
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_portals_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: true
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          address_number: string | null
          birth_date: string | null
          city: string | null
          company_id: string
          company_name: string | null
          complement: string | null
          created_at: string
          customer_type: Database["public"]["Enums"]["customer_type"]
          deleted_at: string | null
          document: string | null
          email: string | null
          ibge_municipality_code: string | null
          id: string
          inscricao_municipal: string | null
          is_deleted: boolean
          lat: number | null
          latitude: number | null
          lng: number | null
          longitude: number | null
          name: string
          neighborhood: string | null
          notes: string | null
          origin: string | null
          phone: string | null
          photo_url: string | null
          public_short_code: string | null
          state: string | null
          street_number: string | null
          updated_at: string
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          address_number?: string | null
          birth_date?: string | null
          city?: string | null
          company_id: string
          company_name?: string | null
          complement?: string | null
          created_at?: string
          customer_type?: Database["public"]["Enums"]["customer_type"]
          deleted_at?: string | null
          document?: string | null
          email?: string | null
          ibge_municipality_code?: string | null
          id?: string
          inscricao_municipal?: string | null
          is_deleted?: boolean
          lat?: number | null
          latitude?: number | null
          lng?: number | null
          longitude?: number | null
          name: string
          neighborhood?: string | null
          notes?: string | null
          origin?: string | null
          phone?: string | null
          photo_url?: string | null
          public_short_code?: string | null
          state?: string | null
          street_number?: string | null
          updated_at?: string
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          address_number?: string | null
          birth_date?: string | null
          city?: string | null
          company_id?: string
          company_name?: string | null
          complement?: string | null
          created_at?: string
          customer_type?: Database["public"]["Enums"]["customer_type"]
          deleted_at?: string | null
          document?: string | null
          email?: string | null
          ibge_municipality_code?: string | null
          id?: string
          inscricao_municipal?: string | null
          is_deleted?: boolean
          lat?: number | null
          latitude?: number | null
          lng?: number | null
          longitude?: number | null
          name?: string
          neighborhood?: string | null
          notes?: string | null
          origin?: string | null
          phone?: string | null
          photo_url?: string | null
          public_short_code?: string | null
          state?: string | null
          street_number?: string | null
          updated_at?: string
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      destructive_actions_audit: {
        Row: {
          action_type: string
          company_email_snapshot: string | null
          company_id: string | null
          company_name_snapshot: string | null
          created_at: string
          id: string
          ip_address: unknown
          payload: Json
          performed_by: string | null
          performed_by_email: string | null
          performed_by_role: string | null
          user_agent: string | null
        }
        Insert: {
          action_type: string
          company_email_snapshot?: string | null
          company_id?: string | null
          company_name_snapshot?: string | null
          created_at?: string
          id?: string
          ip_address?: unknown
          payload?: Json
          performed_by?: string | null
          performed_by_email?: string | null
          performed_by_role?: string | null
          user_agent?: string | null
        }
        Update: {
          action_type?: string
          company_email_snapshot?: string | null
          company_id?: string | null
          company_name_snapshot?: string | null
          created_at?: string
          id?: string
          ip_address?: unknown
          payload?: Json
          performed_by?: string | null
          performed_by_email?: string | null
          performed_by_role?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "destructive_actions_audit_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      domiflix_episodes: {
        Row: {
          created_at: string
          description: string | null
          duration_minutes: number | null
          episode_number: number | null
          id: string
          order_index: number
          recorded_at: string | null
          season_id: string | null
          thumbnail_url: string | null
          title: string
          title_id: string
          video_id: string | null
          video_type: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          duration_minutes?: number | null
          episode_number?: number | null
          id?: string
          order_index?: number
          recorded_at?: string | null
          season_id?: string | null
          thumbnail_url?: string | null
          title: string
          title_id: string
          video_id?: string | null
          video_type?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          duration_minutes?: number | null
          episode_number?: number | null
          id?: string
          order_index?: number
          recorded_at?: string | null
          season_id?: string | null
          thumbnail_url?: string | null
          title?: string
          title_id?: string
          video_id?: string | null
          video_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "domiflix_episodes_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "domiflix_seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "domiflix_episodes_title_id_fkey"
            columns: ["title_id"]
            isOneToOne: false
            referencedRelation: "domiflix_titles"
            referencedColumns: ["id"]
          },
        ]
      }
      domiflix_seasons: {
        Row: {
          created_at: string
          description: string | null
          id: string
          order_index: number
          season_number: number
          title: string
          title_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          order_index?: number
          season_number: number
          title: string
          title_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          order_index?: number
          season_number?: number
          title?: string
          title_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "domiflix_seasons_title_id_fkey"
            columns: ["title_id"]
            isOneToOne: false
            referencedRelation: "domiflix_titles"
            referencedColumns: ["id"]
          },
        ]
      }
      domiflix_section_titles: {
        Row: {
          id: string
          order_index: number
          section_id: string
          title_id: string
        }
        Insert: {
          id?: string
          order_index?: number
          section_id: string
          title_id: string
        }
        Update: {
          id?: string
          order_index?: number
          section_id?: string
          title_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "domiflix_section_titles_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "domiflix_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "domiflix_section_titles_title_id_fkey"
            columns: ["title_id"]
            isOneToOne: false
            referencedRelation: "domiflix_titles"
            referencedColumns: ["id"]
          },
        ]
      }
      domiflix_sections: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          label: string
          order_index: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          label: string
          order_index?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          label?: string
          order_index?: number
          updated_at?: string
        }
        Relationships: []
      }
      domiflix_titles: {
        Row: {
          banner_url: string | null
          created_at: string
          description: string | null
          id: string
          is_featured: boolean
          live_scheduled_at: string | null
          live_url: string | null
          logo_url: string | null
          order_index: number
          tags: string[]
          thumbnail_url: string | null
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          banner_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_featured?: boolean
          live_scheduled_at?: string | null
          live_url?: string | null
          logo_url?: string | null
          order_index?: number
          tags?: string[]
          thumbnail_url?: string | null
          title: string
          type?: string
          updated_at?: string
        }
        Update: {
          banner_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_featured?: boolean
          live_scheduled_at?: string | null
          live_url?: string | null
          logo_url?: string | null
          order_index?: number
          tags?: string[]
          thumbnail_url?: string | null
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      domiflix_user_preferences: {
        Row: {
          domiflix_avatar_url: string | null
          domiflix_display_name: string | null
          playback_speed: number
          updated_at: string
          user_id: string
        }
        Insert: {
          domiflix_avatar_url?: string | null
          domiflix_display_name?: string | null
          playback_speed?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          domiflix_avatar_url?: string | null
          domiflix_display_name?: string | null
          playback_speed?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      domiflix_user_progress: {
        Row: {
          completed: boolean
          duration_seconds: number
          episode_id: string
          id: string
          progress_seconds: number
          title_id: string
          user_id: string
          watched_at: string
        }
        Insert: {
          completed?: boolean
          duration_seconds?: number
          episode_id: string
          id?: string
          progress_seconds?: number
          title_id: string
          user_id: string
          watched_at?: string
        }
        Update: {
          completed?: boolean
          duration_seconds?: number
          episode_id?: string
          id?: string
          progress_seconds?: number
          title_id?: string
          user_id?: string
          watched_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "domiflix_user_progress_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "domiflix_episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "domiflix_user_progress_title_id_fkey"
            columns: ["title_id"]
            isOneToOne: false
            referencedRelation: "domiflix_titles"
            referencedColumns: ["id"]
          },
        ]
      }
      domiflix_watchlist: {
        Row: {
          added_at: string
          id: string
          title_id: string
          user_id: string
        }
        Insert: {
          added_at?: string
          id?: string
          title_id: string
          user_id: string
        }
        Update: {
          added_at?: string
          id?: string
          title_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "domiflix_watchlist_title_id_fkey"
            columns: ["title_id"]
            isOneToOne: false
            referencedRelation: "domiflix_titles"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_movements: {
        Row: {
          amount: number
          balance_after: number
          created_at: string
          created_by: string | null
          description: string | null
          employee_id: string
          id: string
          payment_details: Json | null
          payment_method: string | null
          type: string
        }
        Insert: {
          amount?: number
          balance_after?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          employee_id: string
          id?: string
          payment_details?: Json | null
          payment_method?: string | null
          type: string
        }
        Update: {
          amount?: number
          balance_after?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          employee_id?: string
          id?: string
          payment_details?: Json | null
          payment_method?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_movements_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          address: string | null
          company_id: string
          cpf: string | null
          created_at: string
          email: string | null
          hire_date: string | null
          id: string
          is_active: boolean
          monthly_cost: number | null
          monthly_cost_breakdown: Json | null
          name: string
          payment_day: number | null
          payment_day_2: number | null
          payment_day_type: string
          payment_frequency: string
          payment_weekday: number | null
          phone: string | null
          photo_url: string | null
          pix_key: string | null
          position: string | null
          salary: number | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          address?: string | null
          company_id: string
          cpf?: string | null
          created_at?: string
          email?: string | null
          hire_date?: string | null
          id?: string
          is_active?: boolean
          monthly_cost?: number | null
          monthly_cost_breakdown?: Json | null
          name: string
          payment_day?: number | null
          payment_day_2?: number | null
          payment_day_type?: string
          payment_frequency?: string
          payment_weekday?: number | null
          phone?: string | null
          photo_url?: string | null
          pix_key?: string | null
          position?: string | null
          salary?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          address?: string | null
          company_id?: string
          cpf?: string | null
          created_at?: string
          email?: string | null
          hire_date?: string | null
          id?: string
          is_active?: boolean
          monthly_cost?: number | null
          monthly_cost_breakdown?: Json | null
          name?: string
          payment_day?: number | null
          payment_day_2?: number | null
          payment_day_type?: string
          payment_frequency?: string
          payment_weekday?: number | null
          phone?: string | null
          photo_url?: string | null
          pix_key?: string | null
          position?: string | null
          salary?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment: {
        Row: {
          brand: string | null
          capacity: string | null
          category_id: string | null
          company_id: string
          created_at: string
          custom_fields: Json | null
          customer_id: string
          id: string
          identifier: string | null
          install_date: string | null
          location: string | null
          model: string | null
          name: string
          notes: string | null
          photo_url: string | null
          public_short_code: string | null
          serial_number: string | null
          status: string
          updated_at: string
          warranty_until: string | null
        }
        Insert: {
          brand?: string | null
          capacity?: string | null
          category_id?: string | null
          company_id: string
          created_at?: string
          custom_fields?: Json | null
          customer_id: string
          id?: string
          identifier?: string | null
          install_date?: string | null
          location?: string | null
          model?: string | null
          name: string
          notes?: string | null
          photo_url?: string | null
          public_short_code?: string | null
          serial_number?: string | null
          status?: string
          updated_at?: string
          warranty_until?: string | null
        }
        Update: {
          brand?: string | null
          capacity?: string | null
          category_id?: string | null
          company_id?: string
          created_at?: string
          custom_fields?: Json | null
          customer_id?: string
          id?: string
          identifier?: string | null
          install_date?: string | null
          location?: string | null
          model?: string | null
          name?: string
          notes?: string | null
          photo_url?: string | null
          public_short_code?: string | null
          serial_number?: string | null
          status?: string
          updated_at?: string
          warranty_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipment_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "equipment_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_attachments: {
        Row: {
          created_at: string
          description: string | null
          equipment_id: string
          file_name: string
          file_type: string | null
          file_url: string
          id: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          equipment_id: string
          file_name: string
          file_type?: string | null
          file_url: string
          id?: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          equipment_id?: string
          file_name?: string
          file_type?: string | null
          file_url?: string
          id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipment_attachments_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_brands: {
        Row: {
          created_at: string
          id: string
          logo_url: string | null
          name: string
          slug: string | null
          sort: number
        }
        Insert: {
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          slug?: string | null
          sort?: number
        }
        Update: {
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          slug?: string | null
          sort?: number
        }
        Relationships: []
      }
      equipment_categories: {
        Row: {
          color: string
          company_id: string
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          color?: string
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          color?: string
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipment_categories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_error_codes: {
        Row: {
          code: string
          component: string | null
          created_at: string
          description: string | null
          diagnosis: string | null
          id: string
          model_id: string
          solution: string | null
          title: string | null
        }
        Insert: {
          code: string
          component?: string | null
          created_at?: string
          description?: string | null
          diagnosis?: string | null
          id?: string
          model_id: string
          solution?: string | null
          title?: string | null
        }
        Update: {
          code?: string
          component?: string | null
          created_at?: string
          description?: string | null
          diagnosis?: string | null
          id?: string
          model_id?: string
          solution?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipment_error_codes_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "equipment_models"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_field_config: {
        Row: {
          company_id: string
          created_at: string
          field_key: string
          field_type: string
          id: string
          is_required: boolean
          is_visible: boolean
          label: string
          options: Json | null
          position: number
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          field_key: string
          field_type?: string
          id?: string
          is_required?: boolean
          is_visible?: boolean
          label: string
          options?: Json | null
          position?: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          field_key?: string
          field_type?: string
          id?: string
          is_required?: boolean
          is_visible?: boolean
          label?: string
          options?: Json | null
          position?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipment_field_config_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_model_categories: {
        Row: {
          created_at: string
          domain: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          domain?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          domain?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      equipment_models: {
        Row: {
          brand_id: string
          category_id: string | null
          code: string | null
          compressor_model_id: string | null
          consumo_kwh_mes: number | null
          created_at: string
          domain: string
          id: string
          image_url: string | null
          manual_type: string | null
          manual_url: string | null
          name: string
          potencia_w: number | null
          refrigerant: string | null
        }
        Insert: {
          brand_id: string
          category_id?: string | null
          code?: string | null
          compressor_model_id?: string | null
          consumo_kwh_mes?: number | null
          created_at?: string
          domain?: string
          id?: string
          image_url?: string | null
          manual_type?: string | null
          manual_url?: string | null
          name: string
          potencia_w?: number | null
          refrigerant?: string | null
        }
        Update: {
          brand_id?: string
          category_id?: string | null
          code?: string | null
          compressor_model_id?: string | null
          consumo_kwh_mes?: number | null
          created_at?: string
          domain?: string
          id?: string
          image_url?: string | null
          manual_type?: string | null
          manual_url?: string | null
          name?: string
          potencia_w?: number | null
          refrigerant?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipment_models_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "equipment_brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_models_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "equipment_model_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_models_compressor_model_id_fkey"
            columns: ["compressor_model_id"]
            isOneToOne: false
            referencedRelation: "equipment_models"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_number_counters: {
        Row: {
          company_id: string
          next_value: number
        }
        Insert: {
          company_id: string
          next_value?: number
        }
        Update: {
          company_id?: string
          next_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "equipment_number_counters_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_tasks: {
        Row: {
          assigned_to: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          equipment_id: string
          id: string
          is_completed: boolean
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          equipment_id: string
          id?: string
          is_completed?: boolean
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          equipment_id?: string
          id?: string
          is_completed?: boolean
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipment_tasks_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_accounts: {
        Row: {
          bank_name: string | null
          closing_day: number | null
          color: string
          company_id: string
          created_at: string
          credit_limit: number | null
          due_day: number | null
          icon: string | null
          id: string
          initial_balance: number
          institution_code: number | null
          institution_ispb: string | null
          institution_name: string | null
          is_active: boolean
          name: string
          payment_due_days: number | null
          sort_order: number | null
          type: string
          updated_at: string
        }
        Insert: {
          bank_name?: string | null
          closing_day?: number | null
          color?: string
          company_id: string
          created_at?: string
          credit_limit?: number | null
          due_day?: number | null
          icon?: string | null
          id?: string
          initial_balance?: number
          institution_code?: number | null
          institution_ispb?: string | null
          institution_name?: string | null
          is_active?: boolean
          name: string
          payment_due_days?: number | null
          sort_order?: number | null
          type?: string
          updated_at?: string
        }
        Update: {
          bank_name?: string | null
          closing_day?: number | null
          color?: string
          company_id?: string
          created_at?: string
          credit_limit?: number | null
          due_day?: number | null
          icon?: string | null
          id?: string
          initial_balance?: number
          institution_code?: number | null
          institution_ispb?: string | null
          institution_name?: string | null
          is_active?: boolean
          name?: string
          payment_due_days?: number | null
          sort_order?: number | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_categories: {
        Row: {
          color: string
          company_id: string | null
          created_at: string
          dre_group: string | null
          icon: string | null
          id: string
          is_active: boolean
          is_system: boolean
          name: string
          sort_order: number | null
          type: string
          updated_at: string
        }
        Insert: {
          color?: string
          company_id?: string | null
          created_at?: string
          dre_group?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          name: string
          sort_order?: number | null
          type?: string
          updated_at?: string
        }
        Update: {
          color?: string
          company_id?: string | null
          created_at?: string
          dre_group?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          name?: string
          sort_order?: number | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_categories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_transaction_attachments: {
        Row: {
          file_name: string
          id: string
          mime_type: string | null
          size_bytes: number | null
          storage_path: string
          transaction_id: string
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          file_name: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path: string
          transaction_id: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          file_name?: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path?: string
          transaction_id?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "financial_transaction_attachments_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "financial_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_transactions: {
        Row: {
          account_id: string | null
          amount: number
          amount_received: number
          billing_reminder_resolved_at: string | null
          billing_reminder_resolved_by: string | null
          cancelled_at: string | null
          cancelled_reason: string | null
          category: string | null
          company_id: string
          contract_id: string | null
          created_at: string
          created_by: string | null
          credit_card_bill_date: string | null
          customer_id: string | null
          description: string
          due_date: string | null
          employee_id: string | null
          id: string
          installment_group_id: string | null
          installment_number: number | null
          installment_total: number | null
          is_paid: boolean | null
          notes: string | null
          paid_date: string | null
          parent_transaction_id: string | null
          payment_method: string | null
          payroll_kind: string | null
          payroll_period: string | null
          receipt_url: string | null
          service_order_id: string | null
          transaction_date: string
          transaction_type: Database["public"]["Enums"]["transaction_type"]
          transfer_pair_id: string | null
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          amount: number
          amount_received?: number
          billing_reminder_resolved_at?: string | null
          billing_reminder_resolved_by?: string | null
          cancelled_at?: string | null
          cancelled_reason?: string | null
          category?: string | null
          company_id: string
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          credit_card_bill_date?: string | null
          customer_id?: string | null
          description: string
          due_date?: string | null
          employee_id?: string | null
          id?: string
          installment_group_id?: string | null
          installment_number?: number | null
          installment_total?: number | null
          is_paid?: boolean | null
          notes?: string | null
          paid_date?: string | null
          parent_transaction_id?: string | null
          payment_method?: string | null
          payroll_kind?: string | null
          payroll_period?: string | null
          receipt_url?: string | null
          service_order_id?: string | null
          transaction_date?: string
          transaction_type: Database["public"]["Enums"]["transaction_type"]
          transfer_pair_id?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          amount?: number
          amount_received?: number
          billing_reminder_resolved_at?: string | null
          billing_reminder_resolved_by?: string | null
          cancelled_at?: string | null
          cancelled_reason?: string | null
          category?: string | null
          company_id?: string
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          credit_card_bill_date?: string | null
          customer_id?: string | null
          description?: string
          due_date?: string | null
          employee_id?: string | null
          id?: string
          installment_group_id?: string | null
          installment_number?: number | null
          installment_total?: number | null
          is_paid?: boolean | null
          notes?: string | null
          paid_date?: string | null
          parent_transaction_id?: string | null
          payment_method?: string | null
          payroll_kind?: string | null
          payroll_period?: string | null
          receipt_url?: string | null
          service_order_id?: string | null
          transaction_date?: string
          transaction_type?: Database["public"]["Enums"]["transaction_type"]
          transfer_pair_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_transactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_transactions_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contract_health_status"
            referencedColumns: ["contract_id"]
          },
          {
            foreignKeyName: "financial_transactions_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_transactions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_transactions_parent_transaction_id_fkey"
            columns: ["parent_transaction_id"]
            isOneToOne: false
            referencedRelation: "financial_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_transactions_service_order_id_fkey"
            columns: ["service_order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      form_questions: {
        Row: {
          allow_multiple_photos: boolean
          answer_mode: string | null
          answer_types: Json | null
          auto_classify: boolean
          created_at: string
          description: string | null
          expected_max: number | null
          expected_min: number | null
          id: string
          is_required: boolean
          options: Json | null
          position: number
          question: string
          question_type: string
          require_camera: boolean
          template_id: string
          unit: string | null
        }
        Insert: {
          allow_multiple_photos?: boolean
          answer_mode?: string | null
          answer_types?: Json | null
          auto_classify?: boolean
          created_at?: string
          description?: string | null
          expected_max?: number | null
          expected_min?: number | null
          id?: string
          is_required?: boolean
          options?: Json | null
          position?: number
          question: string
          question_type?: string
          require_camera?: boolean
          template_id: string
          unit?: string | null
        }
        Update: {
          allow_multiple_photos?: boolean
          answer_mode?: string | null
          answer_types?: Json | null
          auto_classify?: boolean
          created_at?: string
          description?: string | null
          expected_max?: number | null
          expected_min?: number | null
          id?: string
          is_required?: boolean
          options?: Json | null
          position?: number
          question?: string
          question_type?: string
          require_camera?: boolean
          template_id?: string
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "form_questions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "form_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      form_responses: {
        Row: {
          equipment_id: string | null
          id: string
          question_id: string
          responded_at: string
          responded_by: string | null
          response_photo_url: string | null
          response_value: string | null
          service_order_id: string
        }
        Insert: {
          equipment_id?: string | null
          id?: string
          question_id: string
          responded_at?: string
          responded_by?: string | null
          response_photo_url?: string | null
          response_value?: string | null
          service_order_id: string
        }
        Update: {
          equipment_id?: string | null
          id?: string
          question_id?: string
          responded_at?: string
          responded_by?: string | null
          response_photo_url?: string | null
          response_value?: string | null
          service_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_responses_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_responses_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "form_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_responses_service_order_id_fkey"
            columns: ["service_order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      form_template_service_types: {
        Row: {
          created_at: string
          id: string
          service_type_id: string
          template_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          service_type_id: string
          template_id: string
        }
        Update: {
          created_at?: string
          id?: string
          service_type_id?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_template_service_types_service_type_id_fkey"
            columns: ["service_type_id"]
            isOneToOne: false
            referencedRelation: "service_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_template_service_types_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "form_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      form_templates: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          is_pmoc_default: boolean
          name: string
          service_type_id: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_pmoc_default?: boolean
          name: string
          service_type_id?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_pmoc_default?: boolean
          name?: string
          service_type_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_templates_service_type_id_fkey"
            columns: ["service_type_id"]
            isOneToOne: false
            referencedRelation: "service_types"
            referencedColumns: ["id"]
          },
        ]
      }
      holidays: {
        Row: {
          company_id: string | null
          created_at: string
          date: string
          id: string
          is_recurring: boolean
          name: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          date: string
          id?: string
          is_recurring?: boolean
          name: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          date?: string
          id?: string
          is_recurring?: boolean
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "holidays_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory: {
        Row: {
          category: string | null
          company_id: string
          cost_price: number | null
          created_at: string
          description: string | null
          id: string
          min_quantity: number | null
          name: string
          quantity: number | null
          sale_price: number | null
          sku: string | null
          supplier: string | null
          unit: string | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          company_id: string
          cost_price?: number | null
          created_at?: string
          description?: string | null
          id?: string
          min_quantity?: number | null
          name: string
          quantity?: number | null
          sale_price?: number | null
          sku?: string | null
          supplier?: string | null
          unit?: string | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          company_id?: string
          cost_price?: number | null
          created_at?: string
          description?: string | null
          id?: string
          min_quantity?: number | null
          name?: string
          quantity?: number | null
          sale_price?: number | null
          sku?: string | null
          supplier?: string | null
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          company_id: string | null
          created_at: string
          created_by: string | null
          id: string
          inventory_id: string
          movement_type: string
          notes: string | null
          quantity: number
          related_movement_id: string | null
          service_order_id: string | null
          stock_after: number | null
          stock_before: number | null
          supplier_id: string | null
          unit_cost: number | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          inventory_id: string
          movement_type: string
          notes?: string | null
          quantity: number
          related_movement_id?: string | null
          service_order_id?: string | null
          stock_after?: number | null
          stock_before?: number | null
          supplier_id?: string | null
          unit_cost?: number | null
        }
        Update: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          inventory_id?: string
          movement_type?: string
          notes?: string | null
          quantity?: number
          related_movement_id?: string | null
          service_order_id?: string | null
          stock_after?: number | null
          stock_before?: number | null
          supplier_id?: string | null
          unit_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_related_movement_id_fkey"
            columns: ["related_movement_id"]
            isOneToOne: false
            referencedRelation: "inventory_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_service_order_id_fkey"
            columns: ["service_order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_interactions: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          interaction_type: string
          lead_id: string
          next_action: string | null
          next_action_date: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          interaction_type: string
          lead_id: string
          next_action?: string | null
          next_action_date?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          interaction_type?: string
          lead_id?: string
          next_action?: string | null
          next_action_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_interactions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          assigned_to: string | null
          company_id: string
          created_at: string
          created_by: string | null
          customer_id: string | null
          expected_close_date: string | null
          id: string
          notes: string | null
          probability: number | null
          source: string | null
          stage_id: string | null
          status: Database["public"]["Enums"]["lead_status"]
          title: string
          updated_at: string
          value: number | null
        }
        Insert: {
          assigned_to?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          expected_close_date?: string | null
          id?: string
          notes?: string | null
          probability?: number | null
          source?: string | null
          stage_id?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          title: string
          updated_at?: string
          value?: number | null
        }
        Update: {
          assigned_to?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          expected_close_date?: string | null
          id?: string
          notes?: string | null
          probability?: number | null
          source?: string | null
          stage_id?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          title?: string
          updated_at?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "crm_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_asaas: {
        Row: {
          admin_financial_transaction_id: string | null
          amount: number
          asaas_event_type: string | null
          asaas_payment_id: string | null
          asaas_transaction_id: string | null
          category: string | null
          company_id: string | null
          created_at: string
          description: string | null
          direction: string
          id: string
          occurred_at: string
          raw_payload: Json | null
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          admin_financial_transaction_id?: string | null
          amount: number
          asaas_event_type?: string | null
          asaas_payment_id?: string | null
          asaas_transaction_id?: string | null
          category?: string | null
          company_id?: string | null
          created_at?: string
          description?: string | null
          direction: string
          id?: string
          occurred_at: string
          raw_payload?: Json | null
          source?: string
          status?: string
          updated_at?: string
        }
        Update: {
          admin_financial_transaction_id?: string | null
          amount?: number
          asaas_event_type?: string | null
          asaas_payment_id?: string | null
          asaas_transaction_id?: string | null
          category?: string | null
          company_id?: string | null
          created_at?: string
          description?: string | null
          direction?: string
          id?: string
          occurred_at?: string
          raw_payload?: Json | null
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ledger_asaas_admin_financial_transaction_id_fkey"
            columns: ["admin_financial_transaction_id"]
            isOneToOne: false
            referencedRelation: "admin_financial_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_asaas_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      master_login_audit: {
        Row: {
          created_at: string
          device_info: string | null
          id: string
          ip_address: string | null
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          device_info?: string | null
          id?: string
          ip_address?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          device_info?: string | null
          id?: string
          ip_address?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      nfe_imports: {
        Row: {
          access_key: string
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          item_count: number | null
          supplier_id: string | null
          supplier_name: string | null
          total: number | null
        }
        Insert: {
          access_key: string
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          item_count?: number | null
          supplier_id?: string | null
          supplier_name?: string | null
          total?: number | null
        }
        Update: {
          access_key?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          item_count?: number | null
          supplier_id?: string | null
          supplier_name?: string | null
          total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "nfe_imports_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      nfse_emissions: {
        Row: {
          chave_acesso: string | null
          company_id: string
          created_at: string | null
          customer_id: string | null
          descricao_servico: string | null
          emitida_em: string | null
          error_message: string | null
          financial_transaction_id: string | null
          fisqal_dps_id: string | null
          fisqal_fiscal_request_id: string | null
          id: string
          idempotency_key: string | null
          numero_nfse: string | null
          pdf_url: string | null
          protocolo: string | null
          status: string
          updated_at: string | null
          valor_iss: number | null
          valor_servico: number | null
          xml_url: string | null
        }
        Insert: {
          chave_acesso?: string | null
          company_id: string
          created_at?: string | null
          customer_id?: string | null
          descricao_servico?: string | null
          emitida_em?: string | null
          error_message?: string | null
          financial_transaction_id?: string | null
          fisqal_dps_id?: string | null
          fisqal_fiscal_request_id?: string | null
          id?: string
          idempotency_key?: string | null
          numero_nfse?: string | null
          pdf_url?: string | null
          protocolo?: string | null
          status?: string
          updated_at?: string | null
          valor_iss?: number | null
          valor_servico?: number | null
          xml_url?: string | null
        }
        Update: {
          chave_acesso?: string | null
          company_id?: string
          created_at?: string | null
          customer_id?: string | null
          descricao_servico?: string | null
          emitida_em?: string | null
          error_message?: string | null
          financial_transaction_id?: string | null
          fisqal_dps_id?: string | null
          fisqal_fiscal_request_id?: string | null
          id?: string
          idempotency_key?: string | null
          numero_nfse?: string | null
          pdf_url?: string | null
          protocolo?: string | null
          status?: string
          updated_at?: string | null
          valor_iss?: number | null
          valor_servico?: number | null
          xml_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nfse_emissions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nfse_emissions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nfse_emissions_financial_transaction_id_fkey"
            columns: ["financial_transaction_id"]
            isOneToOne: false
            referencedRelation: "financial_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      nfse_events: {
        Row: {
          company_id: string
          created_at: string | null
          event_type: string
          id: string
          nfse_emission_id: string
          payload: Json | null
          status: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          event_type: string
          id?: string
          nfse_emission_id: string
          payload?: Json | null
          status?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          event_type?: string
          id?: string
          nfse_emission_id?: string
          payload?: Json | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nfse_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nfse_events_nfse_emission_id_fkey"
            columns: ["nfse_emission_id"]
            isOneToOne: false
            referencedRelation: "nfse_emissions"
            referencedColumns: ["id"]
          },
        ]
      }
      nfse_tiers: {
        Row: {
          created_at: string
          monthly_limit: number | null
          name: string
          price: number
          tier: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          monthly_limit?: number | null
          name: string
          price: number
          tier: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          monthly_limit?: number | null
          name?: string
          price?: number
          tier?: number
          updated_at?: string
        }
        Relationships: []
      }
      nps_criteria: {
        Row: {
          active: boolean
          company_id: string
          created_at: string
          id: string
          label: string
          position: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          company_id: string
          created_at?: string
          id?: string
          label: string
          position?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          id?: string
          label?: string
          position?: number
          updated_at?: string
        }
        Relationships: []
      }
      nps_settings: {
        Row: {
          company_id: string
          created_at: string
          generate_on_finish: boolean
          id: string
          question: string
          require_stars: boolean
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          generate_on_finish?: boolean
          id?: string
          question?: string
          require_stars?: boolean
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          generate_on_finish?: boolean
          id?: string
          question?: string
          require_stars?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      os_config: {
        Row: {
          created_at: string
          id: string
          number_format: string
          number_prefix: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          number_format?: string
          number_prefix?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          number_format?: string
          number_prefix?: string
          updated_at?: string
        }
        Relationships: []
      }
      os_photos: {
        Row: {
          created_at: string
          description: string | null
          id: string
          photo_type: string | null
          photo_url: string
          service_order_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          photo_type?: string | null
          photo_url: string
          service_order_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          photo_type?: string | null
          photo_url?: string
          service_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "os_photos_service_order_id_fkey"
            columns: ["service_order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      os_required_fields: {
        Row: {
          created_at: string
          field_name: string
          id: string
          status_key: string
        }
        Insert: {
          created_at?: string
          field_name: string
          id?: string
          status_key: string
        }
        Update: {
          created_at?: string
          field_name?: string
          id?: string
          status_key?: string
        }
        Relationships: []
      }
      os_sla_config: {
        Row: {
          created_at: string
          deadline_hours: number
          id: string
          service_type_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          deadline_hours?: number
          id?: string
          service_type_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          deadline_hours?: number
          id?: string
          service_type_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "os_sla_config_service_type_id_fkey"
            columns: ["service_type_id"]
            isOneToOne: true
            referencedRelation: "service_types"
            referencedColumns: ["id"]
          },
        ]
      }
      os_statuses: {
        Row: {
          color: string
          company_id: string
          created_at: string
          id: string
          is_default: boolean
          key: string
          label: string
          position: number
          updated_at: string
        }
        Insert: {
          color?: string
          company_id: string
          created_at?: string
          id?: string
          is_default?: boolean
          key: string
          label: string
          position?: number
          updated_at?: string
        }
        Update: {
          color?: string
          company_id?: string
          created_at?: string
          id?: string
          is_default?: boolean
          key?: string
          label?: string
          position?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "os_statuses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      password_reset_codes: {
        Row: {
          attempts: number
          code: string
          created_at: string
          email: string
          expires_at: string
          id: string
          ip_address: string | null
          used_at: string | null
          user_agent: string | null
        }
        Insert: {
          attempts?: number
          code: string
          created_at?: string
          email: string
          expires_at: string
          id?: string
          ip_address?: string | null
          used_at?: string | null
          user_agent?: string | null
        }
        Update: {
          attempts?: number
          code?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          ip_address?: string | null
          used_at?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      permission_presets: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          permissions: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          permissions?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          permissions?: Json
          updated_at?: string
        }
        Relationships: []
      }
      pmoc_activity_catalog: {
        Row: {
          component: string | null
          created_at: string
          default_freq_code: string
          description: string
          expected_max: number | null
          expected_min: number | null
          guidance: string | null
          id: string
          is_active: boolean
          is_measurement: boolean
          section: string
          sort_order: number
          unit: string | null
          updated_at: string
        }
        Insert: {
          component?: string | null
          created_at?: string
          default_freq_code: string
          description: string
          expected_max?: number | null
          expected_min?: number | null
          guidance?: string | null
          id?: string
          is_active?: boolean
          is_measurement?: boolean
          section: string
          sort_order?: number
          unit?: string | null
          updated_at?: string
        }
        Update: {
          component?: string | null
          created_at?: string
          default_freq_code?: string
          description?: string
          expected_max?: number | null
          expected_min?: number | null
          guidance?: string | null
          id?: string
          is_active?: boolean
          is_measurement?: boolean
          section?: string
          sort_order?: number
          unit?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pmoc_contract_documents_custom: {
        Row: {
          certificado_content: string | null
          certificado_updated_at: string | null
          company_id: string
          contract_id: string
          created_at: string
          termo_rt_content: string | null
          termo_rt_updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          certificado_content?: string | null
          certificado_updated_at?: string | null
          company_id: string
          contract_id: string
          created_at?: string
          termo_rt_content?: string | null
          termo_rt_updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          certificado_content?: string | null
          certificado_updated_at?: string | null
          company_id?: string
          contract_id?: string
          created_at?: string
          termo_rt_content?: string | null
          termo_rt_updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pmoc_contract_documents_custom_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pmoc_contract_documents_custom_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: true
            referencedRelation: "contract_health_status"
            referencedColumns: ["contract_id"]
          },
          {
            foreignKeyName: "pmoc_contract_documents_custom_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: true
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      pmoc_documents: {
        Row: {
          company_id: string
          content_hash: string
          contract_id: string
          doc_type: string
          generated_at: string
          generated_by: string | null
          id: string
          notes: string | null
          pdf_storage_path: string
          valid_until: string | null
          version: number
        }
        Insert: {
          company_id: string
          content_hash: string
          contract_id: string
          doc_type: string
          generated_at?: string
          generated_by?: string | null
          id?: string
          notes?: string | null
          pdf_storage_path: string
          valid_until?: string | null
          version: number
        }
        Update: {
          company_id?: string
          content_hash?: string
          contract_id?: string
          doc_type?: string
          generated_at?: string
          generated_by?: string | null
          id?: string
          notes?: string | null
          pdf_storage_path?: string
          valid_until?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "pmoc_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pmoc_documents_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contract_health_status"
            referencedColumns: ["contract_id"]
          },
          {
            foreignKeyName: "pmoc_documents_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      pmoc_schedules: {
        Row: {
          contract_id: string
          created_at: string
          equipment_id: string
          id: string
          is_completed: boolean | null
          scheduled_month: number
          scheduled_year: number
          service_order_id: string | null
        }
        Insert: {
          contract_id: string
          created_at?: string
          equipment_id: string
          id?: string
          is_completed?: boolean | null
          scheduled_month: number
          scheduled_year: number
          service_order_id?: string | null
        }
        Update: {
          contract_id?: string
          created_at?: string
          equipment_id?: string
          id?: string
          is_completed?: boolean | null
          scheduled_month?: number
          scheduled_year?: number
          service_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pmoc_schedules_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pmoc_schedules_service_order_id_fkey"
            columns: ["service_order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_settings: {
        Row: {
          admin_indirect_rate: number
          card_discount_rate: number
          card_installments: number
          company_id: string
          created_at: string | null
          default_profit_rate: number
          id: string
          km_cost: number
          tax_rate: number
          updated_at: string | null
        }
        Insert: {
          admin_indirect_rate?: number
          card_discount_rate?: number
          card_installments?: number
          company_id: string
          created_at?: string | null
          default_profit_rate?: number
          id?: string
          km_cost?: number
          tax_rate?: number
          updated_at?: string | null
        }
        Update: {
          admin_indirect_rate?: number
          card_discount_rate?: number
          card_installments?: number
          company_id?: string
          created_at?: string | null
          default_profit_rate?: number
          id?: string
          km_cost?: number
          tax_rate?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pricing_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          company_id: string | null
          created_at: string
          deletion_requested_at: string | null
          email: string | null
          full_name: string
          id: string
          is_active: boolean
          navigation_style: string
          phone: string | null
          terms_accepted_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          company_id?: string | null
          created_at?: string
          deletion_requested_at?: string | null
          email?: string | null
          full_name: string
          id?: string
          is_active?: boolean
          navigation_style?: string
          phone?: string | null
          terms_accepted_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          company_id?: string | null
          created_at?: string
          deletion_requested_at?: string | null
          email?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          navigation_style?: string
          phone?: string | null
          terms_accepted_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_templates: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          preview_color: string
          slug: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          preview_color?: string
          slug: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          preview_color?: string
          slug?: string
        }
        Relationships: []
      }
      quote_item_materials: {
        Row: {
          id: string
          is_manual: boolean | null
          item_name: string
          purchase_price: number
          quantity: number
          quote_item_id: string | null
          stock_item_id: string | null
          subtotal: number | null
          unit: string
        }
        Insert: {
          id?: string
          is_manual?: boolean | null
          item_name: string
          purchase_price: number
          quantity: number
          quote_item_id?: string | null
          stock_item_id?: string | null
          subtotal?: number | null
          unit?: string
        }
        Update: {
          id?: string
          is_manual?: boolean | null
          item_name?: string
          purchase_price?: number
          quantity?: number
          quote_item_id?: string | null
          stock_item_id?: string | null
          subtotal?: number | null
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_item_materials_quote_item_id_fkey"
            columns: ["quote_item_id"]
            isOneToOne: false
            referencedRelation: "quote_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_item_materials_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "inventory"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_items: {
        Row: {
          created_at: string
          description: string
          id: string
          inventory_id: string | null
          item_type: string
          position: number
          quantity: number
          quote_id: string
          service_type_id: string | null
          total_price: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          inventory_id?: string | null
          item_type?: string
          position?: number
          quantity?: number
          quote_id: string
          service_type_id?: string | null
          total_price?: number
          unit_price?: number
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          inventory_id?: string | null
          item_type?: string
          position?: number
          quantity?: number
          quote_id?: string
          service_type_id?: string | null
          total_price?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "quote_items_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_service_type_id_fkey"
            columns: ["service_type_id"]
            isOneToOne: false
            referencedRelation: "service_types"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          assigned_to: string | null
          card_discount_rate: number
          card_installments: number
          company_id: string
          created_at: string
          created_by: string | null
          customer_id: string | null
          discount_amount: number | null
          discount_type: string | null
          discount_value: number | null
          financial_generated_at: string | null
          financial_transaction_id: string | null
          id: string
          include_gifts: boolean
          notes: string | null
          proposal_template_id: string | null
          prospect_email: string | null
          prospect_name: string | null
          prospect_phone: string | null
          quote_number: number
          status: string
          subtotal: number | null
          terms: string | null
          token: string
          total_value: number | null
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          assigned_to?: string | null
          card_discount_rate?: number
          card_installments?: number
          company_id: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          discount_amount?: number | null
          discount_type?: string | null
          discount_value?: number | null
          financial_generated_at?: string | null
          financial_transaction_id?: string | null
          id?: string
          include_gifts?: boolean
          notes?: string | null
          proposal_template_id?: string | null
          prospect_email?: string | null
          prospect_name?: string | null
          prospect_phone?: string | null
          quote_number?: number
          status?: string
          subtotal?: number | null
          terms?: string | null
          token?: string
          total_value?: number | null
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          assigned_to?: string | null
          card_discount_rate?: number
          card_installments?: number
          company_id?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          discount_amount?: number | null
          discount_type?: string | null
          discount_value?: number | null
          financial_generated_at?: string | null
          financial_transaction_id?: string | null
          id?: string
          include_gifts?: boolean
          notes?: string | null
          proposal_template_id?: string | null
          prospect_email?: string | null
          prospect_name?: string | null
          prospect_phone?: string | null
          quote_number?: number
          status?: string
          subtotal?: number | null
          terms?: string | null
          token?: string
          total_value?: number | null
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_financial_transaction_id_fkey"
            columns: ["financial_transaction_id"]
            isOneToOne: false
            referencedRelation: "financial_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_proposal_template_id_fkey"
            columns: ["proposal_template_id"]
            isOneToOne: false
            referencedRelation: "proposal_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      refrigerant_gases: {
        Row: {
          aplicacao: string | null
          classe_seguranca: string | null
          code: string
          composicao: string | null
          cor: string | null
          created_at: string | null
          ficha_url: string | null
          glide_k: number | null
          guia_oficial_url: string | null
          gwp: number | null
          id: string
          name: string | null
          observacoes: string | null
          odp: number | null
          oleo: string | null
          ponto_ebulicao_c: number | null
          sort: number | null
          substitui: string | null
          tipo: string | null
        }
        Insert: {
          aplicacao?: string | null
          classe_seguranca?: string | null
          code: string
          composicao?: string | null
          cor?: string | null
          created_at?: string | null
          ficha_url?: string | null
          glide_k?: number | null
          guia_oficial_url?: string | null
          gwp?: number | null
          id?: string
          name?: string | null
          observacoes?: string | null
          odp?: number | null
          oleo?: string | null
          ponto_ebulicao_c?: number | null
          sort?: number | null
          substitui?: string | null
          tipo?: string | null
        }
        Update: {
          aplicacao?: string | null
          classe_seguranca?: string | null
          code?: string
          composicao?: string | null
          cor?: string | null
          created_at?: string | null
          ficha_url?: string | null
          glide_k?: number | null
          guia_oficial_url?: string | null
          gwp?: number | null
          id?: string
          name?: string | null
          observacoes?: string | null
          odp?: number | null
          oleo?: string | null
          ponto_ebulicao_c?: number | null
          sort?: number | null
          substitui?: string | null
          tipo?: string | null
        }
        Relationships: []
      }
      remote_configs: {
        Row: {
          codigo_universal: string | null
          created_at: string
          desbloqueio: string | null
          instrucoes: string | null
          model_id: string
          modos: string | null
          observacoes: string | null
          reset: string | null
        }
        Insert: {
          codigo_universal?: string | null
          created_at?: string
          desbloqueio?: string | null
          instrucoes?: string | null
          model_id: string
          modos?: string | null
          observacoes?: string | null
          reset?: string | null
        }
        Update: {
          codigo_universal?: string | null
          created_at?: string
          desbloqueio?: string | null
          instrucoes?: string | null
          model_id?: string
          modos?: string | null
          observacoes?: string | null
          reset?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "remote_configs_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: true
            referencedRelation: "equipment_models"
            referencedColumns: ["id"]
          },
        ]
      }
      responsible_technicians: {
        Row: {
          cft_crea: string | null
          company_id: string
          created_at: string
          created_by: string | null
          email: string | null
          full_name: string
          id: string
          is_active: boolean
          modality: string | null
          notes: string | null
          phone: string | null
          registry_number: string | null
          signature_image_url: string | null
          stamp_image_url: string | null
          updated_at: string
        }
        Insert: {
          cft_crea?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name: string
          id?: string
          is_active?: boolean
          modality?: string | null
          notes?: string | null
          phone?: string | null
          registry_number?: string | null
          signature_image_url?: string | null
          stamp_image_url?: string | null
          updated_at?: string
        }
        Update: {
          cft_crea?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          modality?: string | null
          notes?: string | null
          phone?: string | null
          registry_number?: string | null
          signature_image_url?: string | null
          stamp_image_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "responsible_technicians_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      salespeople: {
        Row: {
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          monthly_goal: number
          name: string
          no_commission: boolean
          notes: string | null
          phone: string | null
          photo_url: string | null
          referral_code: string | null
          role: string
          salary: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          monthly_goal?: number
          name: string
          no_commission?: boolean
          notes?: string | null
          phone?: string | null
          photo_url?: string | null
          referral_code?: string | null
          role?: string
          salary?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          monthly_goal?: number
          name?: string
          no_commission?: boolean
          notes?: string | null
          phone?: string | null
          photo_url?: string | null
          referral_code?: string | null
          role?: string
          salary?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      salesperson_advances: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          reference_month: string | null
          salesperson_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          reference_month?: string | null
          salesperson_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          reference_month?: string | null
          salesperson_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "salesperson_advances_salesperson_id_fkey"
            columns: ["salesperson_id"]
            isOneToOne: false
            referencedRelation: "salespeople"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salesperson_advances_salesperson_id_fkey"
            columns: ["salesperson_id"]
            isOneToOne: false
            referencedRelation: "salespeople_basic"
            referencedColumns: ["id"]
          },
        ]
      }
      salesperson_payments: {
        Row: {
          advances_deducted: number
          commission_amount: number
          created_by: string | null
          id: string
          notes: string | null
          paid_at: string
          reference_month: string
          salary_amount: number
          salesperson_id: string
          total_amount: number
        }
        Insert: {
          advances_deducted?: number
          commission_amount?: number
          created_by?: string | null
          id?: string
          notes?: string | null
          paid_at?: string
          reference_month: string
          salary_amount?: number
          salesperson_id: string
          total_amount?: number
        }
        Update: {
          advances_deducted?: number
          commission_amount?: number
          created_by?: string | null
          id?: string
          notes?: string | null
          paid_at?: string
          reference_month?: string
          salary_amount?: number
          salesperson_id?: string
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "salesperson_payments_salesperson_id_fkey"
            columns: ["salesperson_id"]
            isOneToOne: false
            referencedRelation: "salespeople"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salesperson_payments_salesperson_id_fkey"
            columns: ["salesperson_id"]
            isOneToOne: false
            referencedRelation: "salespeople_basic"
            referencedColumns: ["id"]
          },
        ]
      }
      salesperson_sales: {
        Row: {
          amount: number
          billing_cycle: string
          closer_commission: number | null
          commission_amount: number
          company_id: string | null
          created_at: string
          created_by: string | null
          customer_company: string | null
          customer_name: string | null
          customer_origin: string | null
          id: string
          notes: string | null
          paid_amount: number
          salesperson_id: string
          sdr_commission: number | null
          sdr_id: string | null
        }
        Insert: {
          amount?: number
          billing_cycle?: string
          closer_commission?: number | null
          commission_amount?: number
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_company?: string | null
          customer_name?: string | null
          customer_origin?: string | null
          id?: string
          notes?: string | null
          paid_amount?: number
          salesperson_id: string
          sdr_commission?: number | null
          sdr_id?: string | null
        }
        Update: {
          amount?: number
          billing_cycle?: string
          closer_commission?: number | null
          commission_amount?: number
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_company?: string | null
          customer_name?: string | null
          customer_origin?: string | null
          id?: string
          notes?: string | null
          paid_amount?: number
          salesperson_id?: string
          sdr_commission?: number | null
          sdr_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "salesperson_sales_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salesperson_sales_salesperson_id_fkey"
            columns: ["salesperson_id"]
            isOneToOne: false
            referencedRelation: "salespeople"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salesperson_sales_salesperson_id_fkey"
            columns: ["salesperson_id"]
            isOneToOne: false
            referencedRelation: "salespeople_basic"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salesperson_sales_sdr_id_fkey"
            columns: ["sdr_id"]
            isOneToOne: false
            referencedRelation: "salespeople"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salesperson_sales_sdr_id_fkey"
            columns: ["sdr_id"]
            isOneToOne: false
            referencedRelation: "salespeople_basic"
            referencedColumns: ["id"]
          },
        ]
      }
      service_cost_resources: {
        Row: {
          id: string
          override_value: number | null
          resource_id: string
          service_id: string
        }
        Insert: {
          id?: string
          override_value?: number | null
          resource_id: string
          service_id: string
        }
        Update: {
          id?: string
          override_value?: number | null
          resource_id?: string
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_cost_resources_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "cost_resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_cost_resources_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "cost_resources_with_rate"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_cost_resources_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "service_types"
            referencedColumns: ["id"]
          },
        ]
      }
      service_costs: {
        Row: {
          company_id: string
          created_at: string | null
          extra_costs: Json | null
          hourly_rate: number
          hours: number
          id: string
          labor_cost: number | null
          notes: string | null
          service_id: string | null
          updated_at: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          extra_costs?: Json | null
          hourly_rate?: number
          hours?: number
          id?: string
          labor_cost?: number | null
          notes?: string | null
          service_id?: string | null
          updated_at?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          extra_costs?: Json | null
          hourly_rate?: number
          hours?: number
          id?: string
          labor_cost?: number | null
          notes?: string | null
          service_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_costs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_costs_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "service_types"
            referencedColumns: ["id"]
          },
        ]
      }
      service_gifts: {
        Row: {
          id: string
          name: string
          quantity: number | null
          resource_id: string | null
          service_id: string
          subtotal: number | null
          unit_cost: number | null
        }
        Insert: {
          id?: string
          name: string
          quantity?: number | null
          resource_id?: string | null
          service_id: string
          subtotal?: number | null
          unit_cost?: number | null
        }
        Update: {
          id?: string
          name?: string
          quantity?: number | null
          resource_id?: string | null
          service_id?: string
          subtotal?: number | null
          unit_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "service_gifts_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "cost_resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_gifts_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "cost_resources_with_rate"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_gifts_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "service_types"
            referencedColumns: ["id"]
          },
        ]
      }
      service_materials: {
        Row: {
          company_id: string
          created_at: string | null
          id: string
          item_name: string
          purchase_price: number
          quantity: number
          sale_price: number | null
          service_id: string | null
          sort_order: number | null
          stock_item_id: string | null
          subtotal: number | null
          unit: string
        }
        Insert: {
          company_id: string
          created_at?: string | null
          id?: string
          item_name: string
          purchase_price?: number
          quantity?: number
          sale_price?: number | null
          service_id?: string | null
          sort_order?: number | null
          stock_item_id?: string | null
          subtotal?: number | null
          unit?: string
        }
        Update: {
          company_id?: string
          created_at?: string | null
          id?: string
          item_name?: string
          purchase_price?: number
          quantity?: number
          sale_price?: number | null
          service_id?: string | null
          sort_order?: number | null
          stock_item_id?: string | null
          subtotal?: number | null
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_materials_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_materials_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "service_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_materials_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "inventory"
            referencedColumns: ["id"]
          },
        ]
      }
      service_order_activities: {
        Row: {
          activity_photos: string | null
          company_id: string
          component: string | null
          conformity_status: string | null
          created_at: string
          description: string
          equipment_id: string | null
          expected_max: number | null
          expected_min: number | null
          form_template_id: string | null
          freq_code: string | null
          guidance: string | null
          id: string
          is_measurement: boolean
          measured_value: number | null
          plan_activity_id: string | null
          section: string | null
          service_order_id: string
          sort_order: number
          unit: string | null
          updated_at: string
        }
        Insert: {
          activity_photos?: string | null
          company_id: string
          component?: string | null
          conformity_status?: string | null
          created_at?: string
          description: string
          equipment_id?: string | null
          expected_max?: number | null
          expected_min?: number | null
          form_template_id?: string | null
          freq_code?: string | null
          guidance?: string | null
          id?: string
          is_measurement?: boolean
          measured_value?: number | null
          plan_activity_id?: string | null
          section?: string | null
          service_order_id: string
          sort_order?: number
          unit?: string | null
          updated_at?: string
        }
        Update: {
          activity_photos?: string | null
          company_id?: string
          component?: string | null
          conformity_status?: string | null
          created_at?: string
          description?: string
          equipment_id?: string | null
          expected_max?: number | null
          expected_min?: number | null
          form_template_id?: string | null
          freq_code?: string | null
          guidance?: string | null
          id?: string
          is_measurement?: boolean
          measured_value?: number | null
          plan_activity_id?: string | null
          section?: string | null
          service_order_id?: string
          sort_order?: number
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_order_activities_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_order_activities_form_template_id_fkey"
            columns: ["form_template_id"]
            isOneToOne: false
            referencedRelation: "form_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_order_activities_plan_activity_id_fkey"
            columns: ["plan_activity_id"]
            isOneToOne: false
            referencedRelation: "contract_plan_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_order_activities_service_order_id_fkey"
            columns: ["service_order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      service_order_assignees: {
        Row: {
          created_at: string
          id: string
          service_order_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          service_order_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          service_order_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_order_assignees_service_order_id_fkey"
            columns: ["service_order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      service_order_equipment: {
        Row: {
          created_at: string
          equipment_id: string | null
          form_template_id: string | null
          id: string
          service_order_id: string
        }
        Insert: {
          created_at?: string
          equipment_id?: string | null
          form_template_id?: string | null
          id?: string
          service_order_id: string
        }
        Update: {
          created_at?: string
          equipment_id?: string | null
          form_template_id?: string | null
          id?: string
          service_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_order_equipment_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_order_equipment_form_template_id_fkey"
            columns: ["form_template_id"]
            isOneToOne: false
            referencedRelation: "form_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_order_equipment_service_order_id_fkey"
            columns: ["service_order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      service_orders: {
        Row: {
          check_in_location: Json | null
          check_in_time: string | null
          check_out_location: Json | null
          check_out_time: string | null
          client_signature: string | null
          company_id: string
          completed_at: string | null
          contract_id: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          description: string | null
          diagnosis: string | null
          duration_minutes: number
          entry_type: string
          equipment_id: string | null
          form_template_id: string | null
          generate_nps_survey: boolean | null
          id: string
          labor_hours: number | null
          labor_value: number | null
          notes: string | null
          order_number: number
          origin: string
          os_type: Database["public"]["Enums"]["os_type"]
          parts_used: Json | null
          parts_value: number | null
          paused_at: string | null
          pmoc_conformity_notes: string | null
          pmoc_conformity_status: string | null
          public_short_code: string | null
          recurrence_end_date: string | null
          recurrence_group_id: string | null
          recurrence_interval: number | null
          recurrence_type: string | null
          require_client_signature: boolean | null
          require_tech_signature: boolean | null
          resumed_at: string | null
          scheduled_date: string | null
          scheduled_time: string | null
          service_address: string | null
          service_address_number: string | null
          service_city: string | null
          service_latitude: number | null
          service_longitude: number | null
          service_neighborhood: string | null
          service_state: string | null
          service_type_id: string | null
          service_zip_code: string | null
          snapshot_data: Json | null
          solution: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["os_status"]
          task_title: string | null
          task_type_id: string | null
          team_id: string | null
          tech_signature: string | null
          technician_id: string | null
          total_value: number | null
          updated_at: string
        }
        Insert: {
          check_in_location?: Json | null
          check_in_time?: string | null
          check_out_location?: Json | null
          check_out_time?: string | null
          client_signature?: string | null
          company_id: string
          completed_at?: string | null
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          description?: string | null
          diagnosis?: string | null
          duration_minutes?: number
          entry_type?: string
          equipment_id?: string | null
          form_template_id?: string | null
          generate_nps_survey?: boolean | null
          id?: string
          labor_hours?: number | null
          labor_value?: number | null
          notes?: string | null
          order_number?: number
          origin?: string
          os_type?: Database["public"]["Enums"]["os_type"]
          parts_used?: Json | null
          parts_value?: number | null
          paused_at?: string | null
          pmoc_conformity_notes?: string | null
          pmoc_conformity_status?: string | null
          public_short_code?: string | null
          recurrence_end_date?: string | null
          recurrence_group_id?: string | null
          recurrence_interval?: number | null
          recurrence_type?: string | null
          require_client_signature?: boolean | null
          require_tech_signature?: boolean | null
          resumed_at?: string | null
          scheduled_date?: string | null
          scheduled_time?: string | null
          service_address?: string | null
          service_address_number?: string | null
          service_city?: string | null
          service_latitude?: number | null
          service_longitude?: number | null
          service_neighborhood?: string | null
          service_state?: string | null
          service_type_id?: string | null
          service_zip_code?: string | null
          snapshot_data?: Json | null
          solution?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["os_status"]
          task_title?: string | null
          task_type_id?: string | null
          team_id?: string | null
          tech_signature?: string | null
          technician_id?: string | null
          total_value?: number | null
          updated_at?: string
        }
        Update: {
          check_in_location?: Json | null
          check_in_time?: string | null
          check_out_location?: Json | null
          check_out_time?: string | null
          client_signature?: string | null
          company_id?: string
          completed_at?: string | null
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          description?: string | null
          diagnosis?: string | null
          duration_minutes?: number
          entry_type?: string
          equipment_id?: string | null
          form_template_id?: string | null
          generate_nps_survey?: boolean | null
          id?: string
          labor_hours?: number | null
          labor_value?: number | null
          notes?: string | null
          order_number?: number
          origin?: string
          os_type?: Database["public"]["Enums"]["os_type"]
          parts_used?: Json | null
          parts_value?: number | null
          paused_at?: string | null
          pmoc_conformity_notes?: string | null
          pmoc_conformity_status?: string | null
          public_short_code?: string | null
          recurrence_end_date?: string | null
          recurrence_group_id?: string | null
          recurrence_interval?: number | null
          recurrence_type?: string | null
          require_client_signature?: boolean | null
          require_tech_signature?: boolean | null
          resumed_at?: string | null
          scheduled_date?: string | null
          scheduled_time?: string | null
          service_address?: string | null
          service_address_number?: string | null
          service_city?: string | null
          service_latitude?: number | null
          service_longitude?: number | null
          service_neighborhood?: string | null
          service_state?: string | null
          service_type_id?: string | null
          service_zip_code?: string | null
          snapshot_data?: Json | null
          solution?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["os_status"]
          task_title?: string | null
          task_type_id?: string | null
          team_id?: string | null
          tech_signature?: string | null
          technician_id?: string | null
          total_value?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_orders_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contract_health_status"
            referencedColumns: ["contract_id"]
          },
          {
            foreignKeyName: "service_orders_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_orders_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_orders_form_template_id_fkey"
            columns: ["form_template_id"]
            isOneToOne: false
            referencedRelation: "form_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_orders_service_type_id_fkey"
            columns: ["service_type_id"]
            isOneToOne: false
            referencedRelation: "service_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_orders_task_type_id_fkey"
            columns: ["task_type_id"]
            isOneToOne: false
            referencedRelation: "task_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_orders_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      service_rating_criteria: {
        Row: {
          created_at: string
          criterion_id: string | null
          id: string
          label_snapshot: string
          rating_id: string
          value: number
        }
        Insert: {
          created_at?: string
          criterion_id?: string | null
          id?: string
          label_snapshot: string
          rating_id: string
          value: number
        }
        Update: {
          created_at?: string
          criterion_id?: string | null
          id?: string
          label_snapshot?: string
          rating_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "service_rating_criteria_criterion_id_fkey"
            columns: ["criterion_id"]
            isOneToOne: false
            referencedRelation: "nps_criteria"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_rating_criteria_rating_id_fkey"
            columns: ["rating_id"]
            isOneToOne: false
            referencedRelation: "service_ratings"
            referencedColumns: ["id"]
          },
        ]
      }
      service_ratings: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          nps_score: number | null
          professionalism_rating: number | null
          punctuality_rating: number | null
          quality_rating: number | null
          rated_at: string | null
          rated_by_name: string | null
          service_order_id: string
          token: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          nps_score?: number | null
          professionalism_rating?: number | null
          punctuality_rating?: number | null
          quality_rating?: number | null
          rated_at?: string | null
          rated_by_name?: string | null
          service_order_id: string
          token?: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          nps_score?: number | null
          professionalism_rating?: number | null
          punctuality_rating?: number | null
          quality_rating?: number | null
          rated_at?: string | null
          rated_by_name?: string | null
          service_order_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_ratings_service_order_id_fkey"
            columns: ["service_order_id"]
            isOneToOne: true
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      service_types: {
        Row: {
          codigo_nbs: string | null
          codigo_servico: string | null
          color: string
          company_id: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          iss_aliquota: number | null
          item_lc116: string | null
          name: string
          number_prefix: string | null
          requires_equipment: boolean
          updated_at: string
        }
        Insert: {
          codigo_nbs?: string | null
          codigo_servico?: string | null
          color?: string
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          iss_aliquota?: number | null
          item_lc116?: string | null
          name: string
          number_prefix?: string | null
          requires_equipment?: boolean
          updated_at?: string
        }
        Update: {
          codigo_nbs?: string | null
          codigo_servico?: string | null
          color?: string
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          iss_aliquota?: number | null
          item_lc116?: string | null
          name?: string
          number_prefix?: string | null
          requires_equipment?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_types_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_cancellation_requests: {
        Row: {
          admin_notes: string | null
          company_id: string
          created_at: string
          id: string
          processed_at: string | null
          processed_by: string | null
          reason: string
          reason_details: string | null
          requested_by: string | null
          scheduled_cancellation_date: string | null
          status: string
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          company_id: string
          created_at?: string
          id?: string
          processed_at?: string | null
          processed_by?: string | null
          reason: string
          reason_details?: string | null
          requested_by?: string | null
          scheduled_cancellation_date?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          company_id?: string
          created_at?: string
          id?: string
          processed_at?: string | null
          processed_by?: string | null
          reason?: string
          reason_details?: string | null
          requested_by?: string | null
          scheduled_cancellation_date?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_cancellation_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_history: {
        Row: {
          changed_by: string | null
          company_id: string
          created_at: string
          id: string
          new_plan: string | null
          new_status: string | null
          new_value: number | null
          previous_plan: string | null
          previous_status: string | null
          previous_value: number | null
          reason: string | null
        }
        Insert: {
          changed_by?: string | null
          company_id: string
          created_at?: string
          id?: string
          new_plan?: string | null
          new_status?: string | null
          new_value?: number | null
          previous_plan?: string | null
          previous_status?: string | null
          previous_value?: number | null
          reason?: string | null
        }
        Update: {
          changed_by?: string | null
          company_id?: string
          created_at?: string
          id?: string
          new_plan?: string | null
          new_status?: string | null
          new_value?: number | null
          previous_plan?: string | null
          previous_status?: string | null
          previous_value?: number | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_history_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_modules: {
        Row: {
          code: string
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          price: number | null
          sort_order: number | null
          type: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          price?: number | null
          sort_order?: number | null
          type?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          price?: number | null
          sort_order?: number | null
          type?: string | null
        }
        Relationships: []
      }
      subscription_payments: {
        Row: {
          amount: number
          asaas_customer_id: string | null
          asaas_payment_id: string | null
          billing_cycle: string | null
          billing_type: string | null
          company_id: string
          created_at: string
          due_date: string | null
          id: string
          invoice_url: string | null
          ltv_credited_at: string | null
          paid_at: string | null
          payment_method: string | null
          pix_copy_paste: string | null
          pix_expiration_date: string | null
          pix_qr_code: string | null
          status: string
          type: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          asaas_customer_id?: string | null
          asaas_payment_id?: string | null
          billing_cycle?: string | null
          billing_type?: string | null
          company_id: string
          created_at?: string
          due_date?: string | null
          id?: string
          invoice_url?: string | null
          ltv_credited_at?: string | null
          paid_at?: string | null
          payment_method?: string | null
          pix_copy_paste?: string | null
          pix_expiration_date?: string | null
          pix_qr_code?: string | null
          status?: string
          type?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          asaas_customer_id?: string | null
          asaas_payment_id?: string | null
          billing_cycle?: string | null
          billing_type?: string | null
          company_id?: string
          created_at?: string
          due_date?: string | null
          id?: string
          invoice_url?: string | null
          ltv_credited_at?: string | null
          paid_at?: string | null
          payment_method?: string | null
          pix_copy_paste?: string | null
          pix_expiration_date?: string | null
          pix_qr_code?: string | null
          status?: string
          type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_payments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          code: string
          created_at: string | null
          description: string | null
          features: Json | null
          id: string
          included_modules: Json | null
          is_active: boolean | null
          max_users: number | null
          name: string
          price: number
        }
        Insert: {
          code: string
          created_at?: string | null
          description?: string | null
          features?: Json | null
          id?: string
          included_modules?: Json | null
          is_active?: boolean | null
          max_users?: number | null
          name: string
          price?: number
        }
        Update: {
          code?: string
          created_at?: string | null
          description?: string | null
          features?: Json | null
          id?: string
          included_modules?: Json | null
          is_active?: boolean | null
          max_users?: number | null
          name?: string
          price?: number
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          company_id: string
          contact_name: string | null
          cpf_cnpj: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          contact_name?: string | null
          cpf_cnpj?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          contact_name?: string | null
          cpf_cnpj?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      task_types: {
        Row: {
          color: string
          company_id: string
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          color?: string
          company_id: string
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          color?: string
          company_id?: string
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_types_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          created_at: string | null
          id: string
          team_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          team_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          color: string | null
          company_id: string
          created_at: string | null
          created_by: string | null
          description: string | null
          icon_name: string | null
          id: string
          is_active: boolean | null
          name: string
          photo_url: string | null
          updated_at: string | null
        }
        Insert: {
          color?: string | null
          company_id: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          icon_name?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          photo_url?: string | null
          updated_at?: string | null
        }
        Update: {
          color?: string | null
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          icon_name?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          photo_url?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "teams_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      technician_locations: {
        Row: {
          company_id: string
          created_at: string
          event_type: string
          id: string
          lat: number
          lng: number
          service_order_id: string | null
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          event_type?: string
          id?: string
          lat: number
          lng: number
          service_order_id?: string | null
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          event_type?: string
          id?: string
          lat?: number
          lng?: number
          service_order_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "technician_locations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "technician_locations_service_order_id_fkey"
            columns: ["service_order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      terms_update_broadcasts: {
        Row: {
          broadcast_at: string
          version: string
        }
        Insert: {
          broadcast_at?: string
          version: string
        }
        Update: {
          broadcast_at?: string
          version?: string
        }
        Relationships: []
      }
      time_records: {
        Row: {
          address: string | null
          company_id: string
          created_at: string | null
          date: string
          device_info: Json | null
          employee_id: string | null
          id: string
          is_valid: boolean | null
          latitude: number | null
          longitude: number | null
          notes: string | null
          photo_url: string | null
          recorded_at: string
          source: string | null
          type: string
          user_id: string | null
        }
        Insert: {
          address?: string | null
          company_id: string
          created_at?: string | null
          date: string
          device_info?: Json | null
          employee_id?: string | null
          id?: string
          is_valid?: boolean | null
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          photo_url?: string | null
          recorded_at?: string
          source?: string | null
          type: string
          user_id?: string | null
        }
        Update: {
          address?: string | null
          company_id?: string
          created_at?: string | null
          date?: string
          device_info?: Json | null
          employee_id?: string | null
          id?: string
          is_valid?: boolean | null
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          photo_url?: string | null
          recorded_at?: string
          source?: string | null
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "time_records_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      time_schedules: {
        Row: {
          break_minutes: number | null
          company_id: string
          employee_id: string | null
          expected_in: string
          expected_out: string
          id: string
          is_work_day: boolean | null
          user_id: string | null
          weekday: number
        }
        Insert: {
          break_minutes?: number | null
          company_id: string
          employee_id?: string | null
          expected_in: string
          expected_out: string
          id?: string
          is_work_day?: boolean | null
          user_id?: string | null
          weekday: number
        }
        Update: {
          break_minutes?: number | null
          company_id?: string
          employee_id?: string | null
          expected_in?: string
          expected_out?: string
          id?: string
          is_work_day?: boolean | null
          user_id?: string | null
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "time_schedules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_schedules_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      time_settings: {
        Row: {
          allow_off_hours: boolean | null
          company_id: string
          created_at: string | null
          default_break_min: number | null
          default_in: string
          default_out: string
          id: string
          late_tolerance_min: number | null
          max_radius_meters: number | null
          require_geolocation: boolean | null
          require_selfie: boolean | null
          updated_at: string | null
        }
        Insert: {
          allow_off_hours?: boolean | null
          company_id: string
          created_at?: string | null
          default_break_min?: number | null
          default_in?: string
          default_out?: string
          id?: string
          late_tolerance_min?: number | null
          max_radius_meters?: number | null
          require_geolocation?: boolean | null
          require_selfie?: boolean | null
          updated_at?: string | null
        }
        Update: {
          allow_off_hours?: boolean | null
          company_id?: string
          created_at?: string | null
          default_break_min?: number | null
          default_in?: string
          default_out?: string
          id?: string
          late_tolerance_min?: number | null
          max_radius_meters?: number | null
          require_geolocation?: boolean | null
          require_selfie?: boolean | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "time_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      time_sheets: {
        Row: {
          balance_min: number | null
          company_id: string
          created_at: string | null
          date: string
          employee_id: string | null
          expected_min: number | null
          first_clock_in: string | null
          id: string
          justification: string | null
          justified_by: string | null
          last_clock_out: string | null
          status: string | null
          total_break_min: number | null
          total_worked_min: number | null
          user_id: string | null
        }
        Insert: {
          balance_min?: number | null
          company_id: string
          created_at?: string | null
          date: string
          employee_id?: string | null
          expected_min?: number | null
          first_clock_in?: string | null
          id?: string
          justification?: string | null
          justified_by?: string | null
          last_clock_out?: string | null
          status?: string | null
          total_break_min?: number | null
          total_worked_min?: number | null
          user_id?: string | null
        }
        Update: {
          balance_min?: number | null
          company_id?: string
          created_at?: string | null
          date?: string
          employee_id?: string | null
          expected_min?: number | null
          first_clock_in?: string | null
          id?: string
          justification?: string | null
          justified_by?: string | null
          last_clock_out?: string | null
          status?: string | null
          total_break_min?: number | null
          total_worked_min?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "time_sheets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_sheets_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_events: {
        Row: {
          company_id: string
          created_at: string
          event_type: string
          id: string
          metadata: Json | null
          user_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json | null
          user_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "usage_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_notifications: {
        Row: {
          action_url: string | null
          created_at: string
          expires_at: string | null
          icon: string | null
          id: string
          message: string | null
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          action_url?: string | null
          created_at?: string
          expires_at?: string | null
          icon?: string | null
          id?: string
          message?: string | null
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          action_url?: string | null
          created_at?: string
          expires_at?: string | null
          icon?: string | null
          id?: string
          message?: string | null
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      user_permissions: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          permissions: Json
          preset_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          permissions?: Json
          preset_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          permissions?: Json
          preset_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_permissions_preset_id_fkey"
            columns: ["preset_id"]
            isOneToOne: false
            referencedRelation: "permission_presets"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preferences: {
        Row: {
          schedule_view_mode_desktop: string
          schedule_view_mode_mobile: string
          updated_at: string
          user_id: string
        }
        Insert: {
          schedule_view_mode_desktop?: string
          schedule_view_mode_mobile?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          schedule_view_mode_desktop?: string
          schedule_view_mode_mobile?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
    }
    Views: {
      contract_health_status: {
        Row: {
          company_id: string | null
          contract_id: string | null
          health_status: string | null
          overdue_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contracts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_resources_with_rate: {
        Row: {
          category: string | null
          company_id: string | null
          created_at: string | null
          hourly_rate: number | null
          id: string | null
          is_active: boolean | null
          monthly_hours: number | null
          name: string | null
          notes: string | null
          photo_url: string | null
          total_monthly_cost: number | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cost_resources_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      salespeople_basic: {
        Row: {
          email: string | null
          id: string | null
          is_active: boolean | null
          name: string | null
          photo_url: string | null
          referral_code: string | null
          role: string | null
          user_id: string | null
        }
        Insert: {
          email?: string | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          photo_url?: string | null
          referral_code?: string | null
          role?: string | null
          user_id?: string | null
        }
        Update: {
          email?: string | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          photo_url?: string | null
          referral_code?: string | null
          role?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_terms_of_service: {
        Args: { p_version?: string }
        Returns: undefined
      }
      admin_delete_company: {
        Args: { p_company_id: string }
        Returns: undefined
      }
      asaas_reconciliation_alert: { Args: never; Returns: number }
      asaas_reconciliation_check: {
        Args: never
        Returns: {
          description: string
          detail: string
          issue_type: string
          ref: string
        }[]
      }
      auth_user_exists_by_email: { Args: { p_email: string }; Returns: boolean }
      auth_user_id_by_email: { Args: { p_email: string }; Returns: string }
      can_bootstrap_admin: { Args: never; Returns: boolean }
      can_manage_billing_reminder: {
        Args: { p_transaction_id: string; p_user_id: string }
        Returns: boolean
      }
      can_manage_contracts: { Args: { _user_id: string }; Returns: boolean }
      can_manage_system: { Args: { _user_id: string }; Returns: boolean }
      can_manage_users: { Args: { _user_id: string }; Returns: boolean }
      company_has_module: {
        Args: { p_company_id: string; p_module_code: string }
        Returns: boolean
      }
      compute_next_expiration: {
        Args: { p_current: string; p_cycle: string }
        Returns: string
      }
      compute_payroll_periods: {
        Args: { p_employee_id: string; p_from: string; p_to: string }
        Returns: {
          amount_factor: number
          due_date: string
          period: string
        }[]
      }
      credit_ltv_once_for_payment: {
        Args: {
          p_amount: number
          p_asaas_payment_id: string
          p_company_id: string
        }
        Returns: boolean
      }
      delete_company_payment_with_rollback: {
        Args: { p_payment_id: string }
        Returns: undefined
      }
      fisqal_next_dps_number: {
        Args: { p_company_id: string }
        Returns: number
      }
      generate_payroll_for_employee: {
        Args: { p_employee_id: string; p_lookahead_days?: number }
        Returns: number
      }
      generate_pmoc_token: { Args: never; Returns: string }
      generate_public_short_code: {
        Args: { p_len?: number }
        Returns: string
      }
      get_company_health_scores: {
        Args: never
        Returns: {
          company_id: string
          company_name: string
          subscription_status: string
          subscription_plan: string
          last_activity_at: string
          events_7d: number
          events_14d: number
          events_30d: number
          health_status: string
        }[]
      }
      get_nps_criteria_averages: {
        Args: { p_end: string; p_start: string }
        Returns: {
          label: string
          media: number
          respostas: number
        }[]
      }
      get_nps_open_detractors: {
        Args: { p_end: string; p_start: string }
        Returns: {
          comment: string
          customer_name: string
          nps_score: number
          order_number: number
          os_id: string
          rated_at: string
          rated_by_name: string
          technician_id: string
          technician_name: string
        }[]
      }
      get_nps_technician_ranking: {
        Args: { p_end: string; p_start: string }
        Returns: {
          avatar_url: string
          full_name: string
          media_estrelas: number
          nps_medio: number
          os_concluidas: number
          respostas: number
          taxa_resposta: number
          user_id: string
        }[]
      }
      get_portal_by_token: {
        Args: { _token: string }
        Returns: {
          created_at: string
          customer_id: string
          id: string
          is_active: boolean
        }[]
      }
      get_portal_data: { Args: { p_token: string }; Returns: Json }
      get_profile_company_id: { Args: { _user_id: string }; Returns: string }
      get_public_os: { Args: { p_os_id: string }; Returns: Json }
      get_public_os_by_code: { Args: { p_code: string }; Returns: Json }
      get_quote_by_token: {
        Args: { _token: string }
        Returns: {
          assigned_to: string | null
          card_discount_rate: number
          card_installments: number
          company_id: string
          created_at: string
          created_by: string | null
          customer_id: string | null
          discount_amount: number | null
          discount_type: string | null
          discount_value: number | null
          financial_generated_at: string | null
          financial_transaction_id: string | null
          id: string
          include_gifts: boolean
          notes: string | null
          proposal_template_id: string | null
          prospect_email: string | null
          prospect_name: string | null
          prospect_phone: string | null
          quote_number: number
          status: string
          subtotal: number | null
          terms: string | null
          token: string
          total_value: number | null
          updated_at: string
          valid_until: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "quotes"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_rating_by_token: {
        Args: { _token: string }
        Returns: {
          comment: string | null
          created_at: string
          id: string
          nps_score: number | null
          professionalism_rating: number | null
          punctuality_rating: number | null
          quality_rating: number | null
          rated_at: string | null
          rated_by_name: string | null
          service_order_id: string
          token: string
        }[]
        SetofOptions: {
          from: "*"
          to: "service_ratings"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_rating_with_os_by_token: { Args: { p_token: string }; Returns: Json }
      get_user_company_id: { Args: { _user_id: string }; Returns: string }
      get_user_permissions: { Args: { _user_id: string }; Returns: Json }
      has_admin_permission: {
        Args: { _permission: string; _user_id: string }
        Returns: boolean
      }
      has_full_permissions: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin_or_gestor: { Args: { _user_id: string }; Returns: boolean }
      is_admin_user: { Args: { _user_id: string }; Returns: boolean }
      is_business_day: {
        Args: { d: string; p_company_id?: string }
        Returns: boolean
      }
      is_customer_in_active_portal: {
        Args: { _customer_id: string }
        Returns: boolean
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      is_user_active: { Args: { _user_id: string }; Returns: boolean }
      next_compra_numero: {
        Args: { p_company_id: string }
        Returns: number
      }
      next_equipment_identifier: {
        Args: { p_company_id: string }
        Returns: string
      }
      nfse_can_emit: { Args: { p_company_id: string }; Returns: Json }
      nfse_month_usage: { Args: { p_company_id: string }; Returns: number }
      notify_terms_update: {
        Args: { p_message?: string; p_title?: string; p_version: string }
        Returns: undefined
      }
      nth_business_day: {
        Args: {
          p_company_id?: string
          p_month: number
          p_n: number
          p_year: number
        }
        Returns: string
      }
      pay_payroll_transaction: {
        Args: {
          p_account_id: string
          p_net_amount?: number
          p_notes?: string
          p_paid_date?: string
          p_payment_method?: string
          p_transaction_id: string
          p_vale_discount?: number
        }
        Returns: Json
      }
      recalc_amount_received: {
        Args: { p_parent_id: string }
        Returns: undefined
      }
      regenerate_pmoc_token: {
        Args: { p_contract_id: string }
        Returns: string
      }
      register_inventory_movement: {
        Args: {
          p_inventory_id: string
          p_movement_type: string
          p_quantity: number
          p_supplier_id?: string
          p_unit_cost?: number
          p_notes?: string
          p_service_order_id?: string
          p_related_movement_id?: string
        }
        Returns: Database["public"]["Tables"]["inventory_movements"]["Row"]
      }
      reassign_contract_pending_orders: {
        Args: {
          p_contract_id: string
          p_team_id: string
          p_technician_id: string
        }
        Returns: number
      }
      register_manual_company_payment: {
        Args: {
          p_amount: number
          p_closer_id?: string
          p_company_id: string
          p_cpf_cnpj?: string
          p_notes?: string
          p_payment_date: string
          p_payment_method: string
          p_sdr_id?: string
          p_type: string
        }
        Returns: string
      }
      reset_system_audit_start: {
        Args: { p_company_id: string; p_options: Json }
        Returns: string
      }
      reset_system_step: {
        Args: { p_audit_id: string; p_company_id: string; p_step: string }
        Returns: Json
      }
      resolve_billing_reminder: {
        Args: { p_transaction_id: string }
        Returns: undefined
      }
      seed_company_catalog: {
        Args: { p_company_id: string }
        Returns: undefined
      }
      submit_public_os_rating: {
        Args: {
          p_comment?: string
          p_criteria?: Json
          p_name?: string
          p_nps: number
          p_os_id: string
        }
        Returns: Json
      }
      unresolve_billing_reminder: {
        Args: { p_transaction_id: string }
        Returns: undefined
      }
    }
    Enums: {
      admin_task_priority: "baixa" | "media" | "alta" | "urgente"
      admin_task_status: "novo" | "em_andamento" | "aguardando" | "resolvido"
      admin_task_type:
        | "chamado"
        | "implantacao"
        | "bug"
        | "financeiro"
        | "melhoria"
        | "follow-up"
      app_role:
        | "admin"
        | "gestor"
        | "tecnico"
        | "comercial"
        | "financeiro"
        | "super_admin"
      customer_type: "pf" | "pj"
      lead_status:
        | "lead"
        | "proposta"
        | "negociacao"
        | "fechado_ganho"
        | "fechado_perdido"
      os_status:
        | "agendada"
        | "pendente"
        | "a_caminho"
        | "em_andamento"
        | "concluida"
        | "cancelada"
        | "pausada"
      os_type:
        | "manutencao_preventiva"
        | "manutencao_corretiva"
        | "instalacao"
        | "visita_tecnica"
      transaction_type: "entrada" | "saida"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      admin_task_priority: ["baixa", "media", "alta", "urgente"],
      admin_task_status: ["novo", "em_andamento", "aguardando", "resolvido"],
      admin_task_type: [
        "chamado",
        "implantacao",
        "bug",
        "financeiro",
        "melhoria",
        "follow-up",
      ],
      app_role: [
        "admin",
        "gestor",
        "tecnico",
        "comercial",
        "financeiro",
        "super_admin",
      ],
      customer_type: ["pf", "pj"],
      lead_status: [
        "lead",
        "proposta",
        "negociacao",
        "fechado_ganho",
        "fechado_perdido",
      ],
      os_status: [
        "agendada",
        "pendente",
        "a_caminho",
        "em_andamento",
        "concluida",
        "cancelada",
        "pausada",
      ],
      os_type: [
        "manutencao_preventiva",
        "manutencao_corretiva",
        "instalacao",
        "visita_tecnica",
      ],
      transaction_type: ["entrada", "saida"],
    },
  },
} as const
