import { describe, expect, it } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { z } from 'zod';
import { registerTeamsTool } from '../../tools/teams.js';
import { registerAttendanceTool } from '../../tools/attendance.js';
import { CreateEmployeeInputSchema, CreateTeamInputSchema, DayInputSchema } from '../../schemas.js';

function inputSchemas(register: (server: McpServer) => void): Record<string, z.ZodTypeAny> {
  let schemas: Record<string, z.ZodTypeAny> = {};
  register({
    registerTool: (_name: string, config: { inputSchema: typeof schemas }) => {
      schemas = config.inputSchema;
    },
  } as unknown as McpServer);
  return schemas;
}

const teams = inputSchemas(registerTeamsTool);
const attendance = inputSchemas(registerAttendanceTool);
const collections = [
  ['teams.lead_ids', teams.lead_ids],
  ['teams.employee_ids', teams.employee_ids],
  ...['employee_ids', 'ids', 'segments', 'days', 'statuses', 'exclude_dates'].map(
    field => [`attendance.${field}`, attendance[field]] as const
  ),
  ['createEmployee.team_ids', CreateEmployeeInputSchema.shape.team_ids],
  ['createTeam.lead_ids', CreateTeamInputSchema.shape.lead_ids],
  ['createTeam.employee_ids', CreateTeamInputSchema.shape.employee_ids],
  ['day.segments', DayInputSchema.shape.segments],
] as const;

describe('input collection limits', () => {
  it.each(collections)(
    '%s rejects oversized input before validating its elements',
    (_name, schema) => {
      let elementsRead = 0;
      const oversized = Array(1001).fill('invalid element');
      Object.defineProperty(oversized, 0, {
        get() {
          elementsRead++;
          return 'invalid element';
        },
      });

      const result = schema.safeParse(oversized);
      expect(result.success).toBe(false);
      if (result.success) throw new Error('Oversized input was accepted');
      expect(result.error.issues).toHaveLength(1);
      expect(result.error.issues[0].code).toBe('too_big');
      expect(elementsRead).toBe(0);
    }
  );

  it('accepts the limit and preserves empty arrays used to select the whole company', () => {
    expect(teams.employee_ids.parse(Array(1000).fill(1))).toHaveLength(1000);
    expect(attendance.employee_ids.parse([])).toEqual([]);
    expect(attendance.employee_ids.parse(undefined)).toBeUndefined();
  });

  it('still rejects malformed elements within the size limit', () => {
    expect(teams.employee_ids.safeParse(['invalid']).success).toBe(false);
    expect(DayInputSchema.shape.segments.safeParse([]).success).toBe(false);
  });
});
