// FactorialHR API Response Types

export interface Employee {
  id: number;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string;
  birthday_on: string | null;
  terminated_on: string | null;
  gender: string | null;
  nationality: string | null;
  manager_id: number | null;
  role: string | null;
  timeoff_manager_id: number | null;
  company_id: number;
  legal_entity_id: number | null;
  team_ids: number[];
  location_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface Team {
  id: number;
  name: string;
  description: string | null;
  company_id: number;
  employee_ids: number[];
  lead_ids: number[];
  created_at: string;
  updated_at: string;
}

export interface Location {
  id: number;
  name: string;
  country: string | null;
  phone_number: string | null;
  state: string | null;
  city: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  postal_code: string | null;
  company_id: number;
  created_at: string;
  updated_at: string;
}

export interface Contract {
  id: number;
  employee_id: number;
  job_title: string | null;
  effective_on: string;
  created_at: string;
  updated_at: string;
}

export interface ApiError {
  error: string;
  message: string;
  status: number;
}
