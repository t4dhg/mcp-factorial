import { describe, it, expect } from 'vitest';
import {
  EmployeeSchema,
  TeamSchema,
  LocationSchema,
  ContractSchema,
  LeaveSchema,
  LeaveTypeSchema,
  AllowanceSchema,
  ShiftSchema,
  FolderSchema,
  DocumentSchema,
  JobRoleSchema,
  JobLevelSchema,
  CreateEmployeeInputSchema,
  CreateTeamInputSchema,
  CreateLocationInputSchema,
  CreateLeaveInputSchema,
  CreateShiftInputSchema,
} from '../../schemas.js';

describe('Zod Schemas', () => {
  describe('EmployeeSchema', () => {
    it('should validate a complete employee object', () => {
      const employee = {
        id: 1,
        first_name: 'John',
        last_name: 'Doe',
        full_name: 'John Doe',
        email: 'john.doe@example.com',
        birthday_on: '1990-01-15',
        hired_on: '2023-03-01',
        start_date: '2023-03-15',
        terminated_on: null,
        gender: 'male',
        nationality: 'US',
        manager_id: 5,
        role: 'Engineer',
        timeoff_manager_id: 5,
        company_id: 1,
        legal_entity_id: 1,
        team_ids: [1, 2],
        location_id: 3,
        created_at: '2023-03-01T00:00:00Z',
        updated_at: '2023-03-01T00:00:00Z',
      };

      const result = EmployeeSchema.safeParse(employee);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe(1);
        expect(result.data.full_name).toBe('John Doe');
      }
    });

    it('should validate employee with nullable fields as null', () => {
      const employee = {
        id: 2,
        first_name: null,
        last_name: null,
        full_name: null,
        email: null,
        birthday_on: null,
        hired_on: null,
        start_date: null,
        terminated_on: null,
        gender: null,
        nationality: null,
        manager_id: null,
        role: null,
        timeoff_manager_id: null,
        company_id: null,
        legal_entity_id: null,
        team_ids: [],
        location_id: null,
        created_at: null,
        updated_at: null,
      };

      const result = EmployeeSchema.safeParse(employee);
      expect(result.success).toBe(true);
    });

    it('should default team_ids to empty array if not provided', () => {
      const employee = {
        id: 3,
        first_name: 'Jane',
        last_name: 'Doe',
        full_name: 'Jane Doe',
        email: 'jane@example.com',
        birthday_on: null,
        hired_on: null,
        start_date: null,
        terminated_on: null,
        gender: null,
        nationality: null,
        manager_id: null,
        role: null,
        timeoff_manager_id: null,
        company_id: null,
        legal_entity_id: null,
        location_id: null,
        created_at: null,
        updated_at: null,
      };

      const result = EmployeeSchema.safeParse(employee);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.team_ids).toEqual([]);
      }
    });

    it('should fail when id is missing', () => {
      const employee = {
        first_name: 'John',
        last_name: 'Doe',
      };

      const result = EmployeeSchema.safeParse(employee);
      expect(result.success).toBe(false);
    });
  });

  describe('TeamSchema', () => {
    it('should validate a team object', () => {
      const team = {
        id: 1,
        name: 'Engineering',
        description: 'Engineering team',
        company_id: 1,
        employee_ids: [1, 2, 3],
        lead_ids: [1],
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-01T00:00:00Z',
      };

      const result = TeamSchema.safeParse(team);
      expect(result.success).toBe(true);
    });

    it('should require name field', () => {
      const team = {
        id: 1,
        description: 'Missing name',
      };

      const result = TeamSchema.safeParse(team);
      expect(result.success).toBe(false);
    });

    it('should default employee_ids and lead_ids to empty arrays', () => {
      const team = {
        id: 1,
        name: 'Minimal Team',
        description: null,
        company_id: null,
        created_at: null,
        updated_at: null,
      };

      const result = TeamSchema.safeParse(team);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.employee_ids).toEqual([]);
        expect(result.data.lead_ids).toEqual([]);
      }
    });
  });

  describe('LocationSchema', () => {
    it('should validate a location object', () => {
      const location = {
        id: 1,
        name: 'New York Office',
        country: 'US',
        phone_number: '+1-555-0100',
        state: 'NY',
        city: 'New York',
        address_line_1: '123 Broadway',
        address_line_2: 'Floor 5',
        postal_code: '10001',
        company_id: 1,
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-01T00:00:00Z',
      };

      const result = LocationSchema.safeParse(location);
      expect(result.success).toBe(true);
    });
  });

  describe('LeaveSchema', () => {
    it('should validate a leave request', () => {
      const leave = {
        id: 1,
        employee_id: 5,
        leave_type_id: 2,
        start_on: '2024-01-15',
        finish_on: '2024-01-20',
        half_day: 'all_day',
        status: 'pending',
        description: 'Vacation',
        deleted_at: null,
        duration_attributes: { days: 5, hours: 40 },
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      const result = LeaveSchema.safeParse(leave);
      expect(result.success).toBe(true);
    });

    it('should validate leave status enum', () => {
      const validStatuses = ['pending', 'approved', 'declined'];

      for (const status of validStatuses) {
        const leave = {
          id: 1,
          employee_id: 5,
          leave_type_id: 2,
          start_on: '2024-01-15',
          finish_on: '2024-01-20',
          half_day: null,
          status,
          description: null,
          deleted_at: null,
          duration_attributes: null,
          created_at: null,
          updated_at: null,
        };

        const result = LeaveSchema.safeParse(leave);
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid status', () => {
      const leave = {
        id: 1,
        employee_id: 5,
        leave_type_id: 2,
        start_on: '2024-01-15',
        finish_on: '2024-01-20',
        half_day: null,
        status: 'invalid_status',
        description: null,
        deleted_at: null,
        duration_attributes: null,
        created_at: null,
        updated_at: null,
      };

      const result = LeaveSchema.safeParse(leave);
      expect(result.success).toBe(false);
    });
  });

  describe('ShiftSchema', () => {
    it('should validate a shift record', () => {
      const shift = {
        id: 1,
        employee_id: 5,
        clock_in: '2024-01-15T09:00:00Z',
        clock_out: '2024-01-15T17:00:00Z',
        worked_hours: 8,
        break_minutes: 30,
        location: 'Office',
        notes: 'Regular day',
        created_at: '2024-01-15T09:00:00Z',
        updated_at: '2024-01-15T17:00:00Z',
      };

      const result = ShiftSchema.safeParse(shift);
      expect(result.success).toBe(true);
    });

    it('should allow null clock_out for ongoing shifts', () => {
      const shift = {
        id: 1,
        employee_id: 5,
        clock_in: '2024-01-15T09:00:00Z',
        clock_out: null,
        worked_hours: null,
        break_minutes: null,
        location: null,
        notes: null,
        created_at: null,
        updated_at: null,
      };

      const result = ShiftSchema.safeParse(shift);
      expect(result.success).toBe(true);
    });
  });

  describe('DocumentSchema', () => {
    it('should validate a document object', () => {
      const doc = {
        id: 1,
        name: 'Employment Contract.pdf',
        folder_id: 10,
        employee_id: 5,
        author_id: 1,
        company_id: 1,
        public: false,
        space: 'hr',
        file_url: 'https://example.com/files/contract.pdf',
        mime_type: 'application/pdf',
        size_bytes: 1024000,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      const result = DocumentSchema.safeParse(doc);
      expect(result.success).toBe(true);
    });

    it('should default public to false', () => {
      const doc = {
        id: 1,
        name: 'Document.pdf',
        folder_id: null,
        employee_id: null,
        author_id: null,
        company_id: null,
        space: null,
        file_url: null,
        mime_type: null,
        size_bytes: null,
        created_at: null,
        updated_at: null,
      };

      const result = DocumentSchema.safeParse(doc);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.public).toBe(false);
      }
    });
  });

  describe('ContractSchema', () => {
    it('should validate a contract', () => {
      const contract = {
        id: 1,
        employee_id: 5,
        job_title: 'Senior Engineer',
        effective_on: '2024-01-01',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      const result = ContractSchema.safeParse(contract);
      expect(result.success).toBe(true);
    });
  });

  describe('AllowanceSchema', () => {
    it('should validate an allowance', () => {
      const allowance = {
        id: 1,
        employee_id: 5,
        leave_type_id: 2,
        policy_id: 1,
        balance_days: 20,
        consumed_days: 5,
        available_days: 15,
        valid_from: '2024-01-01',
        valid_to: '2024-12-31',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      const result = AllowanceSchema.safeParse(allowance);
      expect(result.success).toBe(true);
    });
  });
});

describe('Input Schemas', () => {
  describe('CreateEmployeeInputSchema', () => {
    it('should validate valid employee input', () => {
      const input = {
        first_name: 'John',
        last_name: 'Doe',
        email: 'john.doe@example.com',
        birthday_on: '1990-01-15',
        hired_on: '2024-01-01',
      };

      const result = CreateEmployeeInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should require first_name, last_name, and email', () => {
      const input = {
        first_name: 'John',
        // missing last_name and email
      };

      const result = CreateEmployeeInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should validate email format', () => {
      const input = {
        first_name: 'John',
        last_name: 'Doe',
        email: 'not-an-email',
      };

      const result = CreateEmployeeInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should validate date format (YYYY-MM-DD)', () => {
      const input = {
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@example.com',
        birthday_on: '01-15-1990', // Wrong format
      };

      const result = CreateEmployeeInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should accept valid date format', () => {
      const input = {
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@example.com',
        birthday_on: '1990-01-15', // Correct format
      };

      const result = CreateEmployeeInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should validate gender enum', () => {
      const validGenders = ['male', 'female', 'other'];

      for (const gender of validGenders) {
        const input = {
          first_name: 'John',
          last_name: 'Doe',
          email: 'john@example.com',
          gender,
        };

        const result = CreateEmployeeInputSchema.safeParse(input);
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid gender', () => {
      const input = {
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@example.com',
        gender: 'invalid',
      };

      const result = CreateEmployeeInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should validate positive team_ids', () => {
      const input = {
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@example.com',
        team_ids: [1, 2, 3],
      };

      const result = CreateEmployeeInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should reject negative team_ids', () => {
      const input = {
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@example.com',
        team_ids: [-1, 2],
      };

      const result = CreateEmployeeInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('CreateTeamInputSchema', () => {
    it('should validate valid team input', () => {
      const input = {
        name: 'Engineering',
        description: 'Engineering team',
        lead_ids: [1],
        employee_ids: [2, 3, 4],
      };

      const result = CreateTeamInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should require name', () => {
      const input = {
        description: 'Missing name',
      };

      const result = CreateTeamInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject empty name', () => {
      const input = {
        name: '',
      };

      const result = CreateTeamInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('CreateLocationInputSchema', () => {
    it('should validate valid location input', () => {
      const input = {
        name: 'New York Office',
        country: 'US',
        city: 'New York',
        address_line_1: '123 Broadway',
        postal_code: '10001',
      };

      const result = CreateLocationInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should require name', () => {
      const input = {
        country: 'US',
        city: 'New York',
      };

      const result = CreateLocationInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('CreateLeaveInputSchema', () => {
    it('should validate valid leave input', () => {
      const input = {
        employee_id: 5,
        leave_type_id: 2,
        start_on: '2024-01-15',
        finish_on: '2024-01-20',
        half_day: 'all_day',
        description: 'Vacation',
      };

      const result = CreateLeaveInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should require employee_id, leave_type_id, start_on, finish_on', () => {
      const input = {
        employee_id: 5,
        // missing other required fields
      };

      const result = CreateLeaveInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should validate half_day enum', () => {
      const validHalfDays = ['all_day', 'start', 'finish'];

      for (const half_day of validHalfDays) {
        const input = {
          employee_id: 5,
          leave_type_id: 2,
          start_on: '2024-01-15',
          finish_on: '2024-01-20',
          half_day,
        };

        const result = CreateLeaveInputSchema.safeParse(input);
        expect(result.success).toBe(true);
      }
    });
  });

  describe('CreateShiftInputSchema', () => {
    it('should validate valid shift input', () => {
      const input = {
        employee_id: 5,
        clock_in: '2024-01-15T09:00:00Z',
        clock_out: '2024-01-15T17:00:00Z',
        notes: 'Regular shift',
      };

      const result = CreateShiftInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should require employee_id and clock_in', () => {
      const input = {
        clock_out: '2024-01-15T17:00:00Z',
      };

      const result = CreateShiftInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should allow missing clock_out for ongoing shifts', () => {
      const input = {
        employee_id: 5,
        clock_in: '2024-01-15T09:00:00Z',
      };

      const result = CreateShiftInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });
  });
});
