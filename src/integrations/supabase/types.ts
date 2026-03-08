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
      companies: {
        Row: {
          address: string | null
          billing_cycle: string | null
          cnpj: string | null
          contact_name: string | null
          created_at: string | null
          email: string | null
          id: string
          logo_url: string | null
          max_users: number | null
          name: string
          notes: string | null
          origin: string | null
          phone: string | null
          subscription_expires_at: string | null
          subscription_plan: string | null
          subscription_status: string
          subscription_value: number | null
          trial_days: number | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          billing_cycle?: string | null
          cnpj?: string | null
          contact_name?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          logo_url?: string | null
          max_users?: number | null
          name: string
          notes?: string | null
          origin?: string | null
          phone?: string | null
          subscription_expires_at?: string | null
          subscription_plan?: string | null
          subscription_status?: string
          subscription_value?: number | null
          trial_days?: number | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          billing_cycle?: string | null
          cnpj?: string | null
          contact_name?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          logo_url?: string | null
          max_users?: number | null
          name?: string
          notes?: string | null
          origin?: string | null
          phone?: string | null
          subscription_expires_at?: string | null
          subscription_plan?: string | null
          subscription_status?: string
          subscription_value?: number | null
          trial_days?: number | null
          updated_at?: string | null
        }
        Relationships: []
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
      company_settings: {
        Row: {
          address: string | null
          city: string | null
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
          state: string | null
          updated_at: string
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
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
          state?: string | null
          updated_at?: string
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
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
          state?: string | null
          updated_at?: string
          zip_code?: string | null
        }
        Relationships: []
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
          start_date: string
          status: string
          team_id: string | null
          technician_id: string | null
          updated_at: string
        }
        Insert: {
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
          start_date: string
          status?: string
          team_id?: string | null
          technician_id?: string | null
          updated_at?: string
        }
        Update: {
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
      crm_stages: {
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
          company_name: string | null
          complement: string | null
          created_at: string
          customer_type: Database["public"]["Enums"]["customer_type"]
          deleted_at: string | null
          document: string | null
          email: string | null
          id: string
          is_deleted: boolean
          name: string
          neighborhood: string | null
          notes: string | null
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
          company_name?: string | null
          complement?: string | null
          created_at?: string
          customer_type?: Database["public"]["Enums"]["customer_type"]
          deleted_at?: string | null
          document?: string | null
          email?: string | null
          id?: string
          is_deleted?: boolean
          name: string
          neighborhood?: string | null
          notes?: string | null
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
          company_name?: string | null
          complement?: string | null
          created_at?: string
          customer_type?: Database["public"]["Enums"]["customer_type"]
          deleted_at?: string | null
          document?: string | null
          email?: string | null
          id?: string
          is_deleted?: boolean
          name?: string
          neighborhood?: string | null
          notes?: string | null
          phone?: string | null
          photo_url?: string | null
          state?: string | null
          updated_at?: string
          zip_code?: string | null
        }
        Relationships: []
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
          cpf: string | null
          created_at: string
          email: string | null
          hire_date: string | null
          id: string
          is_active: boolean
          name: string
          phone: string | null
          photo_url: string | null
          pix_key: string | null
          position: string | null
          salary: number | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          cpf?: string | null
          created_at?: string
          email?: string | null
          hire_date?: string | null
          id?: string
          is_active?: boolean
          name: string
          phone?: string | null
          photo_url?: string | null
          pix_key?: string | null
          position?: string | null
          salary?: number | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          cpf?: string | null
          created_at?: string
          email?: string | null
          hire_date?: string | null
          id?: string
          is_active?: boolean
          name?: string
          phone?: string | null
          photo_url?: string | null
          pix_key?: string | null
          position?: string | null
          salary?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      equipment: {
        Row: {
          brand: string | null
          capacity: string | null
          category_id: string | null
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
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      equipment_field_config: {
        Row: {
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
        Relationships: []
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
      financial_categories: {
        Row: {
          color: string
          created_at: string
          icon: string | null
          id: string
          is_active: boolean
          name: string
          type: string
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          name: string
          type?: string
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          name?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      financial_transactions: {
        Row: {
          amount: number
          category: string | null
          contract_id: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          description: string
          due_date: string | null
          id: string
          is_paid: boolean | null
          notes: string | null
          paid_date: string | null
          receipt_url: string | null
          service_order_id: string | null
          transaction_date: string
          transaction_type: Database["public"]["Enums"]["transaction_type"]
          updated_at: string
        }
        Insert: {
          amount: number
          category?: string | null
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          description: string
          due_date?: string | null
          id?: string
          is_paid?: boolean | null
          notes?: string | null
          paid_date?: string | null
          receipt_url?: string | null
          service_order_id?: string | null
          transaction_date?: string
          transaction_type: Database["public"]["Enums"]["transaction_type"]
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: string | null
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          description?: string
          due_date?: string | null
          id?: string
          is_paid?: boolean | null
          notes?: string | null
          paid_date?: string | null
          receipt_url?: string | null
          service_order_id?: string | null
          transaction_date?: string
          transaction_type?: Database["public"]["Enums"]["transaction_type"]
          updated_at?: string
        }
        Relationships: [
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
          id: string
          question_id: string
          responded_at: string
          responded_by: string | null
          response_photo_url: string | null
          response_value: string | null
          service_order_id: string
        }
        Insert: {
          id?: string
          question_id: string
          responded_at?: string
          responded_by?: string | null
          response_photo_url?: string | null
          response_value?: string | null
          service_order_id: string
        }
        Update: {
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
        Relationships: []
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
          created_at?: string
          id?: string
          is_default?: boolean
          key?: string
          label?: string
          position?: number
          updated_at?: string
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
      pmoc_contracts: {
        Row: {
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
      profiles: {
        Row: {
          avatar_url: string | null
          company_id: string | null
          created_at: string
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
          created_at: string
          created_by: string | null
          customer_id: string | null
          discount_amount: number | null
          discount_type: string | null
          discount_value: number | null
          id: string
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
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          discount_amount?: number | null
          discount_type?: string | null
          discount_value?: number | null
          id?: string
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
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          discount_amount?: number | null
          discount_type?: string | null
          discount_value?: number | null
          id?: string
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
      service_order_equipment: {
        Row: {
          created_at: string
          equipment_id: string
          form_template_id: string | null
          id: string
          service_order_id: string
        }
        Insert: {
          created_at?: string
          equipment_id: string
          form_template_id?: string | null
          id?: string
          service_order_id: string
        }
        Update: {
          created_at?: string
          equipment_id?: string
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
          contract_id: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          description: string | null
          diagnosis: string | null
          duration_minutes: number
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
          require_client_signature: boolean | null
          require_tech_signature: boolean | null
          scheduled_date: string | null
          scheduled_time: string | null
          service_type_id: string | null
          solution: string | null
          status: Database["public"]["Enums"]["os_status"]
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
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          description?: string | null
          diagnosis?: string | null
          duration_minutes?: number
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
          require_client_signature?: boolean | null
          require_tech_signature?: boolean | null
          scheduled_date?: string | null
          scheduled_time?: string | null
          service_type_id?: string | null
          solution?: string | null
          status?: Database["public"]["Enums"]["os_status"]
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
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          description?: string | null
          diagnosis?: string | null
          duration_minutes?: number
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
          require_client_signature?: boolean | null
          require_tech_signature?: boolean | null
          scheduled_date?: string | null
          scheduled_time?: string | null
          service_type_id?: string | null
          solution?: string | null
          status?: Database["public"]["Enums"]["os_status"]
          team_id?: string | null
          tech_signature?: string | null
          technician_id?: string | null
          total_value?: number | null
          updated_at?: string
        }
        Relationships: [
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
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          number_prefix?: string | null
          requires_equipment?: boolean
          updated_at?: string
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
          is_active?: boolean | null
          max_users?: number | null
          name?: string
          price?: number
        }
        Relationships: []
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
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          updated_at: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string | null
        }
        Relationships: []
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
      [_ in never]: never
    }
    Functions: {
      can_bootstrap_admin: { Args: never; Returns: boolean }
      get_user_company_id: { Args: { _user_id: string }; Returns: string }
      get_user_permissions: { Args: { _user_id: string }; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin_or_gestor: { Args: { _user_id: string }; Returns: boolean }
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
      os_status: "pendente" | "em_andamento" | "concluida" | "cancelada"
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
      os_status: ["pendente", "em_andamento", "concluida", "cancelada"],
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
