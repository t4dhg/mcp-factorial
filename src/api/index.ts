/**
 * FactorialHR API Client
 *
 * Provides access to FactorialHR API endpoints with caching, pagination, and retry logic.
 *
 * This module re-exports all API functions from domain-specific files.
 */

// Shared utilities
export { clearCache, invalidateCache } from './shared.js';

// Employees
export {
  listEmployees,
  getEmployee,
  searchEmployees,
  createEmployee,
  updateEmployee,
  terminateEmployee,
} from './employees.js';

// Teams
export { listTeams, getTeam, createTeam, updateTeam, deleteTeam } from './teams.js';

// Locations
export {
  listLocations,
  getLocation,
  createLocation,
  updateLocation,
  deleteLocation,
} from './locations.js';

// Contracts
export {
  listContracts,
  getLatestContract,
  getEmployeeWithContract,
  listEmployeesByJobRole,
  listEmployeesByJobLevel,
  type EmployeeWithContract,
} from './contracts.js';

// Time Off
export {
  listLeaves,
  getLeave,
  listLeaveTypes,
  getLeaveType,
  listAllowances,
  createLeave,
  updateLeave,
  cancelLeave,
  approveLeave,
  rejectLeave,
} from './time-off.js';

// Attendance
export { listShifts, getShift, createShift, updateShift, deleteShift } from './attendance.js';

// Documents
export {
  listFolders,
  getFolder,
  listDocuments,
  getDocument,
  getDocumentDownloadUrls,
  downloadDocument,
  downloadEmployeePayslips,
  downloadEmployeeDocument,
} from './documents.js';

// Job Catalog
export { listJobRoles, getJobRole, listJobLevels, getJobLevel } from './job-catalog.js';

// Projects
export {
  listProjects,
  getProject,
  listProjectTasks,
  getProjectTask,
  listProjectWorkers,
  getProjectWorker,
  listTimeRecords,
  getTimeRecord,
  createProject,
  updateProject,
  deleteProject,
  createProjectTask,
  updateProjectTask,
  deleteProjectTask,
  assignProjectWorker,
  removeProjectWorker,
  createTimeRecord,
  updateTimeRecord,
  deleteTimeRecord,
} from './projects.js';

// Training
export {
  listTrainings,
  getTraining,
  listTrainingSessions,
  getTrainingSession,
  listTrainingEnrollments,
  getTrainingEnrollment,
  createTraining,
  updateTraining,
  deleteTraining,
  createTrainingSession,
  updateTrainingSession,
  deleteTrainingSession,
  enrollInTraining,
  unenrollFromTraining,
} from './training.js';

// Work Areas
export {
  listWorkAreas,
  getWorkArea,
  createWorkArea,
  updateWorkArea,
  archiveWorkArea,
  unarchiveWorkArea,
} from './work-areas.js';

// ATS (Recruiting)
export {
  listJobPostings,
  getJobPosting,
  listCandidates,
  getCandidate,
  listApplications,
  getApplication,
  listHiringStages,
  getHiringStage,
  createJobPosting,
  updateJobPosting,
  deleteJobPosting,
  createCandidate,
  updateCandidate,
  deleteCandidate,
  createApplication,
  updateApplication,
  deleteApplication,
  advanceApplication,
} from './ats.js';

// Payroll
export {
  listPayrollSupplements,
  getPayrollSupplement,
  listTaxIdentifiers,
  getTaxIdentifier,
  listFamilySituations,
  getFamilySituation,
} from './payroll.js';
