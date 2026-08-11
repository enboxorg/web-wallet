import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useBlobUrl } from '../use-blob-url';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useBlobUrl', () => {
  it('releases each Blob URL after replacement and unmount', async () => {
    const first = new Blob(['first']);
    const second = new Blob(['second']);
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL')
      .mockReturnValueOnce('blob:first')
      .mockReturnValueOnce('blob:second');
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL')
      .mockImplementation(() => {});
    const { result, rerender, unmount } = renderHook(
      ({ blob }) => useBlobUrl(blob),
      { initialProps: { blob: first } },
    );

    await waitFor(() => expect(result.current).toBe('blob:first'));

    rerender({ blob: second });
    await waitFor(() => expect(result.current).toBe('blob:second'));
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:first');

    unmount();
    expect(createObjectUrl).toHaveBeenCalledTimes(2);
    expect(revokeObjectUrl).toHaveBeenLastCalledWith('blob:second');
  });

  it('can defer the final release for an already-rendered URL', () => {
    const profile = new Blob(['profile']);
    vi.useFakeTimers();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:profile');
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL')
      .mockImplementation(() => {});
    const { result, unmount } = renderHook(() => (
      useBlobUrl(profile, 60_000)
    ));

    expect(result.current).toBe('blob:profile');
    unmount();
    expect(revokeObjectUrl).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(60_000));
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:profile');
  });
});
