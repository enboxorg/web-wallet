import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import CreateIdentityPage from '../CreateIdentityPage';

const mocks = vi.hoisted(() => ({
  dwnEndpoints: ['https://actor-a.example/dwn'],
  mutate: vi.fn(),
}));

vi.mock('@/enbox/hooks/use-auth', () => ({
  useAuth: () => ({ dwnEndpoints: mocks.dwnEndpoints }),
}));
vi.mock('@/enbox/hooks/use-identity-mutations', () => ({
  useCreateIdentity: () => ({ error: null, isPending: false, mutate: mocks.mutate }),
}));
vi.mock('@/lib/identity-generators', () => ({
  generateName: () => 'Test Identity',
  generateAvatar: async () => new Blob(['avatar'], { type: 'image/png' }),
  generateBanner: async () => new Blob(['banner'], { type: 'image/png' }),
}));
vi.mock('@/components/ui/AvatarUpload', () => ({ AvatarUpload: () => <div /> }));
vi.mock('@/components/ui/BannerUpload', () => ({ BannerUpload: () => <div /> }));
vi.mock('@/components/ui/EndpointHealth', () => ({ EndpointHealth: () => null }));

describe('CreateIdentityPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  });

  it('starts a new identity with the wallet DWN defaults', async () => {
    render(
      <MemoryRouter>
        <CreateIdentityPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('https://actor-a.example/dwn')).toBeInTheDocument();
  });
});
