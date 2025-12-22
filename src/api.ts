// FactorialHR API Client

import type { Employee, Team, Location, Contract } from './types.js';

const FACTORIAL_BASE_URL = 'https://api.factorialhr.com/api/2025-10-01/resources';
const DEFAULT_TIMEOUT = 30000; // 30 seconds

const DEBUG = process.env.DEBUG === 'true';

function debug(message: string, data?: unknown): void {
  if (DEBUG) {
    const timestamp = new Date().toISOString();
    if (data) {
      console.error(`[${timestamp}] [mcp-factorial] ${message}`, JSON.stringify(data, null, 2));
    } else {
      console.error(`[${timestamp}] [mcp-factorial] ${message}`);
    }
  }
}

function getApiKey(): string {
  const apiKey = process.env.FACTORIAL_API_KEY;
  if (!apiKey) {
    throw new Error(
      'FACTORIAL_API_KEY is not set. ' +
      'Please add it to your .env file or pass it via the MCP configuration. ' +
      'See https://github.com/t4dhg/mcp-factorial for setup instructions.'
    );
  }
  return apiKey;
}

async function factorialFetch<T>(
  endpoint: string,
  params?: Record<string, string | number | undefined>
): Promise<T> {
  const url = new URL(`${FACTORIAL_BASE_URL}${endpoint}`);

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        url.searchParams.append(key, String(value));
      }
    });
  }

  debug(`Fetching: ${url.toString()}`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'x-api-key': getApiKey(),
        'Accept': 'application/json',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      debug(`API error (${response.status}):`, errorText);

      // Provide user-friendly error messages
      if (response.status === 401) {
        throw new Error('Invalid API key. Please check your FACTORIAL_API_KEY.');
      }
      if (response.status === 403) {
        throw new Error('Access denied. Your API key may not have permission for this operation.');
      }
      if (response.status === 404) {
        throw new Error('Resource not found. The requested employee, team, or location may not exist.');
      }
      if (response.status === 429) {
        throw new Error('Rate limit exceeded. Please wait a moment before trying again.');
      }

      throw new Error(`FactorialHR API error (${response.status}): ${errorText}`);
    }

    const data = await response.json() as T;
    debug('Response received', { endpoint, itemCount: Array.isArray(data) ? data.length : 1 });
    return data;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new Error(`Request timed out after ${DEFAULT_TIMEOUT / 1000} seconds. Please try again.`);
      }
      throw error;
    }
    throw new Error('An unexpected error occurred while fetching data from FactorialHR.');
  }
}

// Employee endpoints
export async function listEmployees(options?: {
  team_id?: number;
  location_id?: number;
}): Promise<Employee[]> {
  const data = await factorialFetch<{ data: Employee[] }>('/employees/employees', options);
  return data.data || [];
}

export async function getEmployee(id: number): Promise<Employee> {
  if (!id || id <= 0) {
    throw new Error('Invalid employee ID. Please provide a positive number.');
  }
  const data = await factorialFetch<{ data: Employee }>(`/employees/employees/${id}`);
  return data.data;
}

export async function searchEmployees(query: string): Promise<Employee[]> {
  if (!query || query.trim().length < 2) {
    throw new Error('Search query must be at least 2 characters long.');
  }

  const employees = await listEmployees();
  const lowerQuery = query.toLowerCase().trim();

  return employees.filter(emp =>
    emp.full_name?.toLowerCase().includes(lowerQuery) ||
    emp.email?.toLowerCase().includes(lowerQuery) ||
    emp.first_name?.toLowerCase().includes(lowerQuery) ||
    emp.last_name?.toLowerCase().includes(lowerQuery)
  );
}

// Team endpoints
export async function listTeams(): Promise<Team[]> {
  const data = await factorialFetch<{ data: Team[] }>('/teams/teams');
  return data.data || [];
}

export async function getTeam(id: number): Promise<Team> {
  if (!id || id <= 0) {
    throw new Error('Invalid team ID. Please provide a positive number.');
  }
  const data = await factorialFetch<{ data: Team }>(`/teams/teams/${id}`);
  return data.data;
}

// Location endpoints
export async function listLocations(): Promise<Location[]> {
  const data = await factorialFetch<{ data: Location[] }>('/locations/locations');
  return data.data || [];
}

export async function getLocation(id: number): Promise<Location> {
  if (!id || id <= 0) {
    throw new Error('Invalid location ID. Please provide a positive number.');
  }
  const data = await factorialFetch<{ data: Location }>(`/locations/locations/${id}`);
  return data.data;
}

// Contract endpoints
export async function listContracts(employeeId?: number): Promise<Contract[]> {
  if (employeeId !== undefined && employeeId <= 0) {
    throw new Error('Invalid employee ID. Please provide a positive number.');
  }
  // Note: The API doesn't reliably filter by employee_id query param,
  // so we fetch all contracts and filter client-side
  const data = await factorialFetch<{ data: Contract[] }>('/contracts/contract-versions');
  const contracts = data.data || [];

  if (employeeId !== undefined) {
    return contracts.filter(c => c.employee_id === employeeId);
  }
  return contracts;
}
