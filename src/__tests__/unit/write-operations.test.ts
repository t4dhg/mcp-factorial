import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock environment
vi.stubEnv('FACTORIAL_API_KEY', 'test-api-key');

// Import after mocking
const {
  createEmployee,
  updateEmployee,
  terminateEmployee,
  createTeam,
  updateTeam,
  deleteTeam,
  createLocation,
  updateLocation,
  deleteLocation,
  createLeave,
  updateLeave,
  cancelLeave,
  approveLeave,
  rejectLeave,
  createShift,
  updateShift,
  deleteShift,
  clearCache,
} = await import('../../api.js');

describe('Write Operations', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    clearCache();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Employee Write Operations', () => {
    it('should create a new employee', async () => {
      const newEmployee = {
        id: 4,
        first_name: 'Alice',
        last_name: 'Johnson',
        email: 'alice@example.com',
        full_name: 'Alice Johnson',
        birthday_on: null,
        hired_on: '2025-01-15',
        start_date: '2025-01-15',
        terminated_on: null,
        gender: null,
        nationality: null,
        manager_id: null,
        role: 'Developer',
        timeoff_manager_id: null,
        company_id: 1,
        legal_entity_id: null,
        team_ids: [],
        location_id: 1,
        created_at: '2025-01-15T00:00:00Z',
        updated_at: '2025-01-15T00:00:00Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ data: newEmployee }),
      });

      const result = await createEmployee({
        first_name: 'Alice',
        last_name: 'Johnson',
        email: 'alice@example.com',
        hired_on: '2025-01-15',
        role: 'Developer',
        location_id: 1,
      });

      expect(mockFetch).toHaveBeenCalledOnce();
      expect(result.id).toBe(4);
      expect(result.email).toBe('alice@example.com');
    });

    it('should update an employee', async () => {
      const updatedEmployee = {
        id: 1,
        first_name: 'John',
        last_name: 'Doe',
        email: 'john.doe@example.com',
        full_name: 'John Doe',
        role: 'Senior Developer',
        birthday_on: null,
        hired_on: null,
        start_date: null,
        terminated_on: null,
        gender: null,
        nationality: null,
        manager_id: null,
        timeoff_manager_id: null,
        company_id: 1,
        legal_entity_id: null,
        team_ids: [1],
        location_id: 1,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2025-01-15T00:00:00Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: updatedEmployee }),
      });

      const result = await updateEmployee(1, { role: 'Senior Developer' });

      expect(mockFetch).toHaveBeenCalledOnce();
      expect(result.role).toBe('Senior Developer');
    });

    it('should terminate an employee', async () => {
      const terminatedEmployee = {
        id: 1,
        first_name: 'John',
        last_name: 'Doe',
        email: 'john.doe@example.com',
        full_name: 'John Doe',
        terminated_on: '2025-01-31',
        birthday_on: null,
        hired_on: null,
        start_date: null,
        gender: null,
        nationality: null,
        manager_id: null,
        role: null,
        timeoff_manager_id: null,
        company_id: 1,
        legal_entity_id: null,
        team_ids: [],
        location_id: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2025-01-15T00:00:00Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: terminatedEmployee }),
      });

      const result = await terminateEmployee(1, '2025-01-31', 'Resigned');

      expect(mockFetch).toHaveBeenCalledOnce();
      expect(result.terminated_on).toBe('2025-01-31');
    });
  });

  describe('Team Write Operations', () => {
    it('should create a new team', async () => {
      const newTeam = {
        id: 3,
        name: 'DevOps',
        description: 'DevOps team',
        company_id: 1,
        employee_ids: [],
        lead_ids: [],
        created_at: '2025-01-15T00:00:00Z',
        updated_at: '2025-01-15T00:00:00Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ data: newTeam }),
      });

      const result = await createTeam({
        name: 'DevOps',
        description: 'DevOps team',
      });

      expect(mockFetch).toHaveBeenCalledOnce();
      expect(result.name).toBe('DevOps');
    });

    it('should update a team', async () => {
      const updatedTeam = {
        id: 1,
        name: 'Engineering - Updated',
        description: 'Engineering team updated',
        company_id: 1,
        employee_ids: [1, 2],
        lead_ids: [1],
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2025-01-15T00:00:00Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: updatedTeam }),
      });

      const result = await updateTeam(1, { name: 'Engineering - Updated' });

      expect(mockFetch).toHaveBeenCalledOnce();
      expect(result.name).toBe('Engineering - Updated');
    });

    it('should delete a team', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      });

      await deleteTeam(1);

      expect(mockFetch).toHaveBeenCalledOnce();
    });
  });

  describe('Location Write Operations', () => {
    it('should create a new location', async () => {
      const newLocation = {
        id: 3,
        name: 'Berlin Office',
        country: 'Germany',
        city: 'Berlin',
        phone_number: null,
        state: null,
        address_line_1: null,
        address_line_2: null,
        postal_code: null,
        company_id: 1,
        created_at: '2025-01-15T00:00:00Z',
        updated_at: '2025-01-15T00:00:00Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ data: newLocation }),
      });

      const result = await createLocation({
        name: 'Berlin Office',
        country: 'Germany',
        city: 'Berlin',
      });

      expect(mockFetch).toHaveBeenCalledOnce();
      expect(result.name).toBe('Berlin Office');
    });

    it('should update a location', async () => {
      const updatedLocation = {
        id: 1,
        name: 'San Francisco HQ - Updated',
        country: 'USA',
        city: 'San Francisco',
        phone_number: null,
        state: 'CA',
        address_line_1: null,
        address_line_2: null,
        postal_code: null,
        company_id: 1,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2025-01-15T00:00:00Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: updatedLocation }),
      });

      const result = await updateLocation(1, { name: 'San Francisco HQ - Updated' });

      expect(mockFetch).toHaveBeenCalledOnce();
      expect(result.name).toBe('San Francisco HQ - Updated');
    });

    it('should delete a location', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      });

      await deleteLocation(1);

      expect(mockFetch).toHaveBeenCalledOnce();
    });
  });

  describe('Leave Write Operations', () => {
    it('should create a leave request', async () => {
      const newLeave = {
        id: 4,
        employee_id: 1,
        leave_type_id: 1,
        start_on: '2025-02-01',
        finish_on: '2025-02-05',
        half_day: 'all_day' as const,
        status: 'pending' as const,
        description: 'Vacation',
        deleted_at: null,
        duration_attributes: { days: 5, hours: 40 },
        created_at: '2025-01-15T00:00:00Z',
        updated_at: '2025-01-15T00:00:00Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ data: newLeave }),
      });

      const result = await createLeave({
        employee_id: 1,
        leave_type_id: 1,
        start_on: '2025-02-01',
        finish_on: '2025-02-05',
        description: 'Vacation',
      });

      expect(mockFetch).toHaveBeenCalledOnce();
      expect(result.status).toBe('pending');
    });

    it('should update a leave request', async () => {
      const updatedLeave = {
        id: 1,
        employee_id: 1,
        leave_type_id: 1,
        start_on: '2025-02-01',
        finish_on: '2025-02-07',
        half_day: 'all_day' as const,
        status: 'pending' as const,
        description: 'Extended vacation',
        deleted_at: null,
        duration_attributes: { days: 7, hours: 56 },
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-15T00:00:00Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: updatedLeave }),
      });

      const result = await updateLeave(1, { finish_on: '2025-02-07' });

      expect(mockFetch).toHaveBeenCalledOnce();
      expect(result.finish_on).toBe('2025-02-07');
    });

    it('should cancel a leave request', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      });

      await cancelLeave(1);

      expect(mockFetch).toHaveBeenCalledOnce();
    });

    it('should approve a leave request', async () => {
      const approvedLeave = {
        id: 1,
        employee_id: 1,
        leave_type_id: 1,
        start_on: '2025-02-01',
        finish_on: '2025-02-05',
        half_day: 'all_day' as const,
        status: 'approved' as const,
        description: null,
        deleted_at: null,
        duration_attributes: { days: 5, hours: 40 },
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-15T00:00:00Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: approvedLeave }),
      });

      const result = await approveLeave(1);

      expect(mockFetch).toHaveBeenCalledOnce();
      expect(result.status).toBe('approved');
    });

    it('should reject a leave request', async () => {
      const rejectedLeave = {
        id: 1,
        employee_id: 1,
        leave_type_id: 1,
        start_on: '2025-02-01',
        finish_on: '2025-02-05',
        half_day: 'all_day' as const,
        status: 'declined' as const,
        description: null,
        deleted_at: null,
        duration_attributes: { days: 5, hours: 40 },
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-15T00:00:00Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: rejectedLeave }),
      });

      const result = await rejectLeave(1);

      expect(mockFetch).toHaveBeenCalledOnce();
      expect(result.status).toBe('declined');
    });
  });

  describe('Shift Write Operations', () => {
    it('should create a shift', async () => {
      const newShift = {
        id: 4,
        employee_id: 1,
        clock_in: '2025-01-15T09:00:00Z',
        clock_out: '2025-01-15T17:00:00Z',
        worked_hours: 8,
        break_minutes: 60,
        location: 'Office',
        notes: null,
        created_at: '2025-01-15T00:00:00Z',
        updated_at: '2025-01-15T00:00:00Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ data: newShift }),
      });

      const result = await createShift({
        employee_id: 1,
        clock_in: '2025-01-15T09:00:00Z',
        clock_out: '2025-01-15T17:00:00Z',
        break_minutes: 60,
        location: 'Office',
      });

      expect(mockFetch).toHaveBeenCalledOnce();
      expect(result.worked_hours).toBe(8);
    });

    it('should update a shift', async () => {
      const updatedShift = {
        id: 1,
        employee_id: 1,
        clock_in: '2025-01-15T09:00:00Z',
        clock_out: '2025-01-15T18:00:00Z',
        worked_hours: 9,
        break_minutes: 60,
        location: 'Office',
        notes: 'Worked late',
        created_at: '2025-01-15T00:00:00Z',
        updated_at: '2025-01-15T12:00:00Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: updatedShift }),
      });

      const result = await updateShift(1, {
        clock_out: '2025-01-15T18:00:00Z',
        notes: 'Worked late',
      });

      expect(mockFetch).toHaveBeenCalledOnce();
      expect(result.notes).toBe('Worked late');
    });

    it('should delete a shift', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      });

      await deleteShift(1);

      expect(mockFetch).toHaveBeenCalledOnce();
    });
  });
});
