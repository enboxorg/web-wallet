import { Fragment } from 'react';

/**
 * A module's short URI that wraps at path segments (`host/modules/enbox-profile/v1`)
 * instead of mid-word. Pair with `[overflow-wrap:anywhere]` for very long segments.
 *
 * Browsers voice each `<wbr>` as a pause ("host/ modules/ …"), so the wrapping
 * copy is hidden from assistive tech and a plain copy carries the name.
 */
export function ModuleAddress({ address }: { address: string }) {
  return (
    <>
      <span aria-hidden="true">
        {address.split('/').map((segment, index) => (
          // Segments are positional and may repeat, so the index is the key.
          <Fragment key={index}>
            {index > 0 && <>/<wbr /></>}
            {segment}
          </Fragment>
        ))}
      </span>
      <span className="sr-only">{address}</span>
    </>
  );
}
