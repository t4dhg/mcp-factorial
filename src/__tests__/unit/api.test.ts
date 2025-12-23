import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import employeesFixture from '../fixtures/employees.json' with { type: 'json' };
import teamsFixture from '../fixtures/teams.json' with { type: 'json' };
import locationsFixture from '../fixtures/locations.json' with { type: 'json' };
import contractsFixture from '../fixtures/contracts.json' with { type: 'json' };

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
  listDocuments,
  getDocument,
  clearCache,
} = await import('../../api.js');

describe('API Client', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    clearCache();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('listEmployees', () => {
    it('should fetch all employees', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => employeesFixture,
      });

      const result = await listEmployees();

      expect(mockFetch).toHaveBeenCalledOnce();
      expect(result.data).toHaveLength(3);
      expect(result.data[0].full_name).toBe('John Doe');
    });

    // Note: team_id filtering is no longer supported because team_ids is not on Employee
    // Team membership is stored on the Team object (employee_ids) not on Employee

    it('should filter by location_id client-side', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => employeesFixture,
      });

      const result = await listEmployees({ location_id: 1 });

      expect(result.data.every(e => e.location_id === 1)).toBe(true);
    });

    it('should include pagination metadata', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => employeesFixture,
      });

      const result = await listEmployees();

      expect(result.meta).toBeDefined();
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBeDefined();
    });
  });

  describe('getEmployee', () => {
    it('should fetch a specific employee', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: employeesFixture.data[0] }),
      });

      const employee = await getEmployee(1);

      expect(mockFetch).toHaveBeenCalledOnce();
      expect(employee.id).toBe(1);
      expect(employee.full_name).toBe('John Doe');
    });

    it('should throw error for invalid ID', async () => {
      await expect(getEmployee(0)).rejects.toThrow('Invalid employee ID');
      await expect(getEmployee(-1)).rejects.toThrow('Invalid employee ID');
    });
  });

  describe('searchEmployees', () => {
    it('should search employees by name', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => employeesFixture,
      });

      const results = await searchEmployees('jane');

      expect(results).toHaveLength(1);
      expect(results[0].full_name).toBe('Jane Smith');
    });

    it('should search employees by email', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => employeesFixture,
      });

      const results = await searchEmployees('bob.johnson');

      expect(results).toHaveLength(1);
      expect(results[0].email).toBe('bob.johnson@example.com');
    });

    it('should be case-insensitive', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => employeesFixture,
      });

      const results = await searchEmployees('JOHN');

      expect(results).toHaveLength(2); // John Doe and Bob Johnson
    });

    it('should throw error for short query', async () => {
      await expect(searchEmployees('a')).rejects.toThrow('at least 2 characters');
      await expect(searchEmployees('')).rejects.toThrow('at least 2 characters');
    });
  });

  describe('listTeams', () => {
    it('should fetch all teams', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => teamsFixture,
      });

      const result = await listTeams();

      expect(result.data).toHaveLength(2);
      expect(result.data[0].name).toBe('Engineering');
    });
  });

  describe('getTeam', () => {
    it('should fetch a specific team', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: teamsFixture.data[0] }),
      });

      const team = await getTeam(1);

      expect(team.id).toBe(1);
      expect(team.name).toBe('Engineering');
    });

    it('should throw error for invalid ID', async () => {
      await expect(getTeam(0)).rejects.toThrow('Invalid team ID');
    });
  });

  describe('listLocations', () => {
    it('should fetch all locations', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => locationsFixture,
      });

      const result = await listLocations();

      expect(result.data).toHaveLength(2);
      expect(result.data[0].name).toBe('Headquarters');
      expect(result.data[0].city).toBe('San Francisco');
    });
  });

  describe('getLocation', () => {
    it('should fetch a specific location', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: locationsFixture.data[1] }),
      });

      const location = await getLocation(2);

      expect(location.id).toBe(2);
      expect(location.city).toBe('Toronto');
    });

    it('should throw error for invalid ID', async () => {
      await expect(getLocation(-5)).rejects.toThrow('Invalid location ID');
    });
  });

  describe('listContracts', () => {
    it('should fetch all contracts', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => contractsFixture,
      });

      const result = await listContracts();

      expect(result.data).toHaveLength(5);
    });

    it('should filter by employee_id', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => contractsFixture,
      });

      const result = await listContracts(1);

      expect(result.data).toHaveLength(2);
      expect(result.data.every(c => c.employee_id === 1)).toBe(true);
    });

    it('should throw error for invalid employee ID', async () => {
      await expect(listContracts(-1)).rejects.toThrow('Invalid employee ID');
    });
  });

  describe('Error handling', () => {
    it('should handle 401 errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      });

      await expect(listEmployees()).rejects.toThrow('Invalid API key');
    });

    it('should handle 403 errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: async () => 'Forbidden',
      });

      await expect(listEmployees()).rejects.toThrow('Access denied');
    });

    it('should handle 404 errors', async () => {
      // Mock the direct endpoint returning 404
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => 'Not found',
      });

      // Mock the fallback list endpoint (empty employee list)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      });

      await expect(getEmployee(999)).rejects.toThrow('Employee with ID 999 not found');
    });

    it('should handle 429 rate limit errors', async () => {
      // Mock all retry attempts
      const rateLimit429 = {
        ok: false,
        status: 429,
        text: async () => 'Too many requests',
        headers: new Headers(),
      };
      mockFetch.mockResolvedValue(rateLimit429);

      await expect(listEmployees()).rejects.toThrow('Rate limit exceeded');
    });

    it('should handle timeout errors', async () => {
      // Mock all retry attempts with AbortError
      mockFetch.mockImplementation(() => {
        const error = new Error('Aborted');
        error.name = 'AbortError';
        return Promise.reject(error);
      });

      await expect(listEmployees()).rejects.toThrow('timed out');
    });
  });

  describe('API headers', () => {
    it('should include API key header', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => employeesFixture,
      });

      await listEmployees();

      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers['x-api-key']).toBe('test-api-key');
    });

    it('should include Accept header', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => employeesFixture,
      });

      await listEmployees();

      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers['Accept']).toBe('application/json');
    });
  });

  describe('Document API', () => {
    describe('listDocuments', () => {
      it('should handle documents with null name field', async () => {
        const documents = [
          {
            id: 1,
            name: null,
            folder_id: 1,
            employee_id: 123,
            author_id: 456,
            mime_type: null,
            size_bytes: null,
            company_id: null,
            public: false,
            space: null,
            file_url: null,
            created_at: null,
            updated_at: null,
          },
          {
            id: 2,
            name: 'Valid.pdf',
            folder_id: 1,
            employee_id: 123,
            author_id: 456,
            mime_type: 'application/pdf',
            size_bytes: 12345,
            company_id: null,
            public: false,
            space: null,
            file_url: 'https://example.com/file.pdf',
            created_at: '2024-01-01',
            updated_at: '2024-01-01',
          },
        ];

        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ data: documents }),
        });

        const result = await listDocuments();

        expect(result.data).toHaveLength(2);
        expect(result.data[0].name).toBeNull();
        expect(result.data[1].name).toBe('Valid.pdf');
      });

      it('should handle documents with missing metadata fields', async () => {
        const documents = [
          {
            id: 1,
            name: 'Contract.pdf',
            folder_id: 1,
            employee_id: 123,
            author_id: 456,
            mime_type: null,
            size_bytes: null,
            company_id: null,
            public: false,
            space: null,
            file_url: null,
            created_at: null,
            updated_at: null,
          },
        ];

        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ data: documents }),
        });

        const result = await listDocuments();

        expect(result.data[0].mime_type).toBeNull();
        expect(result.data[0].size_bytes).toBeNull();
      });
    });

    describe('getDocument', () => {
      it('should fetch a document by ID', async () => {
        const document = {
          id: 1,
          name: 'Contract.pdf',
          folder_id: 1,
          employee_id: 123,
          author_id: 456,
          mime_type: 'application/pdf',
          size_bytes: 12345,
          company_id: null,
          public: false,
          space: null,
          file_url: 'https://example.com/file.pdf',
          created_at: '2024-01-01',
          updated_at: '2024-01-01',
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ data: document }),
        });

        const result = await getDocument(1);

        expect(result.id).toBe(1);
        expect(result.name).toBe('Contract.pdf');
      });

      it('should use fallback when direct endpoint returns 404', async () => {
        const documents = [
          {
            id: 1,
            name: 'Contract.pdf',
            folder_id: 1,
            employee_id: 123,
            author_id: 456,
            mime_type: 'application/pdf',
            size_bytes: 12345,
            company_id: null,
            public: false,
            space: null,
            file_url: 'https://example.com/file.pdf',
            created_at: '2024-01-01',
            updated_at: '2024-01-01',
          },
          {
            id: 2,
            name: 'Policy.pdf',
            folder_id: 1,
            employee_id: 123,
            author_id: 456,
            mime_type: 'application/pdf',
            size_bytes: 67890,
            company_id: null,
            public: false,
            space: null,
            file_url: 'https://example.com/file2.pdf',
            created_at: '2024-01-01',
            updated_at: '2024-01-01',
          },
        ];

        // First call (direct endpoint) returns 404
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 404,
          text: async () => 'Not found',
        });

        // Second call (fallback list endpoint) succeeds
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ data: documents }),
        });

        const result = await getDocument(1);

        expect(mockFetch).toHaveBeenCalledTimes(2);
        expect(result.id).toBe(1);
        expect(result.name).toBe('Contract.pdf');
      });

      it('should throw error when document not found in fallback', async () => {
        const documents = [
          {
            id: 2,
            name: 'Policy.pdf',
            folder_id: 1,
            employee_id: 123,
            author_id: 456,
            mime_type: 'application/pdf',
            size_bytes: 67890,
            company_id: null,
            public: false,
            space: null,
            file_url: 'https://example.com/file2.pdf',
            created_at: '2024-01-01',
            updated_at: '2024-01-01',
          },
        ];

        // First call (direct endpoint) returns 404
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 404,
          text: async () => 'Not found',
        });

        // Second call (fallback list endpoint) succeeds but doesn't have the document
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ data: documents }),
        });

        await expect(getDocument(999)).rejects.toThrow('Document with ID 999 not found');
      });
    });
  });
});
