import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { getStats, recordIgnored } from './stats';

beforeEach(() => {
  fakeBrowser.reset();
});

describe('stats', () => {
  it('cumule session et total, sans perte en concurrence', async () => {
    await Promise.all([recordIgnored(2), recordIgnored(3), recordIgnored(1)]);
    expect(await getStats()).toEqual({ session: 6, total: 6 });
  });
});
