/**
 * Shared tool utilities and constants
 */

import { getOperationPolicy, getWarningMessage } from '../write-safety.js';

/**
 * Category definitions for tool discovery
 */
export const CATEGORIES = {
  employees: {
    name: 'Employees',
    description: 'Manage employee records',
    actions: ['list', 'get', 'search', 'create', 'update', 'terminate'],
  },
  teams: {
    name: 'Teams',
    description: 'Manage team structure',
    actions: ['list', 'get', 'create', 'update', 'delete'],
  },
  locations: {
    name: 'Locations',
    description: 'Manage company locations',
    actions: ['list', 'get', 'create', 'update', 'delete'],
  },
  contracts: {
    name: 'Contracts',
    description: 'Employee contract and salary data',
    actions: ['list', 'get_with_employee', 'by_job_role', 'by_job_level'],
  },
  time_off: {
    name: 'Time Off',
    description: 'Leave requests and allowances',
    actions: [
      'list_leaves',
      'get_leave',
      'list_types',
      'get_type',
      'list_allowances',
      'create',
      'update',
      'cancel',
      'approve',
      'reject',
    ],
  },
  attendance: {
    name: 'Attendance',
    description: 'Clock in/out and shift records',
    actions: ['list', 'get', 'create', 'update', 'delete'],
  },
  documents: {
    name: 'Documents',
    description: 'Document management and downloads',
    actions: [
      'list_folders',
      'get_folder',
      'list',
      'get',
      'get_by_employee',
      'search',
      'download_payslips',
      'download',
    ],
  },
  job_catalog: {
    name: 'Job Catalog',
    description: 'Job roles and levels',
    actions: ['list_roles', 'get_role', 'list_levels'],
  },
  projects: {
    name: 'Projects',
    description: 'Project management with tasks, workers, and time tracking',
    actions: [
      'list',
      'get',
      'create',
      'update',
      'delete',
      'list_tasks',
      'create_task',
      'update_task',
      'delete_task',
      'list_workers',
      'assign_worker',
      'remove_worker',
      'list_time',
      'create_time',
      'update_time',
      'delete_time',
    ],
  },
  training: {
    name: 'Training',
    description: 'Training programs, sessions, and enrollments',
    actions: [
      'list',
      'get',
      'create',
      'update',
      'delete',
      'list_sessions',
      'create_session',
      'update_session',
      'delete_session',
      'list_enrollments',
      'enroll',
      'unenroll',
    ],
  },
  work_areas: {
    name: 'Work Areas',
    description: 'Work areas within locations',
    actions: ['list', 'get', 'create', 'update', 'archive', 'unarchive'],
  },
  ats: {
    name: 'ATS (Recruiting)',
    description: 'Applicant tracking: job postings, candidates, applications',
    actions: [
      'list_postings',
      'get_posting',
      'create_posting',
      'update_posting',
      'delete_posting',
      'list_candidates',
      'get_candidate',
      'create_candidate',
      'update_candidate',
      'delete_candidate',
      'list_applications',
      'get_application',
      'create_application',
      'update_application',
      'delete_application',
      'advance_application',
      'list_stages',
    ],
  },
  payroll: {
    name: 'Payroll',
    description: 'Payroll supplements, tax IDs, family situations (read-only)',
    actions: [
      'list_supplements',
      'get_supplement',
      'list_tax_ids',
      'get_tax_id',
      'list_family',
      'get_family',
    ],
  },
} as const;

/**
 * Check if confirmation is required for a high-risk operation
 */
export function checkConfirmation(
  operationName: string,
  confirm?: boolean
): { needsConfirmation: true; message: string } | { needsConfirmation: false } {
  const policy = getOperationPolicy(operationName);
  if (policy.requiresConfirmation && !confirm) {
    const warning = getWarningMessage(operationName);
    return {
      needsConfirmation: true,
      message: `${warning}\n\nTo proceed, call this tool again with \`confirm: true\`.`,
    };
  }
  return { needsConfirmation: false };
}
