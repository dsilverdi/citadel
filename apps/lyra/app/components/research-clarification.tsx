import { useState } from "react";
import { ArrowLeft, ArrowRight, LoaderCircle } from "lucide-react";
import { Button, Sheet, SheetContent, cn } from "@citadel/ui";
import type { ResearchClarification } from "../../server/contracts";

export function ResearchClarificationCard({
  clarification,
  disabled,
  onSubmit,
}: {
  clarification: ResearchClarification;
  disabled: boolean;
  onSubmit: (answers: Array<{ questionId: string; answer: string }>) => Promise<void>;
}) {
  const [open, setOpen] = useState(true);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [custom, setCustom] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const question = clarification.questions[step]!;
  const last = step === clarification.questions.length - 1;
  const answer = answers[question.id] || "";

  async function next() {
    if (!answer.trim() || disabled) return;
    setError(null);
    if (!last) {
      setStep(step + 1);
      return;
    }
    try {
      await onSubmit(
        clarification.questions.map((item) => ({
          questionId: item.id,
          answer: (answers[item.id] || "").trim(),
        })),
      );
      setOpen(false);
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Unable to save your answers. Try again.",
      );
    }
  }

  return (
    <>
      <section aria-label="Research scope" className="rounded-2xl border border-border bg-card p-5">
        <h2 className="text-sm font-medium">A few questions before we start</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{clarification.summary}</p>
        <Button variant="secondary" className="mt-4" onClick={() => setOpen(true)}>
          Answer scope questions
        </Button>
      </section>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          title="Shape your research"
          description="Choose what fits, or write your own answer. Research starts only after you approve a plan."
          className="mx-auto max-w-2xl"
        >
          <div className="min-h-0 overflow-y-auto px-6 pb-6 pt-4">
            <p className="mb-5 text-xs text-muted-foreground" aria-live="polite">
              Question {step + 1} of {clarification.questions.length}
            </p>
            <fieldset disabled={disabled}>
              <legend className="mb-5 text-xl font-medium leading-7 tracking-tight">
                {question.question}
              </legend>
              <div className="space-y-2">
                {question.options.map((option, index) => (
                  <label
                    key={option.label}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors",
                      !custom[question.id] && answer === option.label
                        ? "border-foreground/30 bg-muted"
                        : "border-border hover:bg-muted/60",
                    )}
                  >
                    <input
                      type="radio"
                      name={question.id}
                      value={option.label}
                      checked={!custom[question.id] && answer === option.label}
                      onChange={() => {
                        setCustom({ ...custom, [question.id]: false });
                        setAnswers({ ...answers, [question.id]: option.label });
                      }}
                      className="mt-1 size-4 shrink-0 accent-foreground"
                    />
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium">
                        {option.label}
                        {index === question.recommendedIndex && (
                          <span className="text-[10px] font-normal text-muted-foreground">
                            Recommended
                          </span>
                        )}
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                        {option.description}
                      </span>
                    </span>
                  </label>
                ))}
                <label
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-2xl border p-4 text-sm",
                    custom[question.id] ? "border-foreground/30 bg-muted" : "border-border",
                  )}
                >
                  <input
                    type="radio"
                    name={question.id}
                    checked={!!custom[question.id]}
                    onChange={() => {
                      setCustom({ ...custom, [question.id]: true });
                      setAnswers({ ...answers, [question.id]: "" });
                    }}
                    className="size-4 accent-foreground"
                  />
                  Write my own answer
                </label>
                {custom[question.id] && (
                  <label className="block pt-2">
                    <span className="sr-only">Your answer</span>
                    <textarea
                      autoFocus
                      rows={3}
                      maxLength={1000}
                      value={answer}
                      onChange={(event) =>
                        setAnswers({ ...answers, [question.id]: event.target.value })
                      }
                      placeholder="Tell Lyra what you have in mind…"
                      className="w-full resize-y rounded-2xl border border-border bg-background p-4 text-base leading-6 outline-none focus:border-ring"
                    />
                  </label>
                )}
              </div>
            </fieldset>
            {error && (
              <p role="alert" className="mt-4 text-sm leading-6 text-muted-foreground">
                {error}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-6 py-4">
            <Button
              variant="ghost"
              disabled={step === 0 || disabled}
              onClick={() => {
                setStep(step - 1);
                setError(null);
              }}
            >
              <ArrowLeft />
              Back
            </Button>
            <Button
              disabled={disabled || !answer.trim()}
              onClick={() => {
                void next();
              }}
            >
              {disabled ? <LoaderCircle className="animate-spin" /> : null}
              {last ? "Create research plan" : "Continue"}
              {!disabled && <ArrowRight />}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
