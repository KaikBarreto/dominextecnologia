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
    PostgrestVersion: "14.1"
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
      companies: {
        Row: {
          address: string | null
          address_number: string | null
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
          id: string
          logo_url: string | null
          max_users: number | null
          name: string
          neighborhood: string | null
          notes: string | null
          origin: string | null
          phone: string | null
          salesperson_id: string | null
          segment: string | null
          state: string | null
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
          id?: string
          logo_url?: string | null
          max_users?: number | null
          name: string
          neighborhood?: string | null
          notes?: string | null
          origin?: string | null
          phone?: string | null
          salesperson_id?: string | null
          segment?: string | null
          state?: string | null
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
          id?: string
          logo_url?: string | null
          max_users?: number | null
          name?: string
          neighborhood?: string | null
          notes?: string | null
          origin?: string | null
          phone?: string | null
          salesperson_id?: string | null
          segment?: string | null
          state?: string | null
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
            foreignKeyName: "companies_salesperson_id_fkey"
            columns: ["salesperson_id"]
            isOneToOne: false
            referencedRelation: "salespeople"
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
            isOneToOne: false
            referencedRelation: "companies"
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
          version: string
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
      contract_items: {
        Row: {
          contract_id: string
          created_at: string
          equipment_id: string | null
          form_template_id: string | null
          id: string
          item_description: string | null
          item_name: string
          sort_order: number | null
        }
        Insert: {
          contract_id: string
          created_at?: string
          equipment_id?: string | null
          form_template_id?: string | null
          id?: string
          item_description?: string | null
          item_name: string
          sort_order?: number | null
        }
        Update: {
          contract_id?: string
          created_at?: string
          equipment_id?: string | null
          form_template_id?: string | null
          id?: string
          item_description?: string | null
          item_name?: string
          sort_order?: number | null
        }
        Relationships: [
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
      contract_occurrences: {
        Row: {
          contract_id: string
          created_at: string
          id: string
          occurrence_number: number
          scheduled_date: string
          service_order_id: string | null
          status: string
        }
        Insert: {
          contract_id: string
          created_at?: string
          id?: string
          occurrence_number: number
          scheduled_date: string
          service_order_id?: string | null
          status?: string
        }
        Update: {
          contract_id?: string
          created_at?: string
          id?: string
          occurrence_number?: number
          scheduled_date?: string
          service_order_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_occurrences_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_occurrences_service_order_id_fkey"
            columns: ["service_order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
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
          name: string
          notes: string | null
          service_type_id: string | null
          show_billing_in_schedule: boolean
          start_date: string
          status: string
          team_id: string | null
          technician_id: string | null
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
          name: string
          notes?: string | null
          service_type_id?: string | null
          show_billing_in_schedule?: boolean
          start_date: string
          status?: string
          team_id?: string | null
          technician_id?: string | null
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
          name?: string
          notes?: string | null
          service_type_id?: string | null
          show_billing_in_schedule?: boolean
          start_date?: string
          status?: string
          team_id?: string | null
          technician_id?: string | null
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
          token: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          is_active?: boolean
          token?: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          is_active?: boolean
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_portals_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
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
          id: string
          is_deleted: boolean
          lat: number | null
          lng: number | null
          name: string
          neighborhood: string | null
          notes: string | null
          origin: string | null
          phone: string | null
          photo_url: string | null
          state: string | null
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
          id?: string
          is_deleted?: boolean
          lat?: number | null
          lng?: number | null
          name: string
          neighborhood?: string | null
          notes?: string | null
          origin?: string | null
          phone?: string | null
          photo_url?: string | null
          state?: string | null
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
          id?: string
          is_deleted?: boolean
          lat?: number | null
          lng?: number | null
          name?: string
          neighborhood?: string | null
          notes?: string | null
          origin?: string | null
          phone?: string | null
          photo_url?: string | null
          state?: string | null
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
          color: string
          company_id: string
          created_at: string
          icon: string | null
          id: string
          initial_balance: number
          institution_code: number | null
          institution_ispb: string | null
          institution_name: string | null
          is_active: boolean
          name: string
          sort_order: number | null
          type: string
          updated_at: string
        }
        Insert: {
          bank_name?: string | null
          color?: string
          company_id: string
          created_at?: string
          icon?: string | null
          id?: string
          initial_balance?: number
          institution_code?: number | null
          institution_ispb?: string | null
          institution_name?: string | null
          is_active?: boolean
          name: string
          sort_order?: number | null
          type?: string
          updated_at?: string
        }
        Update: {
          bank_name?: string | null
          color?: string
          company_id?: string
          created_at?: string
          icon?: string | null
          id?: string
          initial_balance?: number
          institution_code?: number | null
          institution_ispb?: string | null
          institution_name?: string | null
          is_active?: boolean
          name?: string
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
      financial_transactions: {
        Row: {
          account_id: string | null
          amount: number
          category: string | null
          company_id: string
          contract_id: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          description: string
          due_date: string | null
          id: string
          installment_group_id: string | null
          installment_number: number | null
          installment_total: number | null
          is_paid: boolean | null
          notes: string | null
          paid_date: string | null
          payment_method: string | null
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
          category?: string | null
          company_id: string
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          description: string
          due_date?: string | null
          id?: string
          installment_group_id?: string | null
          installment_number?: number | null
          installment_total?: number | null
          is_paid?: boolean | null
          notes?: string | null
          paid_date?: string | null
          payment_method?: string | null
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
          category?: string | null
          company_id?: string
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          description?: string
          due_date?: string | null
          id?: string
          installment_group_id?: string | null
          installment_number?: number | null
          installment_total?: number | null
          is_paid?: boolean | null
          notes?: string | null
          paid_date?: string | null
          payment_method?: string | null
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
          answer_mode: string | null
          answer_types: Json | null
          created_at: string
          description: string | null
          id: string
          is_required: boolean
          options: Json | null
          position: number
          question: string
          question_type: string
          require_camera: boolean
          template_id: string
        }
        Insert: {
          answer_mode?: string | null
          answer_types?: Json | null
          created_at?: string
          description?: string | null
          id?: string
          is_required?: boolean
          options?: Json | null
          position?: number
          question: string
          question_type?: string
          require_camera?: boolean
          template_id: string
        }
        Update: {
          answer_mode?: string | null
          answer_types?: Json | null
          created_at?: string
          description?: string | null
          id?: string
          is_required?: boolean
          options?: Json | null
          position?: number
          question?: string
          question_type?: string
          require_camera?: boolean
          template_id?: string
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
          created_at: string
          created_by: string | null
          id: string
          inventory_id: string
          movement_type: string
          notes: string | null
          quantity: number
          service_order_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          inventory_id: string
          movement_type: string
          notes?: string | null
          quantity: number
          service_order_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          inventory_id?: string
          movement_type?: string
          notes?: string | null
          quantity?: number
          service_order_id?: string | null
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
            foreignKeyName: "inventory_movements_service_order_id_fkey"
            columns: ["service_order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
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
      pmoc_contracts: {
        Row: {
          company_id: string
          contract_number: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          end_date: string
          id: string
          is_active: boolean | null
          maintenance_frequency: string | null
          monthly_value: number | null
          notes: string | null
          start_date: string
          updated_at: string
        }
        Insert: {
          company_id: string
          contract_number?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          end_date: string
          id?: string
          is_active?: boolean | null
          maintenance_frequency?: string | null
          monthly_value?: number | null
          notes?: string | null
          start_date: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          contract_number?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          end_date?: string
          id?: string
          is_active?: boolean | null
          maintenance_frequency?: string | null
          monthly_value?: number | null
          notes?: string | null
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pmoc_contracts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pmoc_contracts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      pmoc_generated_os: {
        Row: {
          generated_at: string
          id: string
          plan_id: string
          scheduled_for: string
          service_order_id: string
        }
        Insert: {
          generated_at?: string
          id?: string
          plan_id: string
          scheduled_for: string
          service_order_id: string
        }
        Update: {
          generated_at?: string
          id?: string
          plan_id?: string
          scheduled_for?: string
          service_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pmoc_generated_os_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "pmoc_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pmoc_generated_os_service_order_id_fkey"
            columns: ["service_order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      pmoc_items: {
        Row: {
          created_at: string
          equipment_id: string
          id: string
          plan_id: string
        }
        Insert: {
          created_at?: string
          equipment_id: string
          id?: string
          plan_id: string
        }
        Update: {
          created_at?: string
          equipment_id?: string
          id?: string
          plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pmoc_items_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pmoc_items_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "pmoc_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      pmoc_plans: {
        Row: {
          contract_id: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          form_template_id: string | null
          frequency_config: Json | null
          frequency_months: number
          frequency_type: string
          generation_horizon_months: number
          id: string
          name: string
          next_generation_date: string
          notes: string | null
          service_type_id: string | null
          status: string
          technician_id: string | null
          updated_at: string
        }
        Insert: {
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          form_template_id?: string | null
          frequency_config?: Json | null
          frequency_months?: number
          frequency_type?: string
          generation_horizon_months?: number
          id?: string
          name: string
          next_generation_date: string
          notes?: string | null
          service_type_id?: string | null
          status?: string
          technician_id?: string | null
          updated_at?: string
        }
        Update: {
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          form_template_id?: string | null
          frequency_config?: Json | null
          frequency_months?: number
          frequency_type?: string
          generation_horizon_months?: number
          id?: string
          name?: string
          next_generation_date?: string
          notes?: string | null
          service_type_id?: string | null
          status?: string
          technician_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pmoc_plans_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "pmoc_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pmoc_plans_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pmoc_plans_form_template_id_fkey"
            columns: ["form_template_id"]
            isOneToOne: false
            referencedRelation: "form_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pmoc_plans_service_type_id_fkey"
            columns: ["service_type_id"]
            isOneToOne: false
            referencedRelation: "service_types"
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
            foreignKeyName: "pmoc_schedules_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "pmoc_contracts"
            referencedColumns: ["id"]
          },
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
          full_name: string
          id: string
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          company_id?: string | null
          created_at?: string
          deletion_requested_at?: string | null
          full_name: string
          id?: string
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          company_id?: string | null
          created_at?: string
          deletion_requested_at?: string | null
          full_name?: string
          id?: string
          phone?: string | null
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
          bdi: number
          created_at: string
          description: string
          id: string
          inventory_id: string | null
          item_type: string
          position: number
          price_override: number | null
          profit_rate: number
          quantity: number
          quote_id: string
          service_type_id: string | null
          sort_order: number | null
          total_cost: number | null
          total_price: number
          unit_extras_cost: number
          unit_hourly_rate: number
          unit_hours: number
          unit_labor_cost: number
          unit_materials_cost: number
          unit_price: number
          unit_total_cost: number
        }
        Insert: {
          bdi?: number
          created_at?: string
          description: string
          id?: string
          inventory_id?: string | null
          item_type?: string
          position?: number
          price_override?: number | null
          profit_rate?: number
          quantity?: number
          quote_id: string
          service_type_id?: string | null
          sort_order?: number | null
          total_cost?: number | null
          total_price?: number
          unit_extras_cost?: number
          unit_hourly_rate?: number
          unit_hours?: number
          unit_labor_cost?: number
          unit_materials_cost?: number
          unit_price?: number
          unit_total_cost?: number
        }
        Update: {
          bdi?: number
          created_at?: string
          description?: string
          id?: string
          inventory_id?: string | null
          item_type?: string
          position?: number
          price_override?: number | null
          profit_rate?: number
          quantity?: number
          quote_id?: string
          service_type_id?: string | null
          sort_order?: number | null
          total_cost?: number | null
          total_price?: number
          unit_extras_cost?: number
          unit_hourly_rate?: number
          unit_hours?: number
          unit_labor_cost?: number
          unit_materials_cost?: number
          unit_price?: number
          unit_total_cost?: number
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
          admin_indirect_rate: number
          assigned_to: string | null
          bdi: number
          card_discount_rate: number
          card_installments: number
          company_id: string
          converted_to_os_id: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          discount_amount: number | null
          discount_type: string | null
          discount_value: number | null
          displacement_cost: number | null
          distance_km: number | null
          final_price: number | null
          id: string
          include_gifts: boolean
          km_cost: number
          notes: string | null
          price_override: number | null
          profit_rate: number
          proposal_template_id: string | null
          prospect_email: string | null
          prospect_name: string | null
          prospect_phone: string | null
          quote_number: number
          status: string
          subtotal: number | null
          tax_rate: number
          terms: string | null
          token: string
          total_cost: number
          total_price: number
          total_value: number | null
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          admin_indirect_rate?: number
          assigned_to?: string | null
          bdi?: number
          card_discount_rate?: number
          card_installments?: number
          company_id: string
          converted_to_os_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          discount_amount?: number | null
          discount_type?: string | null
          discount_value?: number | null
          displacement_cost?: number | null
          distance_km?: number | null
          final_price?: number | null
          id?: string
          include_gifts?: boolean
          km_cost?: number
          notes?: string | null
          price_override?: number | null
          profit_rate?: number
          proposal_template_id?: string | null
          prospect_email?: string | null
          prospect_name?: string | null
          prospect_phone?: string | null
          quote_number?: number
          status?: string
          subtotal?: number | null
          tax_rate?: number
          terms?: string | null
          token?: string
          total_cost?: number
          total_price?: number
          total_value?: number | null
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          admin_indirect_rate?: number
          assigned_to?: string | null
          bdi?: number
          card_discount_rate?: number
          card_installments?: number
          company_id?: string
          converted_to_os_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          discount_amount?: number | null
          discount_type?: string | null
          discount_value?: number | null
          displacement_cost?: number | null
          distance_km?: number | null
          final_price?: number | null
          id?: string
          include_gifts?: boolean
          km_cost?: number
          notes?: string | null
          price_override?: number | null
          profit_rate?: number
          proposal_template_id?: string | null
          prospect_email?: string | null
          prospect_name?: string | null
          prospect_phone?: string | null
          quote_number?: number
          status?: string
          subtotal?: number | null
          tax_rate?: number
          terms?: string | null
          token?: string
          total_cost?: number
          total_price?: number
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
            foreignKeyName: "quotes_converted_to_os_id_fkey"
            columns: ["converted_to_os_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
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
            foreignKeyName: "quotes_proposal_template_id_fkey"
            columns: ["proposal_template_id"]
            isOneToOne: false
            referencedRelation: "proposal_templates"
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
          referral_code: string | null
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
          referral_code?: string | null
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
          referral_code?: string | null
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
        ]
      }
      salesperson_sales: {
        Row: {
          amount: number
          billing_cycle: string
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
        }
        Insert: {
          amount?: number
          billing_cycle?: string
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
        }
        Update: {
          amount?: number
          billing_cycle?: string
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
          id: string
          labor_hours: number | null
          labor_value: number | null
          notes: string | null
          order_number: number
          origin: string
          os_type: Database["public"]["Enums"]["os_type"]
          parts_used: Json | null
          parts_value: number | null
          recurrence_end_date: string | null
          recurrence_group_id: string | null
          recurrence_interval: number | null
          recurrence_type: string | null
          require_client_signature: boolean | null
          require_tech_signature: boolean | null
          scheduled_date: string | null
          scheduled_time: string | null
          service_type_id: string | null
          snapshot_data: Json | null
          solution: string | null
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
          id?: string
          labor_hours?: number | null
          labor_value?: number | null
          notes?: string | null
          order_number?: number
          origin?: string
          os_type?: Database["public"]["Enums"]["os_type"]
          parts_used?: Json | null
          parts_value?: number | null
          recurrence_end_date?: string | null
          recurrence_group_id?: string | null
          recurrence_interval?: number | null
          recurrence_type?: string | null
          require_client_signature?: boolean | null
          require_tech_signature?: boolean | null
          scheduled_date?: string | null
          scheduled_time?: string | null
          service_type_id?: string | null
          snapshot_data?: Json | null
          solution?: string | null
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
          id?: string
          labor_hours?: number | null
          labor_value?: number | null
          notes?: string | null
          order_number?: number
          origin?: string
          os_type?: Database["public"]["Enums"]["os_type"]
          parts_used?: Json | null
          parts_value?: number | null
          recurrence_end_date?: string | null
          recurrence_group_id?: string | null
          recurrence_interval?: number | null
          recurrence_type?: string | null
          require_client_signature?: boolean | null
          require_tech_signature?: boolean | null
          scheduled_date?: string | null
          scheduled_time?: string | null
          service_type_id?: string | null
          snapshot_data?: Json | null
          solution?: string | null
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
          color: string
          company_id: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          number_prefix: string | null
          requires_equipment: boolean
          updated_at: string
        }
        Insert: {
          color?: string
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          number_prefix?: string | null
          requires_equipment?: boolean
          updated_at?: string
        }
        Update: {
          color?: string
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
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
          created_at: string
          event_type: string
          id: string
          lat: number
          lng: number
          service_order_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          event_type?: string
          id?: string
          lat: number
          lng: number
          service_order_id?: string | null
          user_id: string
        }
        Update: {
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
            foreignKeyName: "technician_locations_service_order_id_fkey"
            columns: ["service_order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
        ]
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
    }
    Functions: {
      can_bootstrap_admin: { Args: never; Returns: boolean }
      can_manage_system: { Args: { _user_id: string }; Returns: boolean }
      can_manage_users: { Args: { _user_id: string }; Returns: boolean }
      get_portal_by_token: {
        Args: { _token: string }
        Returns: {
          created_at: string
          customer_id: string
          id: string
          is_active: boolean
        }[]
      }
      get_profile_company_id: { Args: { _user_id: string }; Returns: string }
      get_quote_by_token: {
        Args: { _token: string }
        Returns: {
          admin_indirect_rate: number
          assigned_to: string | null
          bdi: number
          card_discount_rate: number
          card_installments: number
          company_id: string
          converted_to_os_id: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          discount_amount: number | null
          discount_type: string | null
          discount_value: number | null
          displacement_cost: number | null
          distance_km: number | null
          final_price: number | null
          id: string
          include_gifts: boolean
          km_cost: number
          notes: string | null
          price_override: number | null
          profit_rate: number
          proposal_template_id: string | null
          prospect_email: string | null
          prospect_name: string | null
          prospect_phone: string | null
          quote_number: number
          status: string
          subtotal: number | null
          tax_rate: number
          terms: string | null
          token: string
          total_cost: number
          total_price: number
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
      get_user_company_id: { Args: { _user_id: string }; Returns: string }
      get_user_permissions: { Args: { _user_id: string }; Returns: Json }
      has_full_permissions: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin_or_gestor: { Args: { _user_id: string }; Returns: boolean }
      is_customer_in_active_portal: {
        Args: { _customer_id: string }
        Returns: boolean
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      is_user_active: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
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
  public: {
    Enums: {
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
