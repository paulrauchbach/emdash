import { describe, expect, it } from 'vitest';
import { sandcastleTaskOptionsSchema } from './sandcastle';

describe('sandcastleTaskOptionsSchema', () => {
  it('accepts isolated providers for mounted projects', () => {
    expect(
      sandcastleTaskOptionsSchema.safeParse({
        projectId: 'project-1',
        agentModel: 'claude-sonnet-4-6',
        prompt: 'Fix the test',
        branch: 'agent/task',
        provider: 'docker',
      }).success
    ).toBe(true);
  });

  it('rejects unsupported and unsandboxed providers', () => {
    expect(
      sandcastleTaskOptionsSchema.safeParse({
        projectId: 'project-1',
        agentModel: 'claude-sonnet-4-6',
        prompt: 'Fix the test',
        branch: 'agent/task',
        provider: 'no-sandbox',
      }).success
    ).toBe(false);
    expect(
      sandcastleTaskOptionsSchema.safeParse({
        projectId: 'project-1',
        agentModel: 'claude-sonnet-4-6',
        prompt: 'Fix the test',
        branch: 'agent/task',
        provider: 'vercel',
      }).success
    ).toBe(false);
  });

  it('rejects branch names containing control characters', () => {
    expect(
      sandcastleTaskOptionsSchema.safeParse({
        projectId: 'project-1',
        agentModel: 'claude-sonnet-4-6',
        prompt: 'Fix the test',
        branch: 'agent/task\nmalicious',
        provider: 'docker',
      }).success
    ).toBe(false);
  });
});
