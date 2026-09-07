import { describe, it, expect } from 'vitest';
import { formatCategory } from '../../tools/shared.js';

describe('formatCategory', () => {
  it('points a narrowed attendance call at the guide and the prompts', () => {
    const text = formatCategory('attendance');
    expect(text).toContain('factorial://guides/registro-horario');
    expect(text).toContain('attendance_audit');
    expect(text).toContain('attendance_reconcile');
  });

  it('renders a category with no guide or prompts unchanged', () => {
    const text = formatCategory('teams');
    expect(text).toContain('Available actions');
    expect(text).not.toContain('factorial://');
  });

  it('names the available categories when asked for one that does not exist', () => {
    expect(formatCategory('nonsense')).toContain('Unknown category');
  });
});
