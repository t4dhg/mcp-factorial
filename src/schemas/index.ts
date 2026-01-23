/**
 * Zod schemas for runtime validation of API responses
 *
 * Catches API version mismatches and ensures type safety at runtime.
 *
 * This module re-exports all schemas from domain-specific files.
 */

// Shared utilities
export {
  dateString,
  createApiResponseSchema,
  createApiListResponseSchema,
  parseData,
  safeParseData,
  parseArray,
} from './shared.js';

// Employee, Team, Location, Contract
export {
  EmployeeSchema,
  type Employee,
  TeamSchema,
  type Team,
  LocationSchema,
  type Location,
  ContractSchema,
  type Contract,
  ContractSummarySchema,
  type ContractSummary,
  CreateEmployeeInputSchema,
  type CreateEmployeeInput,
  UpdateEmployeeInputSchema,
  type UpdateEmployeeInput,
  TerminateEmployeeInputSchema,
  type TerminateEmployeeInput,
  CreateTeamInputSchema,
  type CreateTeamInput,
  UpdateTeamInputSchema,
  type UpdateTeamInput,
  CreateLocationInputSchema,
  type CreateLocationInput,
  UpdateLocationInputSchema,
  type UpdateLocationInput,
} from './employees.js';

// Time Off: Leave, LeaveType, Allowance, Shift
export {
  LeaveSchema,
  type Leave,
  LeaveTypeSchema,
  type LeaveType,
  AllowanceSchema,
  type Allowance,
  ShiftSchema,
  type Shift,
  CreateLeaveInputSchema,
  type CreateLeaveInput,
  UpdateLeaveInputSchema,
  type UpdateLeaveInput,
  LeaveDecisionInputSchema,
  type LeaveDecisionInput,
  CreateShiftInputSchema,
  type CreateShiftInput,
  UpdateShiftInputSchema,
  type UpdateShiftInput,
} from './time-off.js';

// Documents: Folder, Document
export { FolderSchema, type Folder, DocumentSchema, type Document } from './documents.js';

// Job Catalog: JobRole, JobLevel
export { JobRoleSchema, type JobRole, JobLevelSchema, type JobLevel } from './job-catalog.js';

// Projects: Project, ProjectTask, ProjectWorker, TimeRecord
export {
  ProjectSchema,
  type Project,
  CreateProjectInputSchema,
  type CreateProjectInput,
  UpdateProjectInputSchema,
  type UpdateProjectInput,
  ProjectTaskSchema,
  type ProjectTask,
  CreateProjectTaskInputSchema,
  type CreateProjectTaskInput,
  UpdateProjectTaskInputSchema,
  type UpdateProjectTaskInput,
  ProjectWorkerSchema,
  type ProjectWorker,
  AssignProjectWorkerInputSchema,
  type AssignProjectWorkerInput,
  TimeRecordSchema,
  type TimeRecord,
  CreateTimeRecordInputSchema,
  type CreateTimeRecordInput,
  UpdateTimeRecordInputSchema,
  type UpdateTimeRecordInput,
} from './projects.js';

// Training: Training, TrainingSession, TrainingMembership
export {
  TrainingSchema,
  type Training,
  CreateTrainingInputSchema,
  type CreateTrainingInput,
  UpdateTrainingInputSchema,
  type UpdateTrainingInput,
  TrainingSessionSchema,
  type TrainingSession,
  CreateTrainingSessionInputSchema,
  type CreateTrainingSessionInput,
  UpdateTrainingSessionInputSchema,
  type UpdateTrainingSessionInput,
  TrainingMembershipSchema,
  type TrainingMembership,
  EnrollTrainingInputSchema,
  type EnrollTrainingInput,
} from './training.js';

// Work Areas
export {
  WorkAreaSchema,
  type WorkArea,
  CreateWorkAreaInputSchema,
  type CreateWorkAreaInput,
  UpdateWorkAreaInputSchema,
  type UpdateWorkAreaInput,
} from './work-areas.js';

// ATS: JobPosting, Candidate, Application, HiringStage
export {
  JobPostingSchema,
  type JobPosting,
  CreateJobPostingInputSchema,
  type CreateJobPostingInput,
  UpdateJobPostingInputSchema,
  type UpdateJobPostingInput,
  CandidateSchema,
  type Candidate,
  CreateCandidateInputSchema,
  type CreateCandidateInput,
  UpdateCandidateInputSchema,
  type UpdateCandidateInput,
  ApplicationSchema,
  type Application,
  CreateApplicationInputSchema,
  type CreateApplicationInput,
  UpdateApplicationInputSchema,
  type UpdateApplicationInput,
  HiringStageSchema,
  type HiringStage,
} from './ats.js';

// Payroll: PayrollSupplement, TaxIdentifier, FamilySituation
export {
  PayrollSupplementSchema,
  type PayrollSupplement,
  TaxIdentifierSchema,
  type TaxIdentifier,
  FamilySituationSchema,
  type FamilySituation,
} from './payroll.js';
