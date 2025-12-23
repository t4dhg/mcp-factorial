import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock environment
vi.stubEnv('FACTORIAL_API_KEY', 'test-api-key');

// Import after mocking
const {
  getEmployee,
  getTeam,
  getLocation,
  getProject,
  getLeave,
  getShift,
  getTraining,
  getWorkArea,
  getJobPosting,
  getCandidate,
  updateEmployee,
  deleteTeam,
  deleteLocation,
  terminateEmployee,
  listEmployees,
  listProjects,
  clearCache,
} = await import('../../api.js');

describe('API Error Handling and Edge Cases', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    clearCache();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Invalid ID validation', () => {
    it('should throw error for invalid employee ID', async () => {
      await expect(getEmployee(0)).rejects.toThrow('Invalid employee ID');
      await expect(getEmployee(-1)).rejects.toThrow('Invalid employee ID');
    });

    it('should throw error for invalid team ID', async () => {
      await expect(getTeam(0)).rejects.toThrow('Invalid team ID');
      await expect(getTeam(-1)).rejects.toThrow('Invalid team ID');
    });

    it('should throw error for invalid location ID', async () => {
      await expect(getLocation(0)).rejects.toThrow('Invalid location ID');
      await expect(getLocation(-1)).rejects.toThrow('Invalid location ID');
    });

    it('should throw error for invalid project ID', async () => {
      await expect(getProject(0)).rejects.toThrow('Invalid project ID');
      await expect(getProject(-1)).rejects.toThrow('Invalid project ID');
    });

    it('should throw error for invalid leave ID', async () => {
      await expect(getLeave(0)).rejects.toThrow('Invalid leave ID');
      await expect(getLeave(-1)).rejects.toThrow('Invalid leave ID');
    });

    it('should throw error for invalid shift ID', async () => {
      await expect(getShift(0)).rejects.toThrow('Invalid shift ID');
      await expect(getShift(-1)).rejects.toThrow('Invalid shift ID');
    });

    it('should throw error for invalid training ID', async () => {
      await expect(getTraining(0)).rejects.toThrow('Invalid training ID');
      await expect(getTraining(-1)).rejects.toThrow('Invalid training ID');
    });

    it('should throw error for invalid work area ID', async () => {
      await expect(getWorkArea(0)).rejects.toThrow('Invalid work area ID');
      await expect(getWorkArea(-1)).rejects.toThrow('Invalid work area ID');
    });

    it('should throw error for invalid job posting ID', async () => {
      await expect(getJobPosting(0)).rejects.toThrow('Invalid job posting ID');
      await expect(getJobPosting(-1)).rejects.toThrow('Invalid job posting ID');
    });

    it('should throw error for invalid candidate ID', async () => {
      await expect(getCandidate(0)).rejects.toThrow('Invalid candidate ID');
      await expect(getCandidate(-1)).rejects.toThrow('Invalid candidate ID');
    });
  });

  describe('Update and delete operations with invalid IDs', () => {
    it('should throw error for invalid ID in updateEmployee', async () => {
      await expect(updateEmployee(0, { role: 'Manager' })).rejects.toThrow('Invalid employee ID');
    });

    it('should throw error for invalid ID in deleteTeam', async () => {
      await expect(deleteTeam(0)).rejects.toThrow('Invalid team ID');
    });

    it('should throw error for invalid ID in deleteLocation', async () => {
      await expect(deleteLocation(0)).rejects.toThrow('Invalid location ID');
    });

    it('should throw error for invalid ID in terminateEmployee', async () => {
      await expect(terminateEmployee(0, '2025-01-31', 'Resigned')).rejects.toThrow(
        'Invalid employee ID'
      );
    });
  });

  describe('List operations with filters', () => {
    it('should filter employees by team ID', async () => {
      const employees = [
        {
          id: 1,
          first_name: 'John',
          last_name: 'Doe',
          email: 'john@example.com',
          full_name: 'John Doe',
          team_ids: [1],
          hired_on: null,
          birthday_on: null,
          start_date: null,
          terminated_on: null,
          gender: null,
          nationality: null,
          manager_id: null,
          role: null,
          timeoff_manager_id: null,
          company_id: 1,
          legal_entity_id: null,
          location_id: null,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
        {
          id: 2,
          first_name: 'Jane',
          last_name: 'Smith',
          email: 'jane@example.com',
          full_name: 'Jane Smith',
          team_ids: [2],
          hired_on: null,
          birthday_on: null,
          start_date: null,
          terminated_on: null,
          gender: null,
          nationality: null,
          manager_id: null,
          role: null,
          timeoff_manager_id: null,
          company_id: 1,
          legal_entity_id: null,
          location_id: null,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: employees }),
      });

      const result = await listEmployees({ team_id: 1 });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe(1);
    });

    it('should filter employees by location ID', async () => {
      const employees = [
        {
          id: 1,
          first_name: 'John',
          last_name: 'Doe',
          email: 'john@example.com',
          full_name: 'John Doe',
          team_ids: [],
          location_id: 1,
          hired_on: null,
          birthday_on: null,
          start_date: null,
          terminated_on: null,
          gender: null,
          nationality: null,
          manager_id: null,
          role: null,
          timeoff_manager_id: null,
          company_id: 1,
          legal_entity_id: null,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
        {
          id: 2,
          first_name: 'Jane',
          last_name: 'Smith',
          email: 'jane@example.com',
          full_name: 'Jane Smith',
          team_ids: [],
          location_id: 2,
          hired_on: null,
          birthday_on: null,
          start_date: null,
          terminated_on: null,
          gender: null,
          nationality: null,
          manager_id: null,
          role: null,
          timeoff_manager_id: null,
          company_id: 1,
          legal_entity_id: null,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: employees }),
      });

      const result = await listEmployees({ location_id: 1 });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe(1);
    });

    it('should handle pagination with custom page and limit', async () => {
      const projects = Array.from({ length: 50 }, (_, i) => ({
        id: i + 1,
        name: `Project ${i + 1}`,
        description: `Description ${i + 1}`,
        company_id: 1,
      }));

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: projects }),
      });

      const result = await listProjects({ page: 2, limit: 10 });

      expect(result.data).toHaveLength(10);
      expect(result.data[0].id).toBe(11); // Second page, items 11-20
      expect(result.meta.page).toBe(2);
      expect(result.meta.limit).toBe(10);
    });
  });
});
