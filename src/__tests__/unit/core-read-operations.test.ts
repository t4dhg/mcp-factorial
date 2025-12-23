import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock environment
vi.stubEnv('FACTORIAL_API_KEY', 'test-api-key');

// Import after mocking
const {
  listEmployees,
  getEmployee,
  searchEmployees,
  listTeams,
  getTeam,
  listLocations,
  getLocation,
  listContracts,
  listLeaves,
  getLeave,
  listLeaveTypes,
  getLeaveType,
  listAllowances,
  listShifts,
  getShift,
  listFolders,
  getFolder,
  listDocuments,
  getDocument,
  listJobRoles,
  getJobRole,
  listJobLevels,
  getJobLevel,
  clearCache,
} = await import('../../api.js');

describe('Core Read Operations', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    clearCache();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Employee Read Operations', () => {
    it('should list employees', async () => {
      const employees = [
        {
          id: 1,
          first_name: 'John',
          last_name: 'Doe',
          email: 'john@example.com',
          full_name: 'John Doe',
          hired_on: '2024-01-01',
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
          team_ids: [],
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

      const result = await listEmployees();

      expect(mockFetch).toHaveBeenCalledOnce();
      expect(result.data).toHaveLength(1);
      expect(result.data[0].first_name).toBe('John');
    });

    it('should get a specific employee', async () => {
      const employee = {
        id: 1,
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@example.com',
        full_name: 'John Doe',
        hired_on: '2024-01-01',
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
        team_ids: [],
        location_id: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: employee }),
      });

      const result = await getEmployee(1);

      expect(result.id).toBe(1);
      expect(result.email).toBe('john@example.com');
    });

    it('should search employees', async () => {
      const employees = [
        {
          id: 1,
          first_name: 'John',
          last_name: 'Doe',
          email: 'john@example.com',
          full_name: 'John Doe',
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
          team_ids: [],
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

      const result = await searchEmployees('john');

      expect(result).toHaveLength(1);
      expect(result[0].first_name).toBe('John');
    });
  });

  describe('Team Read Operations', () => {
    it('should list teams', async () => {
      const teams = [
        {
          id: 1,
          name: 'Engineering',
          description: 'Engineering team',
          company_id: 1,
          employee_ids: [1, 2],
          lead_ids: [1],
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: teams }),
      });

      const result = await listTeams();

      expect(result.data).toHaveLength(1);
      expect(result.data[0].name).toBe('Engineering');
    });

    it('should get a specific team', async () => {
      const team = {
        id: 1,
        name: 'Engineering',
        description: 'Engineering team',
        company_id: 1,
        employee_ids: [1, 2],
        lead_ids: [1],
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: team }),
      });

      const result = await getTeam(1);

      expect(result.id).toBe(1);
      expect(result.name).toBe('Engineering');
    });
  });

  describe('Location Read Operations', () => {
    it('should list locations', async () => {
      const locations = [
        {
          id: 1,
          name: 'San Francisco HQ',
          country: 'USA',
          city: 'San Francisco',
          phone_number: null,
          state: 'CA',
          address_line_1: null,
          address_line_2: null,
          postal_code: null,
          company_id: 1,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: locations }),
      });

      const result = await listLocations();

      expect(result.data).toHaveLength(1);
      expect(result.data[0].name).toBe('San Francisco HQ');
    });

    it('should get a specific location', async () => {
      const location = {
        id: 1,
        name: 'San Francisco HQ',
        country: 'USA',
        city: 'San Francisco',
        phone_number: null,
        state: 'CA',
        address_line_1: null,
        address_line_2: null,
        postal_code: null,
        company_id: 1,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: location }),
      });

      const result = await getLocation(1);

      expect(result.id).toBe(1);
      expect(result.name).toBe('San Francisco HQ');
    });
  });

  describe('Contract Read Operations', () => {
    it('should list contracts', async () => {
      const contracts = [
        { id: 1, employee_id: 1, start_date: '2024-01-01', salary: 100000 },
        { id: 2, employee_id: 2, start_date: '2024-02-01', salary: 90000 },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: contracts }),
      });

      const result = await listContracts();

      expect(result.data).toHaveLength(2);
      expect(result.data[0].employee_id).toBe(1);
    });
  });

  describe('Leave Read Operations', () => {
    it('should list leaves', async () => {
      const leaves = [
        {
          id: 1,
          employee_id: 1,
          leave_type_id: 1,
          start_on: '2025-02-01',
          finish_on: '2025-02-05',
          half_day: 'all_day' as const,
          status: 'pending' as const,
          description: null,
          deleted_at: null,
          duration_attributes: { days: 5, hours: 40 },
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: leaves }),
      });

      const result = await listLeaves();

      expect(result.data).toHaveLength(1);
      expect(result.data[0].status).toBe('pending');
    });

    it('should get a specific leave', async () => {
      const leave = {
        id: 1,
        employee_id: 1,
        leave_type_id: 1,
        start_on: '2025-02-01',
        finish_on: '2025-02-05',
        half_day: 'all_day' as const,
        status: 'pending' as const,
        description: null,
        deleted_at: null,
        duration_attributes: { days: 5, hours: 40 },
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: leave }),
      });

      const result = await getLeave(1);

      expect(result.id).toBe(1);
      expect(result.status).toBe('pending');
    });

    it('should list leave types', async () => {
      const leaveTypes = [
        { id: 1, name: 'Vacation', code: 'VAC' },
        { id: 2, name: 'Sick Leave', code: 'SICK' },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: leaveTypes }),
      });

      const result = await listLeaveTypes();

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Vacation');
    });

    it('should get a specific leave type', async () => {
      const leaveType = { id: 1, name: 'Vacation', code: 'VAC' };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: leaveType }),
      });

      const result = await getLeaveType(1);

      expect(result.id).toBe(1);
      expect(result.name).toBe('Vacation');
    });

    it('should list allowances', async () => {
      const allowances = [
        { id: 1, employee_id: 1, leave_type_id: 1, balance: 15 },
        { id: 2, employee_id: 2, leave_type_id: 1, balance: 20 },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: allowances }),
      });

      const result = await listAllowances();

      expect(result.data).toHaveLength(2);
      expect(result.data[0].balance).toBe(15);
    });
  });

  describe('Shift Read Operations', () => {
    it('should list shifts', async () => {
      const shifts = [
        {
          id: 1,
          employee_id: 1,
          clock_in: '2025-01-15T09:00:00Z',
          clock_out: '2025-01-15T17:00:00Z',
          worked_hours: 8,
          break_minutes: 60,
          location: 'Office',
          notes: null,
          created_at: '2025-01-15T00:00:00Z',
          updated_at: '2025-01-15T00:00:00Z',
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: shifts }),
      });

      const result = await listShifts();

      expect(result.data).toHaveLength(1);
      expect(result.data[0].worked_hours).toBe(8);
    });

    it('should get a specific shift', async () => {
      const shift = {
        id: 1,
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
        status: 200,
        json: async () => ({ data: shift }),
      });

      const result = await getShift(1);

      expect(result.id).toBe(1);
      expect(result.worked_hours).toBe(8);
    });
  });

  describe('Document Read Operations', () => {
    it('should list folders', async () => {
      const folders = [
        { id: 1, name: 'HR Documents', parent_id: null },
        { id: 2, name: 'Contracts', parent_id: 1 },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: folders }),
      });

      const result = await listFolders();

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('HR Documents');
    });

    it('should get a specific folder', async () => {
      const folder = { id: 1, name: 'HR Documents', parent_id: null };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: folder }),
      });

      const result = await getFolder(1);

      expect(result.id).toBe(1);
      expect(result.name).toBe('HR Documents');
    });

    it('should list documents', async () => {
      const documents = [
        { id: 1, folder_id: 1, name: 'Contract.pdf', size: 12345 },
        { id: 2, folder_id: 1, name: 'Policy.pdf', size: 67890 },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: documents }),
      });

      const result = await listDocuments();

      expect(result.data).toHaveLength(2);
      expect(result.data[0].name).toBe('Contract.pdf');
    });

    it('should get a specific document', async () => {
      const document = { id: 1, folder_id: 1, name: 'Contract.pdf', size: 12345 };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: document }),
      });

      const result = await getDocument(1);

      expect(result.id).toBe(1);
      expect(result.name).toBe('Contract.pdf');
    });
  });

  describe('Job Catalog Read Operations', () => {
    it('should list job roles', async () => {
      const roles = [
        { id: 1, name: 'Software Engineer', code: 'SWE' },
        { id: 2, name: 'Product Manager', code: 'PM' },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: roles }),
      });

      const result = await listJobRoles();

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Software Engineer');
    });

    it('should get a specific job role', async () => {
      const role = { id: 1, name: 'Software Engineer', code: 'SWE' };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: role }),
      });

      const result = await getJobRole(1);

      expect(result.id).toBe(1);
      expect(result.name).toBe('Software Engineer');
    });

    it('should list job levels', async () => {
      const levels = [
        { id: 1, name: 'Junior', order: 1 },
        { id: 2, name: 'Senior', order: 2 },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: levels }),
      });

      const result = await listJobLevels();

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Junior');
    });

    it('should get a specific job level', async () => {
      const level = { id: 1, name: 'Junior', order: 1 };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: level }),
      });

      const result = await getJobLevel(1);

      expect(result.id).toBe(1);
      expect(result.name).toBe('Junior');
    });
  });
});
