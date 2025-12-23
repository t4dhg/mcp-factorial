/**
 * API Endpoint constants for FactorialHR
 *
 * Centralizes all API endpoint strings to prevent typos, improve refactoring safety,
 * and provide better IDE support.
 */

/**
 * All FactorialHR API endpoints organized by category
 */
export const ENDPOINTS = {
  // Employee endpoints
  employees: '/employees/employees',

  // Team endpoints
  teams: '/teams/teams',

  // Location endpoints
  locations: '/locations/locations',
  workAreas: '/locations/work_areas',

  // Contract endpoints
  contracts: '/contracts/contract-versions',

  // Time Off endpoints
  leaves: '/timeoff/leaves',
  leaveTypes: '/timeoff/leave-types',
  allowances: '/timeoff/allowances',

  // Attendance endpoints
  shifts: '/attendance/shifts',

  // Document endpoints
  folders: '/documents/folders',
  documents: '/documents/documents',

  // Job Catalog endpoints
  jobRoles: '/job_catalog/roles',
  jobLevels: '/job_catalog/levels',

  // Project Management endpoints
  projects: '/project_management/projects',
  projectTasks: '/project_management/project_tasks',
  projectWorkers: '/project_management/project_workers',
  timeRecords: '/project_management/time_records',

  // Training endpoints
  trainings: '/trainings/trainings',
  trainingSessions: '/trainings/sessions',
  trainingMemberships: '/trainings/memberships',

  // ATS (Recruiting) endpoints
  jobPostings: '/ats/job_postings',
  candidates: '/ats/candidates',
  applications: '/ats/applications',
  hiringStages: '/ats/hiring_stages',

  // Payroll endpoints
  payrollSupplements: '/payroll/supplements',
  taxIdentifiers: '/payroll_employees/identifiers',
  familySituations: '/payroll/family_situations',
} as const;

/**
 * Type for endpoint keys
 */
export type EndpointKey = keyof typeof ENDPOINTS;

/**
 * Helper to build an endpoint path with an ID
 */
export function endpointWithId(endpoint: string, id: number): string {
  return `${endpoint}/${id}`;
}

/**
 * Helper to build an action endpoint path (e.g., /leaves/:id/approve)
 */
export function endpointWithAction(endpoint: string, id: number, action: string): string {
  return `${endpoint}/${id}/${action}`;
}
