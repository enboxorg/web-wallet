import type { BlobUrlLease } from '@enbox/browser';

import { createBlobUrlPool } from '@enbox/browser';
import { useEffect, useState } from 'react';

type BlobUrlBinding = Readonly<{
  blob: Blob;
  lease: BlobUrlLease;
}>;

const blobUrls = createBlobUrlPool();

/** Owns one renderable object URL for the supplied Blob identity. */
export function useBlobUrl(
  blob: Blob | null | undefined,
  releaseDelayMs = 0,
): string | undefined {
  const [binding, setBinding] = useState<BlobUrlBinding>();

  useEffect(() => {
    if (blob === null || blob === undefined) {
      setBinding(undefined);
      return;
    }

    const lease = blobUrls.acquire(blob);
    setBinding({ blob, lease });
    return (): void => {
      if (releaseDelayMs === 0) {
        lease.release();
      } else {
        lease.releaseAfter(releaseDelayMs);
      }
    };
  }, [blob, releaseDelayMs]);

  return binding !== undefined && binding.blob === blob
    ? binding.lease.url
    : undefined;
}
