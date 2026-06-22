import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { PROFILE_IMAGE_ACCEPT } from '@/lib/profile-images';
import { BannerUpload } from '../BannerUpload';

describe('BannerUpload', () => {
  it('limits the file picker to supported profile image types', () => {
    render(<BannerUpload onUpload={vi.fn()} />);

    expect(screen.getByLabelText('Banner image file')).toHaveAttribute(
      'accept',
      PROFILE_IMAGE_ACCEPT,
    );
  });

  it('accepts WebP images', () => {
    const onUpload = vi.fn();
    const file = new File(['banner'], 'banner.webp', { type: 'image/webp' });

    render(<BannerUpload onUpload={onUpload} />);

    fireEvent.change(screen.getByLabelText('Banner image file'), {
      target: { files: [file] },
    });

    expect(onUpload).toHaveBeenCalledWith(file);
  });

  it('rejects unsupported image types with supported formats', () => {
    const onUpload = vi.fn();
    const onError = vi.fn();
    const file = new File(['banner'], 'banner.svg', { type: 'image/svg+xml' });

    render(<BannerUpload onUpload={onUpload} onError={onError} />);

    fireEvent.change(screen.getByLabelText('Banner image file'), {
      target: { files: [file] },
    });

    expect(onUpload).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith('Banner image must be a PNG, JPEG, GIF, or WebP image.');
  });
});
