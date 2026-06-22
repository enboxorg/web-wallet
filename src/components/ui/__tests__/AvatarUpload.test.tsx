import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { PROFILE_IMAGE_ACCEPT } from '@/lib/profile-images';
import { AvatarUpload } from '../AvatarUpload';

describe('AvatarUpload', () => {
  it('limits the file picker to supported profile image types', () => {
    render(<AvatarUpload onUpload={vi.fn()} />);

    expect(screen.getByLabelText('Avatar image file')).toHaveAttribute(
      'accept',
      PROFILE_IMAGE_ACCEPT,
    );
  });

  it('accepts JPEG images', () => {
    const onUpload = vi.fn();
    const file = new File(['avatar'], 'avatar.jpg', { type: 'image/jpeg' });

    render(<AvatarUpload onUpload={onUpload} />);

    fireEvent.change(screen.getByLabelText('Avatar image file'), {
      target: { files: [file] },
    });

    expect(onUpload).toHaveBeenCalledWith(file);
  });

  it('rejects unsupported image types with supported formats', () => {
    const onUpload = vi.fn();
    const onError = vi.fn();
    const file = new File(['avatar'], 'avatar.svg', { type: 'image/svg+xml' });

    render(<AvatarUpload onUpload={onUpload} onError={onError} />);

    fireEvent.change(screen.getByLabelText('Avatar image file'), {
      target: { files: [file] },
    });

    expect(onUpload).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith('Avatar image must be a PNG, JPEG, GIF, or WebP image.');
  });
});
