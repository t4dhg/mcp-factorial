// FactorialHR API Client

import type { Employee, Team, Location, Contract } from './types.js';

const FACTORIAL_BASE_URL = 'https://api.factorialhr.com/api/2025-01-01/resources';

function getApiKey(): string {
  const apiKey = process.env.FACTORIAL_API_KEY;
  if (!apiKey) {
    throw new Error('FACTORIAL_API_KEY environment variable is not set');
  }
  return apiKey;
}

async function factorialFetch<T>(endpoint: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const url = new URL(`${FACTORIAL_BASE_URL}${endpoint}`);

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        url.searchParams.append(key, String(value));
      }
    });
  }

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'x-api-key': getApiKey(),
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`FactorialHR API error (${response.status}): ${errorText}`);
  }

  return response.json() as Promise<T>;
}

// Employee endpoints
export async function listEmployees(options?: {
  team_id?: number;
  location_id?: number;
}): Promise<Employee[]> {
  const data = await factorialFetch<{ data: Employee[] }>('/core/employees', options);
  return data.data || [];
}

export async function getEmployee(id: number): Promise<Employee> {
  const data = await factorialFetch<{ data: Employee }>(`/core/employees/${id}`);
  return data.data;
}

export async function searchEmployees(query: string): Promise<Employee[]> {
  // Factorial doesn't have a native search, so we fetch all and filter
  const employees = await listEmployees();
  const lowerQuery = query.toLowerCase();

  return employees.filter(emp =>
    emp.full_name?.toLowerCase().includes(lowerQuery) ||
    emp.email?.toLowerCase().includes(lowerQuery) ||
    emp.first_name?.toLowerCase().includes(lowerQuery) ||
    emp.last_name?.toLowerCase().includes(lowerQuery)
  );
}

// Team endpoints
export async function listTeams(): Promise<Team[]> {
  const data = await factorialFetch<{ data: Team[] }>('/core/teams');
  return data.data || [];
}

export async function getTeam(id: number): Promise<Team> {
  const data = await factorialFetch<{ data: Team }>(`/core/teams/${id}`);
  return data.data;
}

// Location endpoints
export async function listLocations(): Promise<Location[]> {
  const data = await factorialFetch<{ data: Location[] }>('/core/locations');
  return data.data || [];
}

export async function getLocation(id: number): Promise<Location> {
  const data = await factorialFetch<{ data: Location }>(`/core/locations/${id}`);
  return data.data;
}

// Contract endpoints
export async function listContracts(employeeId?: number): Promise<Contract[]> {
  const params = employeeId ? { employee_id: employeeId } : undefined;
  const data = await factorialFetch<{ data: Contract[] }>('/contracts/contract_versions', params);
  return data.data || [];
}
