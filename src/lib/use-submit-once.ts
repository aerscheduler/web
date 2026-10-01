import * as React from "react";

/**
 * One save per opening of a dialog. A double click, or a second click while the dialog is
 * closing, used to save twice: two identical charge lines on a job (billed twice), two job
 * numbers for one aircraft, two owner calls. A disabled button is not enough on its own:
 * `isPending` reaches React a tick after the first click, and a same-millisecond second click
 * gets through. A ref is synchronous.
 *
 * `begin()` is true for the first save and false after it until the dialog opens again;
 * `fail()` allows another try after a save that failed.
 */
export function useSubmitOnce(open: boolean) {
  const busy = React.useRef(false);
  React.useEffect(() => {
    if (open) busy.current = false;
  }, [open]);
  return React.useMemo(
    () => ({
      begin: () => {
        if (busy.current) return false;
        busy.current = true;
        return true;
      },
      fail: () => {
        busy.current = false;
      },
    }),
    []
  );
}
