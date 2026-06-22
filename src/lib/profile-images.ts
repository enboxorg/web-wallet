export const PROFILE_IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
] as const;

export const PROFILE_IMAGE_ACCEPT = PROFILE_IMAGE_MIME_TYPES.join(',');
export const PROFILE_IMAGE_FORMAT_LABEL = 'PNG, JPEG, GIF, or WebP';

export function profileImageTypeError(label = 'Image'): string {
  return `${label} must be a ${PROFILE_IMAGE_FORMAT_LABEL} image.`;
}

export function isSupportedProfileImageType(type: string | undefined): boolean {
  if (!type) return false;
  return PROFILE_IMAGE_MIME_TYPES.includes(
    type.toLowerCase() as (typeof PROFILE_IMAGE_MIME_TYPES)[number],
  );
}

export function validateProfileImageBlob(blob: Blob, label = 'Image'): string | undefined {
  return isSupportedProfileImageType(blob.type)
    ? undefined
    : profileImageTypeError(label);
}

export function normalizeProfileImageBlob(blob: Blob, label = 'Image'): Blob {
  const normalizedType = blob.type.toLowerCase();
  if (!isSupportedProfileImageType(normalizedType)) {
    throw new Error(profileImageTypeError(label));
  }

  // `@enbox/api` accepts Blob but not File. Slicing preserves bytes and MIME
  // while stripping File-specific runtime type information.
  return blob.slice(0, blob.size, normalizedType);
}
