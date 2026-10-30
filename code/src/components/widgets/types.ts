/** Props every generative-UI widget receives for its tool part. */
export interface WidgetProps<TInput = unknown, TOutput = unknown> {
  toolCallId: string;
  state: "input-streaming" | "input-available" | "output-available" | "output-error";
  input: TInput | undefined;
  output: TOutput | undefined;
  errorText?: string;
}
