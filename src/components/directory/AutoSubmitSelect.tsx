"use client";

import type { ComponentProps } from "react";

/** A select that submits its GET form on change. Without JavaScript the form's own submit button still applies it. */
export function AutoSubmitSelect(props: ComponentProps<"select">) {
  return <select {...props} onChange={(event) => event.currentTarget.form?.requestSubmit()} />;
}
