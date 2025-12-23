import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock environment
vi.stubEnv('FACTORIAL_API_KEY', 'test-api-key');

// Import after mocking
const {
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
  createTraining,
  updateTraining,
  deleteTraining,
  createTrainingSession,
  updateTrainingSession,
  deleteTrainingSession,
  enrollInTraining,
  unenrollFromTraining,
  createWorkArea,
  updateWorkArea,
  archiveWorkArea,
  unarchiveWorkArea,
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
  clearCache,
} = await import('../../api.js');

describe('ATS and Project Write Operations', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    clearCache();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Project Write Operations', () => {
    it('should create a project', async () => {
      const project = { id: 1, name: 'New Project', description: 'Description', company_id: 1 };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ data: project }),
      });

      const result = await createProject({ name: 'New Project', description: 'Description' });

      expect(mockFetch).toHaveBeenCalledOnce();
      expect(result.name).toBe('New Project');
    });

    it('should update a project', async () => {
      const project = { id: 1, name: 'Updated Project', description: 'Updated', company_id: 1 };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: project }),
      });

      const result = await updateProject(1, { name: 'Updated Project' });

      expect(result.name).toBe('Updated Project');
    });

    it('should delete a project', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      });

      await deleteProject(1);

      expect(mockFetch).toHaveBeenCalledOnce();
    });

    it('should create a project task', async () => {
      const task = { id: 1, project_id: 1, title: 'New Task', description: 'Task desc' };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ data: task }),
      });

      const result = await createProjectTask({
        project_id: 1,
        title: 'New Task',
        description: 'Task desc',
      });

      expect(result.title).toBe('New Task');
    });

    it('should update a project task', async () => {
      const task = { id: 1, project_id: 1, title: 'Updated Task', description: 'Updated' };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: task }),
      });

      const result = await updateProjectTask(1, { title: 'Updated Task' });

      expect(result.title).toBe('Updated Task');
    });

    it('should delete a project task', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      });

      await deleteProjectTask(1);

      expect(mockFetch).toHaveBeenCalledOnce();
    });

    it('should assign a project worker', async () => {
      const worker = { id: 1, project_id: 1, employee_id: 1 };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ data: worker }),
      });

      const result = await assignProjectWorker({ project_id: 1, employee_id: 1 });

      expect(result.employee_id).toBe(1);
    });

    it('should remove a project worker', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      });

      await removeProjectWorker(1);

      expect(mockFetch).toHaveBeenCalledOnce();
    });

    it('should create a time record', async () => {
      const record = {
        id: 1,
        project_worker_id: 1,
        hours: 8,
        date: '2025-01-15',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ data: record }),
      });

      const result = await createTimeRecord({
        project_worker_id: 1,
        hours: 8,
        date: '2025-01-15',
      });

      expect(result.hours).toBe(8);
    });

    it('should update a time record', async () => {
      const record = {
        id: 1,
        project_worker_id: 1,
        hours: 10,
        date: '2025-01-15',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: record }),
      });

      const result = await updateTimeRecord(1, { hours: 10 });

      expect(result.hours).toBe(10);
    });

    it('should delete a time record', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      });

      await deleteTimeRecord(1);

      expect(mockFetch).toHaveBeenCalledOnce();
    });
  });

  describe('Training Write Operations', () => {
    it('should create a training', async () => {
      const training = { id: 1, name: 'New Training', description: 'Training desc', company_id: 1 };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ data: training }),
      });

      const result = await createTraining({ name: 'New Training', description: 'Training desc' });

      expect(result.name).toBe('New Training');
    });

    it('should update a training', async () => {
      const training = { id: 1, name: 'Updated Training', description: 'Updated', company_id: 1 };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: training }),
      });

      const result = await updateTraining(1, { name: 'Updated Training' });

      expect(result.name).toBe('Updated Training');
    });

    it('should delete a training', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      });

      await deleteTraining(1);

      expect(mockFetch).toHaveBeenCalledOnce();
    });

    it('should create a training session', async () => {
      const session = { id: 1, training_id: 1, start_date: '2025-02-01', end_date: '2025-02-05' };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ data: session }),
      });

      const result = await createTrainingSession({
        training_id: 1,
        start_date: '2025-02-01',
        end_date: '2025-02-05',
      });

      expect(result.training_id).toBe(1);
    });

    it('should update a training session', async () => {
      const session = { id: 1, training_id: 1, start_date: '2025-02-01', end_date: '2025-02-10' };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: session }),
      });

      const result = await updateTrainingSession(1, { end_date: '2025-02-10' });

      expect(result.end_date).toBe('2025-02-10');
    });

    it('should delete a training session', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      });

      await deleteTrainingSession(1);

      expect(mockFetch).toHaveBeenCalledOnce();
    });

    it('should enroll in training', async () => {
      const enrollment = { id: 1, training_id: 1, employee_id: 1, status: 'enrolled' };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ data: enrollment }),
      });

      const result = await enrollInTraining({ training_id: 1, employee_id: 1 });

      expect(result.status).toBe('enrolled');
    });

    it('should unenroll from training', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      });

      await unenrollFromTraining(1);

      expect(mockFetch).toHaveBeenCalledOnce();
    });
  });

  describe('Work Area Write Operations', () => {
    it('should create a work area', async () => {
      const workArea = { id: 1, name: 'New Area', location_id: 1, company_id: 1 };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ data: workArea }),
      });

      const result = await createWorkArea({ name: 'New Area', location_id: 1 });

      expect(result.name).toBe('New Area');
    });

    it('should update a work area', async () => {
      const workArea = { id: 1, name: 'Updated Area', location_id: 1, company_id: 1 };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: workArea }),
      });

      const result = await updateWorkArea(1, { name: 'Updated Area' });

      expect(result.name).toBe('Updated Area');
    });

    it('should archive a work area', async () => {
      const workArea = { id: 1, name: 'Area', location_id: 1, company_id: 1, archived: true };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: workArea }),
      });

      const result = await archiveWorkArea(1);

      expect(result.id).toBe(1);
    });

    it('should unarchive a work area', async () => {
      const workArea = { id: 1, name: 'Area', location_id: 1, company_id: 1, archived: false };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: workArea }),
      });

      const result = await unarchiveWorkArea(1);

      expect(result.id).toBe(1);
    });
  });

  describe('ATS Write Operations', () => {
    it('should create a job posting', async () => {
      const posting = { id: 1, title: 'Software Engineer', status: 'open', company_id: 1 };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ data: posting }),
      });

      const result = await createJobPosting({ title: 'Software Engineer', status: 'open' });

      expect(result.title).toBe('Software Engineer');
    });

    it('should update a job posting', async () => {
      const posting = { id: 1, title: 'Senior Software Engineer', status: 'open', company_id: 1 };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: posting }),
      });

      const result = await updateJobPosting(1, { title: 'Senior Software Engineer' });

      expect(result.title).toBe('Senior Software Engineer');
    });

    it('should delete a job posting', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      });

      await deleteJobPosting(1);

      expect(mockFetch).toHaveBeenCalledOnce();
    });

    it('should create a candidate', async () => {
      const candidate = {
        id: 1,
        first_name: 'Alice',
        last_name: 'Smith',
        email: 'alice@example.com',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ data: candidate }),
      });

      const result = await createCandidate({
        first_name: 'Alice',
        last_name: 'Smith',
        email: 'alice@example.com',
      });

      expect(result.first_name).toBe('Alice');
    });

    it('should update a candidate', async () => {
      const candidate = {
        id: 1,
        first_name: 'Alice',
        last_name: 'Johnson',
        email: 'alice@example.com',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: candidate }),
      });

      const result = await updateCandidate(1, { last_name: 'Johnson' });

      expect(result.last_name).toBe('Johnson');
    });

    it('should delete a candidate', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      });

      await deleteCandidate(1);

      expect(mockFetch).toHaveBeenCalledOnce();
    });

    it('should create an application', async () => {
      const application = { id: 1, job_posting_id: 1, candidate_id: 1, status: 'pending' };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ data: application }),
      });

      const result = await createApplication({ job_posting_id: 1, candidate_id: 1 });

      expect(result.status).toBe('pending');
    });

    it('should update an application', async () => {
      const application = { id: 1, job_posting_id: 1, candidate_id: 1, status: 'reviewed' };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: application }),
      });

      const result = await updateApplication(1, { status: 'reviewed' });

      expect(result.status).toBe('reviewed');
    });

    it('should delete an application', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      });

      await deleteApplication(1);

      expect(mockFetch).toHaveBeenCalledOnce();
    });

    it('should advance an application', async () => {
      const application = { id: 1, job_posting_id: 1, candidate_id: 1, status: 'interview' };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: application }),
      });

      const result = await advanceApplication(1);

      expect(result.status).toBe('interview');
    });
  });
});
