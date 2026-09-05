import { describe, it, expect } from 'vitest';
import type { z } from 'zod';
import employeesFixture from '../fixtures/employees.json' with { type: 'json' };
import teamsFixture from '../fixtures/teams.json' with { type: 'json' };
import locationsFixture from '../fixtures/locations.json' with { type: 'json' };
import contractsFixture from '../fixtures/contracts.json' with { type: 'json' };
import leaveTypesFixture from '../fixtures/leave-types.json' with { type: 'json' };
import allowancesFixture from '../fixtures/allowances.json' with { type: 'json' };
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
  // The fixtures are captured from live API 2026-07-01 responses (personal
  // data replaced by placeholders), so parsing them is the schema-vs-reality
  // check. Leave and Shift are excluded on purpose: their field sets are still
  // the pre-2026 ones and are reworked with the attendance feature.
  describe('fixtures captured from API 2026-07-01', () => {
    const cases: Array<[string, z.ZodTypeAny, unknown[]]> = [
      ['EmployeeSchema', EmployeeSchema, employeesFixture.data],
      ['TeamSchema', TeamSchema, teamsFixture.data],
      ['LocationSchema', LocationSchema, locationsFixture.data],
      ['ContractSchema', ContractSchema, contractsFixture.data],
      ['LeaveTypeSchema', LeaveTypeSchema, leaveTypesFixture.data],
      ['AllowanceSchema', AllowanceSchema, allowancesFixture.data],
    ];

    for (const [name, schema, records] of cases) {
      it(`${name} accepts every fixture record`, () => {
        expect(records.length).toBeGreaterThan(0);
        for (const record of records) {
          const result = schema.safeParse(record);
          if (!result.success) {
            throw new Error(`${name} rejected a fixture record: ${result.error.message}`);
          }
        }
      });
    }
  });

  describe('identifiers are strings since API 2026-07-01', () => {
    it('should accept string identifiers', () => {
      const result = TeamSchema.safeParse({ ...teamsFixture.data[0], id: '36893488147419100' });
      expect(result.success).toBe(true);
    });

    it('should reject numeric identifiers', () => {
      const schemas: Array<[z.ZodTypeAny, Record<string, unknown>]> = [
        [EmployeeSchema, employeesFixture.data[0]],
        [TeamSchema, teamsFixture.data[0]],
        [LocationSchema, locationsFixture.data[0]],
        [ContractSchema, contractsFixture.data[0]],
        [LeaveTypeSchema, leaveTypesFixture.data[0]],
        [AllowanceSchema, allowancesFixture.data[0]],
      ];
      for (const [schema, record] of schemas) {
        expect(schema.safeParse({ ...record, id: 1 }).success).toBe(false);
      }
      expect(LeaveSchema.safeParse({ ...leave, employee_id: 5 }).success).toBe(false);
      expect(ShiftSchema.safeParse({ ...shift, id: 1 }).success).toBe(false);
    });
  });

  describe('EmployeeSchema', () => {
    it('should accept a record with only the required fields', () => {
      const employee = {
        id: '3',
        first_name: 'Jane',
        last_name: 'Doe',
        full_name: 'Jane Doe',
        email: 'jane@example.com',
        birthday_on: null,
        terminated_on: null,
        gender: null,
        nationality: null,
        manager_id: null,
        timeoff_manager_id: null,
        company_id: null,
        legal_entity_id: null,
        location_id: null,
        created_at: null,
        updated_at: null,
      };

      const result = EmployeeSchema.safeParse(employee);
      expect(result.success).toBe(true);
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
    it('should require name field', () => {
      const team = {
        id: '1',
        description: 'Missing name',
      };

      const result = TeamSchema.safeParse(team);
      expect(result.success).toBe(false);
    });

    it('should default employee_ids and lead_ids to empty arrays', () => {
      const team = {
        id: '1',
        name: 'Minimal Team',
        description: null,
        company_id: null,
      };

      const result = TeamSchema.safeParse(team);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.employee_ids).toEqual([]);
        expect(result.data.lead_ids).toEqual([]);
      }
    });
  });

  const leave = {
    id: '1',
    employee_id: '5',
    leave_type_id: '2',
    start_on: '2024-01-15',
    finish_on: '2024-01-20',
    half_day: 'all_day',
    status: 'pending',
    description: 'Vacation',
    deleted_at: null,
    duration_attributes: { days: 5, hours: 40 },
    days_taken: 5,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  };

  describe('LeaveSchema', () => {
    it('should validate a leave request', () => {
      const result = LeaveSchema.safeParse(leave);
      expect(result.success).toBe(true);
    });

    it('should accept a record without days_taken (pre-2026-01-01 shape)', () => {
      const { days_taken: _omitted, ...withoutDaysTaken } = leave;
      expect(LeaveSchema.safeParse(withoutDaysTaken).success).toBe(true);
    });

    it('should validate leave status enum', () => {
      const validStatuses = ['pending', 'approved', 'declined'];

      for (const status of validStatuses) {
        const result = LeaveSchema.safeParse({ ...leave, status });
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid status', () => {
      const result = LeaveSchema.safeParse({ ...leave, status: 'invalid_status' });
      expect(result.success).toBe(false);
    });
  });

  const shift = {
    id: '1',
    employee_id: '5',
    clock_in: '2024-01-15T09:00:00Z',
    clock_out: '2024-01-15T17:00:00Z',
    worked_hours: 8,
    break_minutes: 30,
    location: 'Office',
    notes: 'Regular day',
    created_at: '2024-01-15T09:00:00Z',
    updated_at: '2024-01-15T17:00:00Z',
  };

  describe('ShiftSchema', () => {
    it('should validate a shift record', () => {
      const result = ShiftSchema.safeParse(shift);
      expect(result.success).toBe(true);
    });

    it('should allow null clock_out for ongoing shifts', () => {
      const result = ShiftSchema.safeParse({
        ...shift,
        clock_out: null,
        worked_hours: null,
        break_minutes: null,
        location: null,
        notes: null,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('FolderSchema', () => {
    it('should validate a folder object', () => {
      const folder = {
        id: '10',
        name: 'Payslips',
        parent_folder_id: null,
        company_id: '1',
        active: true,
        space: 'employee_my_documents',
      };

      const result = FolderSchema.safeParse(folder);
      expect(result.success).toBe(true);
    });
  });

  describe('DocumentSchema', () => {
    const doc = {
      id: '1',
      filename: 'Employment Contract.pdf',
      extension: 'pdf',
      content_type: 'application/pdf',
      file_size: 1024000,
      folder_id: '10',
      employee_id: '5',
      author_id: '1',
      company_id: '1',
      leave_id: null,
      public: false,
      space: 'employee_my_documents',
      is_company_document: false,
      is_management_document: false,
      is_pending_assignment: false,
      signature_status: 'completed',
      signees: ['5'],
      deleted_at: null,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    };

    it('should validate a document object', () => {
      const result = DocumentSchema.safeParse(doc);
      expect(result.success).toBe(true);
    });

    it('should default public to false', () => {
      const { public: _omitted, ...withoutPublic } = doc;
      const result = DocumentSchema.safeParse(withoutPublic);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.public).toBe(false);
      }
    });

    it('should reject the pre-2026 field names', () => {
      const legacy = { ...doc, name: doc.filename, mime_type: doc.content_type };
      const { filename: _f, ...withoutFilename } = legacy;
      expect(DocumentSchema.safeParse(withoutFilename).success).toBe(false);
    });
  });

  describe('JobRoleSchema and JobLevelSchema', () => {
    it('should validate a job role', () => {
      const role = {
        id: '425573',
        company_id: '1',
        name: 'Customer Success Specialist',
        description: '',
        archived: false,
        legal_entities_ids: ['1'],
        supervisors_ids: ['5'],
        competencies_ids: [],
      };
      expect(JobRoleSchema.safeParse(role).success).toBe(true);
    });

    it('should validate a job level', () => {
      const level = {
        id: '795352',
        role_id: '425573',
        name: '__default__',
        role_name: 'Customer Success Specialist',
        order: 0,
        archived: false,
        is_default: true,
      };
      expect(JobLevelSchema.safeParse(level).success).toBe(true);
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
