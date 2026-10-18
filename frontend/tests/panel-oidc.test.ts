import { describe, expect, it } from 'vitest';
import { beginPanelLogin, getPanelUserManager, restorePanelUser } from '../src/auth/panel-oidc';

describe('shared panel OIDC session (stubbed – no auth)', () => {
  it('restorePanelUser returns null without external identity', async () => {
    await expect(restorePanelUser()).resolves.toBeNull();
  });

  it('beginPanelLogin is a no-op', async () => {
    await expect(beginPanelLogin('/')).resolves.toBeUndefined();
  });

  it('getPanelUserManager returns null', () => {
    expect(getPanelUserManager()).toBeNull();
  });
});
