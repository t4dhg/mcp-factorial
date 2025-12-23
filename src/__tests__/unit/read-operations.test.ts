import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock environment
vi.stubEnv('FACTORIAL_API_KEY', 'test-api-key');

// Import after mocking
const {
  listProjects,
  getProject,
  listProjectTasks,
  getProjectTask,
  listProjectWorkers,
  getProjectWorker,
  listTimeRecords,
  getTimeRecord,
  listTrainings,
  getTraining,
  listTrainingSessions,
  getTrainingSession,
  listTrainingEnrollments,
  getTrainingEnrollment,
  listWorkAreas,
  getWorkArea,
  listJobPostings,
  getJobPosting,
  listCandidates,
  getCandidate,
  listApplications,
  getApplication,
  listHiringStages,
  getHiringStage,
  listPayrollSupplements,
  getPayrollSupplement,
  listTaxIdentifiers,
  getTaxIdentifier,
  listFamilySituations,
  getFamilySituation,
  clearCache,
} = await import('../../api.js');

describe('Read Operations', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    clearCache();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Project Read Operations', () => {
    it('should list projects', async () => {
      const projects = [
        { id: 1, name: 'Project A', description: 'Description A', company_id: 1 },
        { id: 2, name: 'Project B', description: 'Description B', company_id: 1 },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: projects }),
      });

      const result = await listProjects();

      expect(mockFetch).toHaveBeenCalledOnce();
      expect(result.data).toHaveLength(2);
      expect(result.data[0].name).toBe('Project A');
    });

    it('should get a specific project', async () => {
      const project = {
        id: 1,
        name: 'Project A',
        description: 'Description A',
        company_id: 1,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: project }),
      });

      const result = await getProject(1);

      expect(mockFetch).toHaveBeenCalledOnce();
      expect(result.id).toBe(1);
      expect(result.name).toBe('Project A');
    });

    it('should list project tasks', async () => {
      const tasks = [
        { id: 1, project_id: 1, title: 'Task 1', description: 'Desc 1' },
        { id: 2, project_id: 1, title: 'Task 2', description: 'Desc 2' },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: tasks }),
      });

      const result = await listProjectTasks(1);

      expect(mockFetch).toHaveBeenCalledOnce();
      expect(result.data).toHaveLength(2);
    });

    it('should get a specific project task', async () => {
      const task = { id: 1, project_id: 1, title: 'Task 1', description: 'Desc 1' };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: task }),
      });

      const result = await getProjectTask(1);

      expect(result.id).toBe(1);
      expect(result.title).toBe('Task 1');
    });

    it('should list project workers', async () => {
      const workers = [
        { id: 1, project_id: 1, employee_id: 1 },
        { id: 2, project_id: 1, employee_id: 2 },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: workers }),
      });

      const result = await listProjectWorkers(1);

      expect(result.data).toHaveLength(2);
    });

    it('should get a specific project worker', async () => {
      const worker = { id: 1, project_id: 1, employee_id: 1 };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: worker }),
      });

      const result = await getProjectWorker(1);

      expect(result.id).toBe(1);
    });

    it('should list time records', async () => {
      const records = [
        { id: 1, project_worker_id: 1, hours: 8, date: '2025-01-15' },
        { id: 2, project_worker_id: 1, hours: 6, date: '2025-01-16' },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: records }),
      });

      const result = await listTimeRecords(1);

      expect(result.data).toHaveLength(2);
    });

    it('should get a specific time record', async () => {
      const record = { id: 1, project_worker_id: 1, hours: 8, date: '2025-01-15' };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: record }),
      });

      const result = await getTimeRecord(1);

      expect(result.id).toBe(1);
      expect(result.hours).toBe(8);
    });
  });

  describe('Training Read Operations', () => {
    it('should list trainings', async () => {
      const trainings = [
        { id: 1, name: 'Leadership', description: 'Leadership training', company_id: 1 },
        { id: 2, name: 'Tech Skills', description: 'Technical training', company_id: 1 },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: trainings }),
      });

      const result = await listTrainings();

      expect(result.data).toHaveLength(2);
      expect(result.data[0].name).toBe('Leadership');
    });

    it('should get a specific training', async () => {
      const training = {
        id: 1,
        name: 'Leadership',
        description: 'Leadership training',
        company_id: 1,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: training }),
      });

      const result = await getTraining(1);

      expect(result.id).toBe(1);
      expect(result.name).toBe('Leadership');
    });

    it('should list training sessions', async () => {
      const sessions = [
        { id: 1, training_id: 1, start_date: '2025-02-01', end_date: '2025-02-05' },
        { id: 2, training_id: 1, start_date: '2025-03-01', end_date: '2025-03-05' },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: sessions }),
      });

      const result = await listTrainingSessions(1);

      expect(result.data).toHaveLength(2);
    });

    it('should get a specific training session', async () => {
      const session = { id: 1, training_id: 1, start_date: '2025-02-01', end_date: '2025-02-05' };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: session }),
      });

      const result = await getTrainingSession(1);

      expect(result.id).toBe(1);
    });

    it('should list training enrollments', async () => {
      const enrollments = [
        { id: 1, training_id: 1, employee_id: 1, status: 'enrolled' },
        { id: 2, training_id: 1, employee_id: 2, status: 'enrolled' },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: enrollments }),
      });

      const result = await listTrainingEnrollments(1);

      expect(result.data).toHaveLength(2);
    });

    it('should get a specific training enrollment', async () => {
      const enrollment = { id: 1, training_id: 1, employee_id: 1, status: 'enrolled' };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: enrollment }),
      });

      const result = await getTrainingEnrollment(1);

      expect(result.id).toBe(1);
    });
  });

  describe('Work Area Read Operations', () => {
    it('should list work areas', async () => {
      const workAreas = [
        { id: 1, name: 'Engineering Floor', location_id: 1, company_id: 1 },
        { id: 2, name: 'Sales Floor', location_id: 1, company_id: 1 },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: workAreas }),
      });

      const result = await listWorkAreas(1);

      expect(result.data).toHaveLength(2);
      expect(result.data[0].name).toBe('Engineering Floor');
    });

    it('should get a specific work area', async () => {
      const workArea = { id: 1, name: 'Engineering Floor', location_id: 1, company_id: 1 };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: workArea }),
      });

      const result = await getWorkArea(1);

      expect(result.id).toBe(1);
      expect(result.name).toBe('Engineering Floor');
    });
  });

  describe('ATS/Recruiting Read Operations', () => {
    it('should list job postings', async () => {
      const jobPostings = [
        { id: 1, title: 'Software Engineer', status: 'open', company_id: 1 },
        { id: 2, title: 'Product Manager', status: 'open', company_id: 1 },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: jobPostings }),
      });

      const result = await listJobPostings();

      expect(result.data).toHaveLength(2);
      expect(result.data[0].title).toBe('Software Engineer');
    });

    it('should get a specific job posting', async () => {
      const jobPosting = { id: 1, title: 'Software Engineer', status: 'open', company_id: 1 };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: jobPosting }),
      });

      const result = await getJobPosting(1);

      expect(result.id).toBe(1);
      expect(result.title).toBe('Software Engineer');
    });

    it('should list candidates', async () => {
      const candidates = [
        { id: 1, first_name: 'Alice', last_name: 'Smith', email: 'alice@example.com' },
        { id: 2, first_name: 'Bob', last_name: 'Jones', email: 'bob@example.com' },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: candidates }),
      });

      const result = await listCandidates();

      expect(result.data).toHaveLength(2);
      expect(result.data[0].first_name).toBe('Alice');
    });

    it('should get a specific candidate', async () => {
      const candidate = {
        id: 1,
        first_name: 'Alice',
        last_name: 'Smith',
        email: 'alice@example.com',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: candidate }),
      });

      const result = await getCandidate(1);

      expect(result.id).toBe(1);
      expect(result.first_name).toBe('Alice');
    });

    it('should list applications', async () => {
      const applications = [
        { id: 1, job_posting_id: 1, candidate_id: 1, status: 'pending' },
        { id: 2, job_posting_id: 1, candidate_id: 2, status: 'pending' },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: applications }),
      });

      const result = await listApplications(1);

      expect(result.data).toHaveLength(2);
    });

    it('should get a specific application', async () => {
      const application = { id: 1, job_posting_id: 1, candidate_id: 1, status: 'pending' };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: application }),
      });

      const result = await getApplication(1);

      expect(result.id).toBe(1);
    });

    it('should list hiring stages', async () => {
      const stages = [
        { id: 1, name: 'Phone Screen', order: 1 },
        { id: 2, name: 'Technical Interview', order: 2 },
        { id: 3, name: 'Offer', order: 3 },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: stages }),
      });

      const result = await listHiringStages();

      expect(result).toHaveLength(3);
      expect(result[0].name).toBe('Phone Screen');
    });

    it('should get a specific hiring stage', async () => {
      const stage = { id: 1, name: 'Phone Screen', order: 1 };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: stage }),
      });

      const result = await getHiringStage(1);

      expect(result.id).toBe(1);
      expect(result.name).toBe('Phone Screen');
    });
  });

  describe('Payroll Read Operations', () => {
    it('should list payroll supplements', async () => {
      const supplements = [
        { id: 1, employee_id: 1, type: 'bonus', amount: 1000, currency: 'USD' },
        { id: 2, employee_id: 2, type: 'commission', amount: 500, currency: 'USD' },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: supplements }),
      });

      const result = await listPayrollSupplements();

      expect(result.data).toHaveLength(2);
      expect(result.data[0].type).toBe('bonus');
    });

    it('should get a specific payroll supplement', async () => {
      const supplement = { id: 1, employee_id: 1, type: 'bonus', amount: 1000, currency: 'USD' };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: supplement }),
      });

      const result = await getPayrollSupplement(1);

      expect(result.id).toBe(1);
      expect(result.type).toBe('bonus');
    });

    it('should list tax identifiers', async () => {
      const identifiers = [
        { id: 1, employee_id: 1, type: 'SSN', value: '123-45-6789' },
        { id: 2, employee_id: 2, type: 'EIN', value: '98-7654321' },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: identifiers }),
      });

      const result = await listTaxIdentifiers();

      expect(result.data).toHaveLength(2);
      expect(result.data[0].type).toBe('SSN');
    });

    it('should get a specific tax identifier', async () => {
      const identifier = { id: 1, employee_id: 1, type: 'SSN', value: '123-45-6789' };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: identifier }),
      });

      const result = await getTaxIdentifier(1);

      expect(result.id).toBe(1);
      expect(result.type).toBe('SSN');
    });

    it('should list family situations', async () => {
      const situations = [
        { id: 1, employee_id: 1, marital_status: 'married', dependents: 2 },
        { id: 2, employee_id: 2, marital_status: 'single', dependents: 0 },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: situations }),
      });

      const result = await listFamilySituations();

      expect(result.data).toHaveLength(2);
      expect(result.data[0].marital_status).toBe('married');
    });

    it('should get a specific family situation', async () => {
      const situation = { id: 1, employee_id: 1, marital_status: 'married', dependents: 2 };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: situation }),
      });

      const result = await getFamilySituation(1);

      expect(result.id).toBe(1);
      expect(result.marital_status).toBe('married');
    });
  });
});
